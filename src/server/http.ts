import { timingSafeEqual } from "node:crypto";
import express from "express";
import { z } from "zod";
import { sendRpcError } from "./sessions.js";
import { failure } from "../core/log.js";
import type { AppContext } from "../context.js";
import type { Sessions } from "./sessions.js";
import type { ErrorRequestHandler, Express, Request, RequestHandler } from "express";

const BODY_LIMIT = "64kb";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const NO_CONTENT = 204;
const CALM_FAULT = "Sorry, I couldn't do that just now. Try me again in a moment.";

const UNAUTHORIZED = { status: 401, code: -32600, message: "Missing or invalid bearer token." };
const FORBIDDEN_ORIGIN = { status: 403, code: -32600, message: "Origin not allowed." };
const NOT_JSON = { status: 415, code: -32600, message: "Content-Type must be application/json." };
const TOO_LARGE = { status: 413, code: -32600, message: "Request body too large." };
const BAD_JSON = { status: 400, code: -32700, message: "Request body is not valid JSON." };
const SERVER_FAULT = { status: 500, code: -32603, message: CALM_FAULT };
const BAD_METHOD = { status: 405, code: -32600, message: "Method not allowed." };

const CSP = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const ALLOWED_HEADERS = "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID";

const bodyErrorSchema = z.object({ type: z.string() });

export type HttpOptions = {
  ctx: AppContext;
  sessions: Sessions;
  staticDir: string;
};

/*
 * Same-origin is deliberately not accepted: under DNS rebinding the attacker's
 * Origin and Host match each other, so only loopback hosts and the explicit
 * allow-list count as trusted.
 */
function normaliseOrigins(origins: Array<string>): Set<string> {
  const normalised = new Set<string>();
  for (const origin of origins) {
    try {
      normalised.add(new URL(origin).origin);
    } catch {
      continue;
    }
  }
  return normalised;
}

function isOriginAllowed(origin: string, allowed: Set<string>): boolean {
  try {
    const { protocol, hostname, origin: normalised } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return LOOPBACK_HOSTS.has(hostname) || allowed.has(normalised);
  } catch {
    return false;
  }
}

function originGuard(allowedOrigins: Array<string>): RequestHandler {
  const allowed = normaliseOrigins(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin === undefined) {
      next();
      return;
    }
    if (!isOriginAllowed(origin, allowed)) {
      sendRpcError(res, FORBIDDEN_ORIGIN);
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    res.vary("Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      res.sendStatus(NO_CONTENT);
      return;
    }
    next();
  };
}

function tokenMatches(header: string | undefined, token: string): boolean {
  const scheme = /^Bearer /i;
  if (header === undefined || !scheme.test(header)) return false;
  const presented = Buffer.from(header.replace(scheme, ""));
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/*
 * Guards /mcp only. The static UI and /healthz stay open: they carry no data,
 * and a browser page cannot attach a header to its own navigation.
 */
function bearerGuard(token: string | undefined): RequestHandler {
  return (req, res, next) => {
    if (token === undefined || tokenMatches(req.headers.authorization, token)) {
      next();
      return;
    }
    res.setHeader("WWW-Authenticate", "Bearer");
    sendRpcError(res, UNAUTHORIZED);
  };
}

const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
};

const requireJson: RequestHandler = (req, res, next) => {
  if (req.is("application/json") === false) {
    sendRpcError(res, NOT_JSON);
    return;
  }
  next();
};

/*
 * Express recognises an error handler by its four-parameter arity, so _next must stay.
 */
function bodyErrorHandler(ctx: AppContext): ErrorRequestHandler {
  // eslint-disable-next-line max-params
  return (error: unknown, _req, res, _next) => {
    const parsed = bodyErrorSchema.safeParse(error);
    const type = parsed.success ? parsed.data.type : undefined;
    if (type === "entity.too.large") {
      sendRpcError(res, TOO_LARGE);
    } else if (type === "entity.parse.failed") {
      sendRpcError(res, BAD_JSON);
    } else {
      ctx.log(failure("http_error", error));
      sendRpcError(res, SERVER_FAULT);
    }
  };
}

function mcpHandler(ctx: AppContext, sessions: Sessions): (req: Request, res: express.Response) => Promise<void> {
  return async (req, res) => {
    try {
      await sessions.handle(req, res, req.body);
    } catch (error) {
      ctx.log(failure("mcp_request_failed", error));
      if (!res.headersSent) sendRpcError(res, SERVER_FAULT);
    }
  };
}

export function createHttpApp({ ctx, sessions, staticDir }: HttpOptions): Express {
  const { version, mockAi, allowedOrigins, authToken } = ctx.config;
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders, originGuard(allowedOrigins));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, version, mockAi });
  });

  const handle = mcpHandler(ctx, sessions);
  app.use("/mcp", bearerGuard(authToken));
  app.post("/mcp", requireJson, express.json({ limit: BODY_LIMIT }), handle);
  app.get("/mcp", handle);
  app.delete("/mcp", handle);
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    sendRpcError(res, BAD_METHOD);
  });

  app.use(express.static(staticDir));
  app.use(bodyErrorHandler(ctx));
  return app;
}
