/**
 * @typedef {{ method: string, tool?: string, args?: unknown, status: number, ms: number, request: unknown, response: unknown }} TraceDetail
 * @typedef {{ content: Array<{ type: string, text?: string }>, isError?: boolean, _meta?: Record<string, unknown> }} ToolResult
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const NOT_FOUND = 404;
const ACCEPTED = 202;

/** A transport or protocol failure; `status` is 0 when the server was unreachable. */
export class McpClientError extends Error {
  constructor(message, { status = 0, code } = {}) {
    super(message);
    this.name = "McpClientError";
    this.status = status;
    this.code = code;
  }
}

const parseSseEvent = (event) => {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (data === "") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
};

const readSseReply = async (response, id) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const message = parseSseEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (message?.id === id) return message;
        end = buffer.indexOf("\n\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  throw new McpClientError("The reply stream ended early.", { status: response.status });
};

const readJsonReply = async (response) => {
  try {
    return await response.json();
  } catch {
    throw new McpClientError("The server sent a reply that is not JSON.", { status: response.status });
  }
};

/**
 * Minimal MCP Streamable HTTP client: handshake, session and protocol headers,
 * JSON and SSE replies, one transparent re-initialise on 404, and a `trace`
 * event per HTTP exchange for the tool-call drawer.
 * @param {{ endpoint?: string, fetchImpl?: typeof fetch }} [options]
 */
export function createMcpClient({ endpoint = "/mcp", fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  const trace = new EventTarget();
  let sessionId;
  let protocolVersion;
  /** @type {Promise<void> | undefined} */
  let connecting;
  let nextId = 0;

  const emit = (detail) => trace.dispatchEvent(new CustomEvent("trace", { detail }));

  const headers = () => ({
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(sessionId === undefined ? {} : { "Mcp-Session-Id": sessionId }),
    ...(protocolVersion === undefined ? {} : { "MCP-Protocol-Version": protocolVersion }),
  });

  const post = async (message) => {
    const started = performance.now();
    let response;
    try {
      response = await fetchImpl(endpoint, { method: "POST", headers: headers(), body: JSON.stringify(message) });
    } catch {
      throw new McpClientError("Sidekick is unreachable.");
    }
    return { response, started };
  };

  const exchange = async (message) => {
    const { response, started } = await post(message);
    const isNotification = message.id === undefined;
    let reply;
    if (response.ok && !isNotification) {
      const isStream = (response.headers.get("content-type") ?? "").includes("text/event-stream");
      reply = isStream ? await readSseReply(response, message.id) : await readJsonReply(response);
    } else if (!response.ok) {
      reply = await response.json().catch(() => undefined);
    }
    emit({
      method: message.method,
      tool: message.params?.name,
      args: message.params?.arguments,
      status: response.status,
      ms: Math.round(performance.now() - started),
      request: message,
      response: reply,
    });
    return { response, reply };
  };

  const initialise = async () => {
    sessionId = undefined;
    protocolVersion = undefined;
    const { response, reply } = await exchange({
      jsonrpc: "2.0",
      id: ++nextId,
      method: "initialize",
      params: {
        protocolVersion: SUPPORTED_VERSIONS[0],
        capabilities: {},
        clientInfo: { name: "sidekick-web", version: "1.0.0" },
      },
    });
    const negotiated = reply?.result?.protocolVersion;
    if (!response.ok || negotiated === undefined) {
      throw new McpClientError("Sidekick could not start a session.", { status: response.status });
    }
    if (!SUPPORTED_VERSIONS.includes(negotiated)) {
      throw new McpClientError(`Sidekick speaks MCP ${negotiated}, which this page does not support.`);
    }
    sessionId = response.headers.get("mcp-session-id") ?? undefined;
    protocolVersion = negotiated;
    const { response: ack } = await exchange({ jsonrpc: "2.0", method: "notifications/initialized" });
    if (ack.status !== ACCEPTED) throw new McpClientError("Sidekick did not accept the handshake.", { status: ack.status });
  };

  /** @returns {Promise<void>} */
  const connect = () => {
    connecting ??= initialise().finally(() => {
      connecting = undefined;
    });
    return connecting;
  };

  /*
   * A 404 means the server forgot the session (restart, idle eviction). A fetch
   * failure on a session we hold usually means the keep-alive socket died with
   * the old process. Both are cured by one fresh handshake and one retry.
   */
  const request = async (method, params) => {
    if (sessionId === undefined) await connect();
    const send = () => exchange({ jsonrpc: "2.0", id: ++nextId, method, params });
    let outcome = await send().catch((error) => (error.status === 0 ? undefined : Promise.reject(error)));
    if (outcome === undefined || outcome.response.status === NOT_FOUND) {
      await connect();
      outcome = await send();
    }
    const { response, reply } = outcome;
    if (reply?.error !== undefined) {
      throw new McpClientError(reply.error.message, { status: response.status, code: reply.error.code });
    }
    if (!response.ok || reply?.result === undefined) {
      throw new McpClientError("Sidekick could not answer that.", { status: response.status });
    }
    return reply.result;
  };

  return {
    trace,
    connect,
    /** @returns {Promise<Array<{ name: string, description?: string }>>} */
    listTools: async () => (await request("tools/list", {})).tools,
    /** @returns {Promise<ToolResult>} */
    callTool: (name, args = {}) => request("tools/call", { name, arguments: args }),
    close: async () => {
      if (sessionId === undefined) return;
      await fetchImpl(endpoint, { method: "DELETE", headers: headers() }).catch(() => undefined);
      sessionId = undefined;
      protocolVersion = undefined;
    },
  };
}
