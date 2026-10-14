import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { autoRegisterModules } from "../registry/auto-loader.js";
import type { AppContext } from "../context.js";

/*
 * McpServer only installs tools/list once a tool is registered. A server whose
 * modules all failed to load should still answer with an empty list, not a
 * "method not found" protocol error.
 */
function ensureToolsCapability(server: McpServer): void {
  try {
    server.server.assertCanSetRequestHandler("tools/list");
  } catch {
    return;
  }
  server.server.registerCapabilities({ tools: { listChanged: false } });
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
}

export async function boot(ctx: AppContext): Promise<void> {
  const { config, log } = ctx;
  const server = new McpServer({
    name: "sidekick",
    version: config.version,
  });

  await autoRegisterModules(server, ctx);
  ensureToolsCapability(server);
  process.on("exit", () => {
    ctx.db.$client.close();
  });

  if (config.transport === "stdio") {
    await server.connect(new StdioServerTransport());
    log({ event: "listening", detail: "stdio" });
    return;
  }

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });

  await server.connect(transport);

  app.all("/mcp", (req, res) => {
    void transport.handleRequest(req, res, req.body);
  });

  const httpServer = app.listen(config.port, config.host, () => {
    log({ event: "listening", detail: `http://${config.host}:${String(config.port)}/mcp` });
  });

  process.on("SIGINT", () => {
    log({ event: "shutdown" });
    void transport.close();
    httpServer.close(() => {
      process.exit(0);
    });
  });
}
