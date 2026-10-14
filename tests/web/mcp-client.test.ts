import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { McpClientError, createMcpClient } from "../../src/web/public/mcp-client.js";
import { startHttp } from "../helpers/http.js";
import type { RunningHttp } from "../helpers/http.js";

type Seen = { method: string; tool?: string; status: number };

const running: Array<RunningHttp> = [];

async function start(port?: number): Promise<RunningHttp> {
  const http = await startHttp({ port });
  running.push(http);
  return http;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((http) => http.stop()));
});

function clientFor(baseUrl: string, fetchImpl: typeof fetch = fetch): { client: ReturnType<typeof createMcpClient>; seen: Array<Seen> } {
  const client = createMcpClient({ endpoint: `${baseUrl}/mcp`, fetchImpl });
  const seen: Array<Seen> = [];
  client.trace.addEventListener("trace", (event) => {
    const { method, tool, status } = (event as CustomEvent<Seen>).detail;
    seen.push({ method, tool, status });
  });
  return { client, seen };
}

function jsonFetch(replies: Array<{ status?: number; headers?: Record<string, string>; body?: unknown }>): typeof fetch {
  const queue = [...replies];
  return (() => {
    const next = queue.shift();
    if (next === undefined) throw new Error("no more scripted replies");
    return Promise.resolve(
      new Response(next.body === undefined ? null : JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: { "Content-Type": "application/json", ...next.headers },
      }),
    );
  }) as typeof fetch;
}

describe("mcp-client against the server (TC-046)", () => {
  it("performs the handshake lazily and traces every exchange", async () => {
    const { baseUrl } = await start();
    const { client, seen } = clientFor(baseUrl);
    const tools = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === "break_down_task" && (tool.description ?? "") !== ""));
    const result = await client.callTool("break_down_task", { task: "clean the kitchen" });
    assert.match(result.content[0]?.text ?? "", /^Okay\. First tiny step: /);
    assert.strictEqual(result._meta?.source, "mock");
    assert.deepStrictEqual(seen, [
      { method: "initialize", tool: undefined, status: 200 },
      { method: "notifications/initialized", tool: undefined, status: 202 },
      { method: "tools/list", tool: undefined, status: 200 },
      { method: "tools/call", tool: "break_down_task", status: 200 },
    ]);
  });

  it("shares one handshake between concurrent first calls", async () => {
    const { baseUrl, sessions } = await start();
    const { client } = clientFor(baseUrl);
    await Promise.all([client.callTool("next_step"), client.callTool("next_step"), client.listTools()]);
    assert.strictEqual(sessions.size(), 1);
  });

  it("re-initialises once after the server restarts and retries the call", async () => {
    const first = await start();
    const port = Number(new URL(first.baseUrl).port);
    const { client, seen } = clientFor(first.baseUrl);
    await client.callTool("break_down_task", { task: "clean the kitchen" });
    await first.stop();
    running.pop();
    await start(port);
    seen.length = 0;
    const [a, b] = await Promise.all([client.callTool("next_step"), client.callTool("next_step")]);
    assert.match(a.content[0]?.text ?? "", /^Nothing is waiting/);
    assert.match(b.content[0]?.text ?? "", /^Nothing is waiting/);
    assert.strictEqual(seen.filter((entry) => entry.method === "initialize").length, 1);
  });

  it("returns a tool failure as an isError result instead of throwing", async () => {
    const { baseUrl } = await start();
    const { client } = clientFor(baseUrl);
    assert.strictEqual((await client.callTool("no_such_tool")).isError, true);
  });

  it("ends the session on close", async () => {
    const { baseUrl, sessions } = await start();
    const { client } = clientFor(baseUrl);
    await client.connect();
    assert.strictEqual(sessions.size(), 1);
    await client.close();
    assert.strictEqual(sessions.size(), 0);
  });
});

describe("mcp-client edge cases", () => {
  const INIT_OK = { body: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }, headers: { "Mcp-Session-Id": "abc" } };

  it("accepts plain JSON replies and an older negotiated version", async () => {
    const calls: Array<Record<string, string>> = [];
    const scripted = jsonFetch([INIT_OK, { status: 202 }, { body: { jsonrpc: "2.0", id: 2, result: { tools: [] } } }]);
    const { client } = clientFor("http://unused.test", ((url, init) => {
      calls.push(init?.headers as Record<string, string>);
      return scripted(url, init);
    }) as typeof fetch);
    assert.deepStrictEqual(await client.listTools(), []);
    const listCall = calls[2];
    assert.deepStrictEqual([listCall?.["Mcp-Session-Id"], listCall?.["MCP-Protocol-Version"]], ["abc", "2025-06-18"]);
  });

  it("surfaces a JSON-RPC error with its code", async () => {
    const error = { code: -32601, message: "Method not found" };
    const { client } = clientFor("http://unused.test", jsonFetch([INIT_OK, { status: 202 }, { body: { jsonrpc: "2.0", id: 2, error } }]));
    await assert.rejects(client.listTools(), (caught: unknown) => caught instanceof McpClientError && caught.code === -32601);
  });

  it("refuses a protocol version it does not speak, with a readable message", async () => {
    const { client } = clientFor("http://unused.test", jsonFetch([{ body: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2030-01-01" } } }]));
    await assert.rejects(client.connect(), /2030-01-01/);
  });

  it("reports an unreachable server as status 0", async () => {
    const down = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    const { client } = clientFor("http://unused.test", down);
    await assert.rejects(client.callTool("next_step"), (error: unknown) => error instanceof McpClientError && error.status === 0);
  });

  it("can try again after a failed handshake", async () => {
    const scripted = jsonFetch([{ status: 500, body: { error: { message: "boom" } } }, INIT_OK, { status: 202 }]);
    const { client } = clientFor("http://unused.test", scripted);
    await assert.rejects(client.connect(), McpClientError);
    await client.connect();
  });
});
