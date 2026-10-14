import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createHttpApp } from "./http.js";
import { createSessions } from "./sessions.js";
import { autoRegisterModules } from "../registry/auto-loader.js";
import type { AppContext } from "../context.js";
import type { Server } from "node:http";

const STATIC_DIR = fileURLToPath(new URL("../web/public", import.meta.url));

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

async function createMcpServer(ctx: AppContext): Promise<McpServer> {
  const server = new McpServer({ name: "sidekick", version: ctx.config.version });
  await autoRegisterModules(server, ctx);
  ensureToolsCapability(server);
  return server;
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeHttp(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
    server.closeAllConnections();
  });
}

async function bootHttp(ctx: AppContext): Promise<void> {
  const { config, log, clock } = ctx;
  const sessions = createSessions({ createServer: () => createMcpServer(ctx), clock, log });
  const httpServer = createServer(createHttpApp({ ctx, sessions, staticDir: STATIC_DIR }));
  await listen(httpServer, config.port, config.host);
  log({ event: "listening", detail: `http://${config.host}:${String(config.port)}/mcp` });

  const shutdown = (): void => {
    log({ event: "shutdown" });
    void sessions
      .closeAll()
      .then(() => closeHttp(httpServer))
      .then(() => {
        process.exit(0);
      });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export async function boot(ctx: AppContext): Promise<void> {
  process.on("exit", () => {
    ctx.db.$client.close();
  });

  if (ctx.config.transport === "stdio") {
    await (await createMcpServer(ctx)).connect(new StdioServerTransport());
    ctx.log({ event: "listening", detail: "stdio" });
    return;
  }
  await bootHttp(ctx);
}
