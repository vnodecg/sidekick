# Protocol and web-client contract

Status: Draft v1 · Implements PRD §10, §12 · Spec: MCP 2025-11-25, Streamable HTTP

## 1. Endpoint

Single path `/mcp`. Methods:

| Method | Behaviour |
|---|---|
| `POST` | JSON-RPC request/notification/response. Without `Mcp-Session-Id` only `initialize` is accepted. Response is `application/json` (default) or `text/event-stream` as the SDK chooses. Notification-only body -> `202`. |
| `GET` | Opens SSE stream for server-initiated messages for the session. `405` is acceptable if unused; SDK default is kept. |
| `DELETE` | Ends session; `200`/`204`. |
| other | `405`. |

Other routes: `GET /` and static assets (web client), `GET /healthz` -> `{"ok":true,"version":"..","mockAi":bool}` (no secrets).

## 2. Handshake the client must perform

1. `POST /mcp` `initialize` `{protocolVersion: "2025-11-25", capabilities: {}, clientInfo}`.
2. Server returns `protocolVersion` (the version it supports; client accepts, else shows a clear message), `capabilities: {tools:{listChanged:false}}`, `serverInfo: {name:"sidekick", version}`, header `Mcp-Session-Id`.
3. Client `POST notifications/initialized` (required; CLAUDE.md note).
4. Client sends `MCP-Protocol-Version: <negotiated>` and `Mcp-Session-Id` on every later request.
5. `tools/list`, then `tools/call` as needed.
6. On `404` for a session id the client re-initialises transparently (server restarted or session expired).

Server advertises only `tools`. Resources and prompts capabilities are not registered (starter modules removed).

## 3. Security on the HTTP edge

| Control | Rule |
|---|---|
| Bind | `127.0.0.1` by default (`SIDEKICK_HOST`) |
| Origin | If `Origin` header present it must be in `SIDEKICK_ALLOWED_ORIGINS` or same-origin/localhost; else `403`. Prevents DNS-rebinding and drive-by calls to `delete_my_data`. |
| CORS | Allow-list echo, no `*` with credentials |
| Auth | Optional `Authorization: Bearer $SIDEKICK_AUTH_TOKEN` (P1); required when `SIDEKICK_HOST` is not loopback |
| Body | JSON only, 64 KB limit (starter 1 MB reduced) |
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
Cap of 20 concurrent sessions; the oldest idle is evicted.

## 5. Tool results on the wire

```json
{ "content":[{"type":"text","text":"Okay. First tiny step: Stand up and walk to the sink."}],
  "_meta":{"sidekick":{"source":"ai","latencyMs":1180,"taskId":7}} }
```
`structuredContent` and `outputSchema` are not used in v1 (voice assistants read `content`). `isError:true` only for server faults, with a calm fixed text.

## 6. Web client contract (`src/web/public`)

| Module | Responsibility |
|---|---|
| `mcp-client.js` | `connect()`, `listTools()`, `callTool(name, args)`; session id + protocol version headers; parses JSON and SSE bodies; single in-flight re-init on 404; exposes a `trace` event stream (request, response, ms) |
| `router.js` | `route(utterance, state) -> {tool, args}`; pure function, unit-tested in Node (ADR-007) |
| `app.js` | UI state, speech in/out, wires router -> client -> speaker, renders trace |

### Router grammar (first match wins; case-insensitive; PROPOSED A1)

| Pattern (examples) | Tool |
|---|---|
| "done", "finished", "did it", "next" after a step | `complete_step` |
| "what's next", "next step" | `next_step` |
| "i'm stuck", "frozen", "can't move" | `im_stuck` |
| "i can't start", "i need to ...", "help me ...", "i have to ..." | `break_down_task` (task = remainder, else full text) |
| "start focus", "starting work on ..." | `start_focus` |
| "how long", "time check" | `time_check` |
| "i'm done working", "stop the timer" | `end_focus` |
| "remember ...", "note ...", "brain dump ..." | `brain_dump` |
| "what did i save", "read my dump" | `sort_dump` |
| "park ...", "i'll be right back ..." | `park_my_place` |
| "where was i" | `where_was_i` |
| "pick for me", "you choose", "a or b" | `pick_for_me` |
| "low/medium/high energy", "i'm tired" | `match_energy` |
| "what now", "what should i do" | `what_now` |
| "i did ...", "log a win ..." | `log_win` |
| "my wins", "what have i done" | `my_wins` |
| "break", "dopamine" | `dopamine_menu` |
| "fresh start", "bad day" | `gentle_reset` |
| "delete my data", "erase everything" | `delete_my_data` (client asks confirm via the tool's own question) |
| fallback: >= 4 words and no active task | `break_down_task` |
| fallback otherwise | `what_now` |

The router never calls an LLM. A debug toggle shows "matched pattern X" next to the tool call.

## 7. Compatibility with other MCP clients

- Must work with MCP Inspector (`npm run inspect:http`) and one general assistant (bonus, T-091) with no special-casing.
- Tool naming, descriptions and input rules: [TOOLS.md](TOOLS.md) §0 and the per-tool sections.
