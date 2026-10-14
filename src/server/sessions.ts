import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { failure } from "../core/log.js";
import type { Clock } from "../core/clock.js";
import type { Log } from "../core/log.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const SESSION_HEADER = "mcp-session-id";
const MAX_SESSIONS = 20;
const IDLE_SECONDS = 30 * 60;

const SESSION_NOT_FOUND = { status: 404, code: -32001, message: "Session not found. Send initialize again." };
const MISSING_SESSION = { status: 400, code: -32600, message: "Missing Mcp-Session-Id header. Send initialize first." };

type Session = {
  transport: StreamableHTTPServerTransport;
  lastSeen: number;
};

export type SessionOptions = {
  createServer: () => Promise<McpServer>;
  clock: Clock;
  log: Log;
  maxSessions?: number;
  idleSeconds?: number;
};

export type Sessions = {
  handle: (req: IncomingMessage, res: ServerResponse, body: unknown) => Promise<void>;
  closeAll: () => Promise<void>;
  size: () => number;
};

export type RpcFault = { status: number; code: number; message: string };

export function sendRpcError(res: ServerResponse, { status, code, message }: RpcFault): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

function sessionIdOf(req: IncomingMessage): string | undefined {
  const header = req.headers[SESSION_HEADER];
  return Array.isArray(header) ? header[0] : header;
}

/*
 * One McpServer plus one transport per client session: the SDK transport serves
 * a single initialize, so sharing one breaks reconnects (ADR-004). Idle sessions
 * are swept on the next request rather than by a timer, which keeps the clock
 * injectable and leaves no handle to unref.
 */
export function createSessions(options: SessionOptions): Sessions {
  const { createServer, clock, log } = options;
  const maxSessions = options.maxSessions ?? MAX_SESSIONS;
  const idleSeconds = options.idleSeconds ?? IDLE_SECONDS;
  const sessions = new Map<string, Session>();

  const closeQuietly = async (transport: StreamableHTTPServerTransport): Promise<void> => {
    try {
      await transport.close();
    } catch (error) {
      log(failure("session_close_failed", error));
    }
  };

  const sweep = async (): Promise<void> => {
    const cutoff = clock.now() - idleSeconds;
    const idle = [...sessions.values()].filter((session) => session.lastSeen < cutoff);
    await Promise.all(idle.map((session) => closeQuietly(session.transport)));
  };

  const makeRoom = async (): Promise<void> => {
    if (sessions.size < maxSessions) return;
    const oldest = [...sessions.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (oldest !== undefined) await closeQuietly(oldest.transport);
  };

  const open = async (req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> => {
    await makeRoom();
    const server = await createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, lastSeen: clock.now() });
        log({ event: "session_opened", ok: true, detail: String(sessions.size) });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId !== undefined) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> => {
    await sweep();
    const id = sessionIdOf(req);
    const session = id === undefined ? undefined : sessions.get(id);
    if (session !== undefined) {
      session.lastSeen = clock.now();
      await session.transport.handleRequest(req, res, body);
    } else if (id !== undefined) {
      sendRpcError(res, SESSION_NOT_FOUND);
    } else if (req.method === "POST" && isInitializeRequest(body)) {
      await open(req, res, body);
    } else {
      sendRpcError(res, MISSING_SESSION);
    }
  };

  return {
    handle,
    closeAll: async () => {
      await Promise.all([...sessions.values()].map((session) => closeQuietly(session.transport)));
    },
    size: () => sessions.size,
  };
}
