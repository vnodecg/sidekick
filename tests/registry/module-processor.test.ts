import assert from "node:assert";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { processModule } from "../../src/registry/module-processor.js";
import { makeContext } from "../helpers/index.js";

const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

function newServer(): McpServer {
  return new McpServer({ name: "sidekick", version: "0.0.0" });
}

async function negotiatedVersion(requested: string): Promise<unknown> {
  const server = newServer();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const reply = new Promise<unknown>((resolve) => {
    clientSide.onmessage = (message): void => {
      resolve("result" in message ? (message.result as { protocolVersion?: unknown }).protocolVersion : message);
    };
  });
  await clientSide.start();
  await clientSide.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: requested, capabilities: {}, clientInfo: { name: "probe", version: "0" } },
  });
  const version = await reply;
  await server.close();
  return version;
}

describe("processModule", () => {
  it("registers a module that adds several tools", async () => {
    const server = newServer();
    const { ctx, lines } = makeContext();
    const result = await processModule(fixture("multi-tool.ts"), server, ctx);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(lines.map((line) => JSON.parse(line) as object), [
      { ts: "2027-01-15T08:00:00.000Z", event: "module_registered", module: "tool/fixture", ok: true },
    ]);

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const tools = await client.listTools();
    assert.deepStrictEqual(tools.tools.map((tool) => tool.name).sort(), ["alpha", "beta"]);
    const called = await client.callTool({ name: "alpha", arguments: { n: 7 } });
    assert.deepStrictEqual(called.content, [{ type: "text", text: "7" }]);
    await client.close();
  });

  it("logs a module without a valid default export instead of throwing", async () => {
    const { ctx, lines } = makeContext();
    const result = await processModule(fixture("not-a-module.ts"), newServer(), ctx);
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(lines.map((line) => JSON.parse(line) as object), [
      {
        ts: "2027-01-15T08:00:00.000Z",
        event: "module_load_failed",
        ok: false,
        errClass: "Error",
        detail: "Invalid RegisterableModule format",
        module: "not-a-module.ts",
      },
    ]);
  });
});

describe("SDK protocol negotiation (ADR-002, Q2)", () => {
  it("speaks spec 2025-11-25", async () => {
    assert.strictEqual(LATEST_PROTOCOL_VERSION, "2025-11-25");
    assert.strictEqual(await negotiatedVersion("2025-11-25"), "2025-11-25");
  });

  it("answers an unknown newer version with its own latest", async () => {
    assert.strictEqual(await negotiatedVersion("2099-01-01"), "2025-11-25");
  });

  it("still accepts an older client version", async () => {
    assert.strictEqual(await negotiatedVersion("2025-06-18"), "2025-06-18");
  });
});
