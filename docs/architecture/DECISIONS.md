# Decision log (ADRs)

Format: context, decision, consequences. Status: `accepted`, `proposed` (needs confirmation, tracked in RAID), `superseded`.

## ADR-001: Build on the TypeScript starter, not Python · accepted
**Context.** The PRD's open questions and risk table assume a Python prototype (`mcp<2`, FastMCP). The repo is `mcp-typescript-starter` with Express, Streamable HTTP, an auto-loader, Hygen generators and CI.
**Decision.** TypeScript on the existing starter. PRD Q2 and risk R3 are re-scoped to "does the TS SDK implement 2025-11-25" (task T-003).
**Consequences.** No Python anywhere. Any prototype code must be ported, not wrapped. Resolves PRD §16 Q2.

## ADR-002: Verify and, if needed, upgrade the MCP SDK before building · accepted
**Context.** Starter pins `@modelcontextprotocol/sdk ^1.20.2`. Entry must implement spec 2025-11-25.
**Decision.** T-003 is a half-day spike gating all protocol work: check negotiated `protocolVersion`, Streamable HTTP behaviour, and `McpServer.tool` vs `registerTool` API. Upgrade within v1.x if needed. Record result here.
**Consequences.** If the SDK lags the spec, we negotiate the newest supported version and note it in Product Feedback (it is friction-log material, worth up to +10%).

## ADR-003: `node:sqlite` as the database driver · accepted
**Context.** Judges must run the repo with one command. `better-sqlite3` needs a native build/prebuilt binary per platform. `node:sqlite` ships with Node >= 22.13 without a flag (experimental warning only).
**Decision.** Use `node:sqlite`. Wrap behind `db/connection.ts` and repositories so swapping to `better-sqlite3` touches one file. Raise `engines.node` to `>=22.13` and update `.nvmrc` and Dockerfile base image.
**Consequences.** API is marked experimental; pin Node major in CI. Warning is suppressed in logs with `--disable-warning=ExperimentalWarning` in the start script.

## ADR-004: Stateful sessions, one transport + server per session · accepted
**Context.** See [ARCHITECTURE.md](ARCHITECTURE.md) §8.
**Decision.** One transport and server per session, keyed by `mcp-session-id`; lifecycle in [PROTOCOL.md](../specs/PROTOCOL.md) §4. All sessions share one DB handle.
**Alternative rejected:** stateless per-request servers. Simpler, but hides `initialize` from the demo and gives up GET/SSE.
**Consequences.** ~80 lines in `server/sessions.ts`. Covered by protocol tests TC-040..045.

## ADR-005: Bedrock Converse with forced tool use, JSON-text fallback parse · accepted
**Decision.** Use `ConverseCommand` with a `submit_steps` tool and `toolChoice: {tool: {name}}`. If the model rejects forced tool choice, drop `toolChoice` and parse the text block as JSON (strip code fences). Validation (not the API) is the safety net.
**Consequences.** One adapter file imports the AWS SDK. Model id comes only from env (Q1 open).

## ADR-006: Plain-JS web client with a hand-written MCP client · accepted
**Context.** PRD requires "a real MCP client" in a web page. Bundling the SDK client for the browser adds a build step.
**Decision.** A hand-written ES-module client (~150 lines) over `fetch`, no bundler, served as static files by Express. Contract: [PROTOCOL.md](../specs/PROTOCOL.md) §2, §6.
**Consequences.** We own protocol correctness in the browser; the protocol test (TC-040) runs the same wire sequence from Node.

## ADR-007: Rule-based intent router in the web client · proposed (A1)
**Context.** The PRD never says what maps "I can't start" to a tool. Alexa+ would use its own LLM. Our web page has none, and PRD says Bedrock is only for `break_down_task`.
**Decision.** Deterministic phrase grammar in `router.js` (table: [PROTOCOL.md](../specs/PROTOCOL.md) §6). The tool-call panel shows exactly what was called. Bonus demo: Claude Desktop / MCP Inspector against `/mcp` proves tool descriptions work for an LLM router.
**Consequences.** Router quality bounds the web demo, not the server. Needs confirmation because it affects the "Bedrock only once" claim.

## ADR-008: One reply choke point (`speak`) · accepted
**Decision.** All tool output passes through `core/reply.ts`, which enforces AC1/AC2 and sanitises echoed user text. See [SAFETY-COPY.md](../specs/SAFETY-COPY.md).
**Consequences.** Compliance is a property of one function plus one property-style test over every tool, rather than 24 hand checks.

## ADR-009: Domain modules register multiple tools · accepted
**Decision.** Auto-loaded domain modules (list: [ARCHITECTURE.md](ARCHITECTURE.md) §3) each register several tools. Hygen generators are not used for these.
**Consequences.** T-003 confirms the loader/`RegisterableModule.name` tolerate this; otherwise register via an explicit index.

## ADR-010: Deterministic everything except `break_down_task` · accepted
**Context.** PRD §8: Bedrock only for `break_down_task`. `im_stuck`, `match_energy`, `transition_warning` could tempt an LLM.
**Decision.** They use templates and curated pools. Keeps latency low, cost zero and replies lintable.
**Consequences.** Replies are less varied; pools carry 6 to 10 items each, rotated by least-recently-used.

## ADR-011: Stateless "push" is out; warnings are pull-based · accepted
**Context.** PRD lists "staged warnings", but an MCP server cannot speak unprompted over a voice channel.
**Decision.** `transition_warning` returns a plan the assistant can schedule or repeat; `time_check` and `what_now` use stage-aware wording (halfway, five minutes left). The web client may poll `time_check` as a UI nicety (P1), clearly separate from the protocol.
**Consequences.** Time-blindness claim in the submission text must say "on request" not "proactively".

## ADR-012: `delete_my_data` needs an explicit confirm flag · proposed (A2)
**Decision.** First call without `confirm: true` returns one question; with it, one transaction deletes all rows for the user. Idempotent.
**Consequences.** Slight friction, justified for a destructive tool callable by an LLM router.
