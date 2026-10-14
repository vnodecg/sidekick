import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeContext } from "./context.js";
import { createHttpApp } from "../../src/server/http.js";
import { createSessions } from "../../src/server/sessions.js";
import tasksModule from "../../src/tools/tasks.js";
import type { TestContext } from "./context.js";
import type { AppContext } from "../../src/context.js";
import type { Sessions } from "../../src/server/sessions.js";

export const PUBLIC_DIR = fileURLToPath(new URL("../../src/web/public", import.meta.url));
export const PROTOCOL_VERSION = "2025-11-25";

export type HttpOptions = {
  env?: Record<string, string>;
  port?: number;
  maxSessions?: number;
  idleSeconds?: number;
  createServer?: (ctx: AppContext) => Promise<McpServer>;
};

export type RunningHttp = TestContext & {
  baseUrl: string;
  sessions: Sessions;
  stop: () => Promise<void>;
};

async function taskServer(ctx: AppContext): Promise<McpServer> {
  const server = new McpServer({ name: "sidekick", version: ctx.config.version });
  await tasksModule.register(server, ctx);
  return server;
}

export async function startHttp(options: HttpOptions = {}): Promise<RunningHttp> {
  const test = makeContext(options.env);
  const { ctx } = test;
  const build = options.createServer ?? taskServer;
  const sessions = createSessions({
    createServer: () => build(ctx),
    clock: ctx.clock,
    log: ctx.log,
    maxSessions: options.maxSessions,
    idleSeconds: options.idleSeconds,
  });
  const server = createServer(createHttpApp({ ctx, sessions, staticDir: PUBLIC_DIR }));
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind a port");
  return {
    ...test,
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    sessions,
    stop: async () => {
      await sessions.closeAll();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      });
    },
  };
}

export type RpcReply = {
  status: number;
  headers: Headers;
  message: { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } } | undefined;
};

function messageOf(text: string, contentType: string): RpcReply["message"] {
  if (text === "") return undefined;
  const json = contentType.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  return json === "" ? undefined : (JSON.parse(json) as RpcReply["message"]);
}

export type RpcOptions = {
  sessionId?: string;
  headers?: Record<string, string>;
  rawBody?: string;
};

export async function rpc(baseUrl: string, body: unknown, options: RpcOptions = {}): Promise<RpcReply> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(options.sessionId === undefined ? {} : { "Mcp-Session-Id": options.sessionId, "MCP-Protocol-Version": PROTOCOL_VERSION }),
      ...options.headers,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, message: messageOf(text, response.headers.get("content-type") ?? "") };
}

export const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "0" } },
};

export async function openSession(baseUrl: string, headers: Record<string, string> = {}): Promise<string> {
  const init = await rpc(baseUrl, INITIALIZE, { headers });
  const sessionId = init.headers.get("mcp-session-id");
  if (init.status !== 200 || sessionId === null) throw new Error(`initialize failed with ${String(init.status)}`);
  const ack = await rpc(baseUrl, { jsonrpc: "2.0", method: "notifications/initialized" }, { sessionId });
  if (ack.status !== 202) throw new Error(`initialized notification answered ${String(ack.status)}`);
  return sessionId;
}

export function callTool(baseUrl: string, sessionId: string, name: string, args: Record<string, unknown> = {}): Promise<RpcReply> {
  return rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, { sessionId });
}
