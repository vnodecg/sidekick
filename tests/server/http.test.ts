import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { INITIALIZE, PROTOCOL_VERSION, callTool, openSession, rpc, startHttp } from "../helpers/http.js";
import type { RunningHttp } from "../helpers/http.js";

const running: Array<RunningHttp> = [];

async function start(options?: Parameters<typeof startHttp>[0]): Promise<RunningHttp> {
  const http = await startHttp(options);
  running.push(http);
  return http;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((http) => http.stop()));
});

function replyText(reply: Awaited<ReturnType<typeof callTool>>): unknown {
  const content = reply.message?.result?.content as Array<{ text: string }> | undefined;
  return content?.[0]?.text;
}

describe("sessions (TC-041..043)", () => {
  it("serves two concurrent sessions independently", async () => {
    const { baseUrl } = await start();
    const [a, b] = await Promise.all([openSession(baseUrl), openSession(baseUrl)]);
    assert.notStrictEqual(a, b);
    const [first, second] = await Promise.all([callTool(baseUrl, a, "next_step"), callTool(baseUrl, b, "next_step")]);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
  });

  it("answers an unknown session id with 404 so the client can re-initialise", async () => {
    const { baseUrl } = await start();
    const reply = await callTool(baseUrl, "no-such-session", "next_step");
    assert.strictEqual(reply.status, 404);
    assert.strictEqual(reply.message?.error?.code, -32001);
  });

  it("rejects a non-initialize request that has no session id with 400", async () => {
    const { baseUrl } = await start();
    const reply = await rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.strictEqual(reply.status, 400);
  });

  it("closes a session on DELETE and 404s afterwards", async () => {
    const { baseUrl, sessions } = await start();
    const sessionId = await openSession(baseUrl);
    assert.strictEqual(sessions.size(), 1);
    const response = await fetch(`${baseUrl}/mcp`, { method: "DELETE", headers: { "Mcp-Session-Id": sessionId } });
    assert.ok(response.ok);
    assert.strictEqual(sessions.size(), 0);
    assert.strictEqual((await callTool(baseUrl, sessionId, "next_step")).status, 404);
  });

  it("drops a session that has been idle past the limit", async () => {
    const http = await start({ idleSeconds: 60 });
    const sessionId = await openSession(http.baseUrl);
    http.tick(61);
    assert.strictEqual((await callTool(http.baseUrl, sessionId, "next_step")).status, 404);
    assert.strictEqual(http.sessions.size(), 0);
  });

  it("evicts the least recently used session when the cap is reached", async () => {
    const http = await start({ maxSessions: 2 });
    const oldest = await openSession(http.baseUrl);
    http.tick(10);
    const middle = await openSession(http.baseUrl);
    http.tick(10);
    await callTool(http.baseUrl, oldest, "next_step");
    await openSession(http.baseUrl);
    assert.strictEqual(http.sessions.size(), 2);
    assert.strictEqual((await callTool(http.baseUrl, middle, "next_step")).status, 404);
    assert.strictEqual((await callTool(http.baseUrl, oldest, "next_step")).status, 200);
  });

  it("answers a failing server factory with a calm 500, not a hang", async () => {
    const http = await start({
      createServer: () => {
        throw new Error("modules exploded");
      },
    });
    const reply = await rpc(http.baseUrl, INITIALIZE);
    assert.strictEqual(reply.status, 500);
    assert.match(reply.message?.error?.message ?? "", /Try me again/);
    assert.ok(http.lines.some((line) => line.includes("mcp_request_failed")));
  });
});

describe("origin and CORS (TC-044)", () => {
  it("rejects an unknown origin with 403", async () => {
    const { baseUrl, sessions } = await start();
    const reply = await rpc(baseUrl, INITIALIZE, { headers: { Origin: "https://evil.example" } });
    assert.strictEqual(reply.status, 403);
    assert.strictEqual(sessions.size(), 0);
  });

  it("rejects the opaque origin and non-http schemes", async () => {
    const { baseUrl } = await start();
    for (const origin of ["null", "file://", "chrome-extension://abc", "not a url"]) {
      assert.strictEqual((await rpc(baseUrl, INITIALIZE, { headers: { Origin: origin } })).status, 403, origin);
    }
  });

  it("accepts any loopback origin and echoes it for CORS", async () => {
    const { baseUrl } = await start();
    const reply = await rpc(baseUrl, INITIALIZE, { headers: { Origin: "http://localhost:6274" } });
    assert.strictEqual(reply.status, 200);
    assert.strictEqual(reply.headers.get("access-control-allow-origin"), "http://localhost:6274");
    assert.strictEqual(reply.headers.get("access-control-allow-credentials"), null);
    assert.match(reply.headers.get("access-control-expose-headers") ?? "", /Mcp-Session-Id/);
  });

  it("accepts allow-listed origins (trailing slash tolerated) and no other", async () => {
    const { baseUrl } = await start({ env: { SIDEKICK_ALLOWED_ORIGINS: "https://sidekick.example, https://other.example/, not a url" } });
    assert.strictEqual((await rpc(baseUrl, INITIALIZE, { headers: { Origin: "https://sidekick.example" } })).status, 200);
    assert.strictEqual((await rpc(baseUrl, INITIALIZE, { headers: { Origin: "https://other.example" } })).status, 200);
    assert.strictEqual((await rpc(baseUrl, INITIALIZE, { headers: { Origin: "https://third.example" } })).status, 403);
  });

  it("answers a preflight for an allowed origin with 204 and the MCP headers", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/mcp`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:5173" } });
    assert.strictEqual(response.status, 204);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /Mcp-Session-Id/);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /MCP-Protocol-Version/);
  });

  it("lets requests with no Origin header through (non-browser clients)", async () => {
    const { baseUrl } = await start();
    assert.strictEqual((await rpc(baseUrl, INITIALIZE)).status, 200);
  });
});

describe("request limits (TC-045)", () => {
  it("rejects a body over 64 KB with 413 and keeps serving", async () => {
    const { baseUrl } = await start();
    const big = JSON.stringify({ ...INITIALIZE, params: { pad: "x".repeat(70 * 1024) } });
    const reply = await rpc(baseUrl, undefined, { rawBody: big });
    assert.strictEqual(reply.status, 413);
    assert.strictEqual((await rpc(baseUrl, INITIALIZE)).status, 200);
  });

  it("rejects malformed JSON with a parse error", async () => {
    const { baseUrl } = await start();
    const reply = await rpc(baseUrl, undefined, { rawBody: "{not json" });
    assert.strictEqual(reply.status, 400);
    assert.strictEqual(reply.message?.error?.code, -32700);
  });

  it("rejects a non-JSON content type with 415", async () => {
    const { baseUrl } = await start();
    const reply = await rpc(baseUrl, undefined, { rawBody: "hello", headers: { "Content-Type": "text/plain" } });
    assert.strictEqual(reply.status, 415);
  });

  it("answers unsupported methods with 405 and an Allow header", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/mcp`, { method: "PUT" });
    assert.strictEqual(response.status, 405);
    assert.match(response.headers.get("allow") ?? "", /POST/);
  });
});

describe("healthz and static files", () => {
  it("reports health without secrets", async () => {
    const { baseUrl, ctx } = await start();
    const response = await fetch(`${baseUrl}/healthz`);
    assert.deepStrictEqual(await response.json(), { ok: true, version: ctx.config.version, mockAi: true });
  });

  it("serves the web client with a locked-down CSP", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/`);
    assert.strictEqual(response.status, 200);
    assert.match(await response.text(), /<title>Sidekick<\/title>/);
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    assert.strictEqual(response.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(response.headers.get("x-powered-by"), null);
  });

  it("negotiates the protocol version the SDK supports", async () => {
    const { baseUrl } = await start();
    const reply = await rpc(baseUrl, INITIALIZE);
    assert.strictEqual(reply.message?.result?.protocolVersion, PROTOCOL_VERSION);
  });

  it("calls a tool over a session end to end", async () => {
    const { baseUrl } = await start();
    const sessionId = await openSession(baseUrl);
    const reply = await callTool(baseUrl, sessionId, "break_down_task", { task: "clean the kitchen" });
    assert.match(String(replyText(reply)), /^Okay\. First tiny step: /);
  });
});
