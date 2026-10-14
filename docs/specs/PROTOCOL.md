# Protocol and web-client contract

Status: Draft v1 · Implements PRD §10, §12 · Spec: MCP 2025-11-25, Streamable HTTP

## 1. Endpoint

Single path `/mcp`. Methods:

| Method | Behaviour |
|---|---|
| `POST` | JSON-RPC request/notification/response. Without `Mcp-Session-Id` only `initialize` is accepted. Response is `application/json` (default) or `text/event-stream` as the SDK chooses. Notification-only body -> `202`. |
| `GET` | Opens SSE stream for server-initiated messages for the session. `405` is acceptable if unused; SDK default is kept. |
| `DELETE` | Ends session; `200`/`204`. |
| other | `405` with `Allow`. |

Failure statuses: `400` no `Mcp-Session-Id` on anything but `initialize` (or malformed JSON, code -32700); `403` Origin not allowed; `404` unknown or expired session; `413` body over 64 KB; `415` `Content-Type` is not `application/json`. All are JSON-RPC error bodies with `id: null`; none leak internals. An unexpected fault answers `500` with the calm fixed sentence and logs only the error class.

Other routes: `GET /` and static assets (web client, served from `build/web/public`), `GET /healthz` -> `{"ok":true,"version":"..","mockAi":bool}` (no secrets). Static and API responses carry `Content-Security-Policy: default-src 'self'` (no inline script or style, so the client has none), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

## 2. Handshake the client must perform

1. `POST /mcp` `initialize` `{protocolVersion: "2025-11-25", capabilities: {}, clientInfo}`.
2. Server returns `protocolVersion` (the version it supports; client accepts, else shows a clear message), `capabilities: {tools:{listChanged:false}}`, `serverInfo: {name:"sidekick", version}`, header `Mcp-Session-Id`.
3. Client `POST notifications/initialized` (required; CLAUDE.md note).
4. Client sends `MCP-Protocol-Version: <negotiated>` and `Mcp-Session-Id` on every later request.
5. `tools/list`, then `tools/call` as needed.
6. On `404` for a session id the client re-initialises transparently (server restarted or session expired). A network failure while holding a session gets the same treatment, because after a restart the browser's pooled keep-alive socket is dead; the call is retried once on the fresh session. Concurrent callers share one handshake. A tool call that died mid-flight may therefore run twice; the state-changing tools are idempotent or harmless to repeat (TOOLS.md).

Server advertises only `tools`. Resources and prompts capabilities are not registered (starter modules removed).

## 3. Security on the HTTP edge

| Control | Rule |
|---|---|
| Bind | `127.0.0.1` by default (`SIDEKICK_HOST`) |
| Origin | If `Origin` is present it must be a loopback host (`localhost`, `127.0.0.1`, `[::1]`, any port, http or https) or listed in `SIDEKICK_ALLOWED_ORIGINS` (compared by normalised origin, so a trailing slash is fine, unparsable entries are ignored); else `403`. `Origin: null` and non-http schemes are rejected. "Same-origin" is deliberately not trusted: under DNS rebinding the attacker's `Origin` and `Host` agree. Requests with no `Origin` (non-browser clients) pass. Prevents drive-by calls to `delete_my_data`. |
| CORS | Allowed origins are echoed with `Vary: Origin`; never `*`, never credentials. `OPTIONS` preflight answers `204`; exposes `Mcp-Session-Id`. |
| Auth | Optional `Authorization: Bearer $SIDEKICK_AUTH_TOKEN` (P1); required when `SIDEKICK_HOST` is not loopback |
| Body | JSON only, 64 KB limit |
| Rate | none in v1 (single user); noted in RAID |
| Logging | [SAFETY-COPY.md](SAFETY-COPY.md) §8 |

## 4. Session lifecycle

```
initialize(no session) -> create {transport, McpServer} -> store by id
request(session id)    -> route to transport
request(unknown id)    -> 404 (client re-initialises)
DELETE / idle 30 min   -> transport.close(), remove
process SIGINT/SIGTERM -> close all, close DB (flush WAL), exit 0
```
Cap of 20 concurrent sessions; the least recently used is evicted when a 21st opens. Idle sessions are swept on the next request (no timer), so memory is bounded by the cap, not by the sweep. Every session gets its own `McpServer`, so per-session tool state such as the `im_stuck` rotation resets with the session. A port already in use or any other listen error exits `1` with a `fatal` log line.

## 5. Tool results on the wire

```json
{ "content":[{"type":"text","text":"Okay. First tiny step: Stand up and walk to the sink."}],
  "_meta":{"source":"ai","latencyMs":1180,"taskId":7,"stepCount":5,"taskOpen":true} }
```
`_meta` is flat. `taskOpen` (on `break_down_task`, `next_step`, `complete_step`) tells a client whether an active task remains, so the web router never parses spoken copy to find out.
`structuredContent` and `outputSchema` are not used in v1 (voice assistants read `content`). `isError:true` only for server faults, with a calm fixed text.

## 6. Web client contract (`src/web/public`)

| Module | Responsibility |
|---|---|
| `mcp-client.js` | `connect()`, `listTools()`, `callTool(name, args)`; session id + protocol version headers; parses JSON and SSE bodies; single in-flight re-init on 404; exposes a `trace` event stream (request, response, ms) |
| `router.js` | `route(utterance, state) -> {tool, args}`; pure function, unit-tested in Node (ADR-007) |
| `app.js` | UI state, speech in/out, wires router -> client -> speaker, renders trace |

The client keeps two router inputs: `hasActiveTask` (from `_meta.taskOpen`) and `pendingDelete` (set when `delete_my_data` was called without `confirm`, so a following "yes" sends `confirm: true`). The focus clock is a client-side approximation: it starts on a successful `start_focus` and stops on `end_focus`, `gentle_reset` or `delete_my_data`. The trace drawer's source chip maps `ai` to `bedrock`.

### Router grammar (first match wins; case-insensitive; PROPOSED A1)

| Pattern (examples) | Tool |
|---|---|
| "done", "finished", "did it", "next" while a task is open (otherwise falls through to the fallbacks) | `complete_step` |
| "what's next", "next step" | `next_step` |
| "i'm stuck", "frozen", "can't move" | `im_stuck` |
| "i can't start", "i need to ...", "help me ...", "i have to ..." | `break_down_task` (task = remainder with a leading "with/on/to" dropped; no remainder -> no `task`, so the tool asks "What do you need to get started on?") |
| "start focus", "starting work on ..." | `start_focus` (`label` = remainder, `minutes` from "for 25 minutes") |
| "how long", "time check" | `time_check` |
| "i'm done working", "stop the timer" | `end_focus` |
| "remember ...", "note ...", "brain dump ..." | `brain_dump` |
| "what did i save", "read my dump" | `sort_dump` |
| "park ...", "i'll be right back ..." | `park_my_place` |
| "where was i" | `where_was_i` |
| "pick for me", "you choose", "a or b" | `pick_for_me` (`options` = remainder split on commas and "or", max 10, only when two or more; bare "a or b" only for utterances of 8 words or fewer, below the task openers) |
| "low/medium/high energy", "i'm tired" | `match_energy` (`tired/exhausted/drained` -> low, `wired` -> high) |
| "what now", "what should i do" | `what_now` |
| "i did ...", "log a win ..." | `log_win` |
| "my wins", "what have i done" | `my_wins` |
| "break", "dopamine" | `dopamine_menu` |
| "fresh start", "bad day" | `gentle_reset` |
| "delete my data", "erase everything" | `delete_my_data`; a following "yes" sends `confirm: true` |
| fallback: >= 4 words and no active task | `break_down_task` |
| fallback otherwise | `what_now` |

The router never calls an LLM. A debug toggle shows "matched pattern X" next to the tool call.

## 7. Compatibility with other MCP clients

- Must work with MCP Inspector (`npm run inspect:http`) and one general assistant (bonus, T-091) with no special-casing.
- Tool naming, descriptions and input rules: [TOOLS.md](TOOLS.md) §0 and the per-tool sections.
