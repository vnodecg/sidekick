import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { startBuilt } from "./helpers/built-server.js";
import { INITIALIZE, PROTOCOL_VERSION, callTool, openSession, rpc } from "./helpers/http.js";
import type { BuiltServer } from "./helpers/built-server.js";

const started: Array<BuiltServer> = [];
const tempDirs: Array<string> = [];

async function launch(options?: Parameters<typeof startBuilt>[0]): Promise<BuiltServer> {
  const server = await startBuilt(options);
  started.push(server);
  return server;
}

after(async () => {
  await Promise.all(started.map((server) => server.stop()));
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

type ToolSummary = { name: string; description?: string };

async function handshake(baseUrl: string): Promise<{ sessionId: string; result: Record<string, unknown> }> {
  const init = await rpc(baseUrl, INITIALIZE);
  const sessionId = init.headers.get("mcp-session-id");
  assert.strictEqual(init.status, 200);
  assert.ok(sessionId !== null && sessionId !== "");
  assert.ok(init.message?.result !== undefined);
  const ack = await rpc(baseUrl, { jsonrpc: "2.0", method: "notifications/initialized" }, { sessionId });
  assert.strictEqual(ack.status, 202);
  return { sessionId, result: init.message.result };
}

describe("protocol over real HTTP (TC-040)", () => {
  it("negotiates the protocol version and advertises only tools", async () => {
    const { baseUrl } = await launch();
    const { result } = await handshake(baseUrl);
    assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
    assert.strictEqual((result.serverInfo as { name: string }).name, "sidekick");
    assert.deepStrictEqual(Object.keys(result.capabilities as object), ["tools"]);
  });

  it("lists tools written for an LLM router and calls one", async () => {
    const { baseUrl } = await launch();
    const { sessionId } = await handshake(baseUrl);
    const list = await rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { sessionId });
    const tools = list.message?.result?.tools as Array<ToolSummary>;
    assert.ok(tools.some((tool) => tool.name === "break_down_task"));
    assert.ok(tools.every((tool) => (tool.description ?? "").startsWith("Use ")));

    const call = await callTool(baseUrl, sessionId, "break_down_task", { task: "clean the kitchen" });
    const result = call.message?.result as { content: Array<{ text: string }>; _meta: Record<string, unknown> };
    assert.match(result.content[0]?.text ?? "", /^Okay\. First tiny step: /);
    assert.strictEqual(result._meta.source, "mock");
  });

  it("serves the built web client, health and a clean 404", async () => {
    const { baseUrl } = await launch();
    const page = await fetch(`${baseUrl}/`);
    assert.match(await page.text(), /<title>Sidekick<\/title>/);
    for (const asset of ["app.js", "mcp-client.js", "router.js", "styles.css"]) {
      assert.strictEqual((await fetch(`${baseUrl}/${asset}`)).status, 200, asset);
    }
    const health = (await (await fetch(`${baseUrl}/healthz`)).json()) as { ok: boolean; mockAi: boolean };
    assert.deepStrictEqual([health.ok, health.mockAi], [true, true]);
    assert.strictEqual((await fetch(`${baseUrl}/nope`)).status, 404);
  });
});

describe("restart and shutdown (TC-102)", () => {
  it("answers an old session with 404 after a restart and keeps the data", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sidekick-protocol-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "sidekick.db");
    const first = await launch({ dbPath });
    const oldSession = await openSession(first.baseUrl);
    await callTool(first.baseUrl, oldSession, "break_down_task", { task: "clean the kitchen" });
    assert.strictEqual(await first.stop(), 0);

    const second = await launch({ dbPath, port: first.port });
    assert.strictEqual((await callTool(second.baseUrl, oldSession, "next_step")).status, 404);
    const freshSession = await openSession(second.baseUrl);
    const next = await callTool(second.baseUrl, freshSession, "next_step");
    const content = next.message?.result?.content as Array<{ text: string }>;
    assert.match(content[0]?.text ?? "", /^Next tiny step: /);
  });

  it("shuts down cleanly on SIGTERM even with an open event stream", async () => {
    const server = await launch();
    const sessionId = await openSession(server.baseUrl);
    const stream = await fetch(`${server.baseUrl}/mcp`, {
      headers: { Accept: "text/event-stream", "Mcp-Session-Id": sessionId, "MCP-Protocol-Version": PROTOCOL_VERSION },
    });
    assert.strictEqual(stream.status, 200);
    assert.strictEqual(await server.stop(), 0);
    assert.match(server.stderr(), /"event":"shutdown"/);
    await stream.body?.cancel().catch(() => undefined);
  });

  it("exits non-zero with a fatal log when the port is taken", async () => {
    const first = await launch();
    await assert.rejects(startBuilt({ port: first.port }), /exited with 1/);
  });
});
