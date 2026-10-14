# Task tracker

**The only place task status lives.** Update in the same PR that does the work.

Legend: status `todo | doing | blocked | done | dropped` · Pri `P0/P1/B` (B = bonus) · Est in ideal hours · Deps = must be `done` first.
Requirement refs: `F#`/`AC#`/`NF#` (see [TRACEABILITY.md](../TRACEABILITY.md)). Tests refs: [TEST-PLAN.md](TEST-PLAN.md).

## Progress snapshot

| Workstream | Tasks | Done | Est h |
|---|---|---|---|
| WS0 Foundation | 7 | 7 | 17 |
| WS1 Task initiation + Bedrock | 6 | 5 | 17.5 |
| WS2 Protocol + web client | 6 | 0 | 20 |
| WS3 Remaining tools | 10 | 0 | 20 |
| WS4 Quality | 6 | 0 | 11.5 |
| WS5 Freeze + submission | 10 | 0 | 21 |
| **Total** | **45** | **12** | **107** |
| of which P0 only | | | 95 (incl. 3 h already done) |

> Capacity and cut order: [PLAN.md](PLAN.md) §4.

## WS0 Foundation

| ID | Task | Pri | Reqs | Deps | Est | Status | Done when |
|---|---|---|---|---|---|---|---|
| T-000 | Write planning docs set (`docs/`) | P0 | all | | 3 | done | docs reviewed, linked from README |
| T-001 | Clean starter: delete echo/prompts/resources + tests, rename package to `sidekick`, MIT `LICENSE`, `engines >=22.13`, `.nvmrc`, `npm start` script (build + http), server name/version | P0 | NF5 | | 1.5 | done | `npm start` serves empty tool list; CI green |
| T-002 | `config.ts` (zod env, fail-fast) and `core/log.ts` (no-content logger) + ESLint rule banning `console.*` elsewhere | P0 | NF2 | T-001 | 1.5 | done | unit tests for config defaults/errors |
| T-003 | **Spike**: SDK vs spec 2025-11-25 (negotiated version, Streamable HTTP, `tool` vs `registerTool`), loader accepts multi-tool modules; record in ADR-002; upgrade SDK if needed | P0 | NF7 | T-001 | 3 | done | ADR-002 updated with result; Q2 closed |
| T-004 | `db/schema.ts` (Drizzle), `db/connection.ts`, generated migration, `tx()` helper, in-memory test helper | P0 | PRD§9 | T-001 | 3 | done | schema matches DATA-MODEL; migration idempotent test |
| T-005 | `core/clock.ts`, `core/user.ts`, `core/timewords.ts` (+ local-date helper using `SIDEKICK_TZ`) | P0 | NF3 | T-002 | 2 | done | TC-080..083 (DST, phrases) |
| T-006 | `core/lexicon.ts`, `core/reply.ts` (`speak`), `core/safety.ts` (crisis screen) | P0 | AC1, AC2, NF6 | T-002 | 3 | done | TC-060, TC-064, TC-065 |

## WS1 Task initiation + Bedrock

| ID | Task | Pri | Reqs | Deps | Est | Status | Done when |
|---|---|---|---|---|---|---|---|
| T-010 | `ai/prompt.ts`, `validate.ts`, `fallback.ts`, `mock.ts`, `types.ts` | P0 | F1, §8 | T-006 | 3 | done | validation table fully unit-tested (TC-006, TC-007) |
| T-011 | `ai/bedrock.ts` Converse adapter (forced tool, abort timeout, no SDK retries); choose model; **measure latency** over >= 20 calls | P0 | F1, NF1, NF8 | T-002, T-010, AWS access (Q1) | 4 | blocked | real call works; p50/p95 recorded in `docs/plan/LATENCY.md`; Q1 closed |
| T-012 | `ai/breakdown.ts` orchestration (budget, retry once, fallback) + `repos/aiCalls.ts` | P0 | F1, §8 | T-004, T-010 | 3 | done | TC-001..005, TC-008 |
| T-013 | `repos/tasks.ts` and tools `break_down_task`, `next_step`, `complete_step` (module `tools/tasks.ts`) | P0 | F1, F2, F3, AC3 | T-003, T-006, T-012 | 4 | done | TC-001, TC-010..014, TC-070 |
| T-014 | Failure-path tests via fake `AiClient` (timeout, malformed, too many, banned, injection) | P0 | §12 | T-012 | 2 | done | TC-002..009 green |
| T-015 | `im_stuck` with curated pool | P1 | F4 | T-013 | 1.5 | done | TC-015 |

## WS2 Protocol + web client

| ID | Task | Pri | Reqs | Deps | Est | Status | Done when |
|---|---|---|---|---|---|---|---|
| T-020 | `server/sessions.ts` + `boot.ts` rework: per-session transport, Origin allow-list, loopback bind, static files, `/healthz`, graceful shutdown, 64 KB body | P0 | §10, NF7 | T-003 | 4 | todo | TC-041..045 |
| T-021 | Protocol test: initialize -> initialized -> tools/list -> tools/call over real HTTP; reconnect and 404 re-init | P0 | §12 | T-013, T-020 | 2.5 | todo | TC-040 green in CI |
| T-022 | `web/public/mcp-client.js` (JSON + SSE parsing, session/protocol headers, trace events) | P0 | §10 | T-020 | 3 | todo | TC-046 (client vs server); works in Chrome |
| T-023 | `web/public/router.js` grammar + Node unit tests | P0 | ADR-007 | T-013 | 3 | todo | TC-090..093 |
| T-024 | Web UI: `index.html`, `app.js`, `styles.css`, speech in/out, hero line, focus clock, tool-call drawer with source chip, a11y | P0 | §3, DESIGN | T-022, T-023 | 6 | todo | manual checklist in TEST-PLAN §6; Lighthouse a11y >= 95 |
| T-025 | Dockerfile/compose/CI adaptation (Node 22+, `data/` volume, env passthrough; CI runs lint, typecheck, test, protocol test in mock mode) | P0 | NF5 | T-020 | 1.5 | todo | `docker compose up` serves UI; CI green on PR |

## WS3 Remaining tools (parallel with WS2)

| ID | Task | Pri | Reqs | Deps | Est | Status | Done when |
|---|---|---|---|---|---|---|---|
| T-030 | `repos/focus.ts` + `tools/time.ts`: `start_focus`, `time_check`, `end_focus` | P0 | F5 | T-004, T-005, T-006, T-003 | 2.5 | todo | TC-020..024 |
| T-031 | `repos/dump.ts`, `repos/parked.ts` + `tools/memory.ts`: `brain_dump`, `sort_dump`, `park_my_place`, `where_was_i` | P0 | F7, F8 | T-004, T-005, T-006 | 3 | todo | TC-025..029 |
| T-032 | `repos/wins.ts` + `tools/wins.ts`: `log_win`, `my_wins` | P0 | F10 | T-004, T-005, T-006 | 1.5 | todo | TC-031, TC-032 |
| T-033 | `repos/dopamine.ts` (seed, LRU) + `tools/decisions.ts`: `pick_for_me`, `match_energy`, `what_now` | P0 | F9 | T-013, T-030, T-032 | 3 | todo | TC-030 (4 branches + ordering), TC-033, TC-034 |
| T-034 | `repos/userData.ts` + `tools/data.ts`: `delete_my_data` with confirm | P0 | F14, NF9 | T-004 and all repos | 1.5 | todo | TC-050..052 |
| T-040 | `tools/dopamine.ts`: `dopamine_menu`, `add_dopamine_idea` | P1 | F11 | T-033 | 1.5 | todo | TC-035 |
| T-041 | `repos/routines.ts` + `tools/routines.ts`: `add_routine`, `routine_check`, `routine_done`; hook into `what_now` | P1 | F12 | T-033 | 3 | todo | TC-036..039, TC-063 |
| T-042 | `gentle_reset` | P1 | F13 | T-013, T-030 | 1.5 | todo | TC-047 |
| T-043 | `transition_warning` (pure) | P1 | F6 | T-006 | 1.5 | todo | TC-048 |
| T-044 | Optional bearer-token auth and non-loopback guard | P1 | NF10 | T-020 | 1 | todo | TC-049 |

## WS4 Quality

| ID | Task | Pri | Reqs | Deps | Est | Status | Done when |
|---|---|---|---|---|---|---|---|
| T-050 | `reply-lint` test: every registered tool x realistic and hostile inputs vs AC1/AC2 (auto-discovers tools from `tools/list`, so new tools are covered) | P0 | AC1, AC2 | all P0 tools | 3 | todo | TC-060..062 green |
| T-051 | Safety: crisis screen tests on every free-text tool, document limits in README | P0 | NF6, §11 | T-031, T-013 | 2 | todo | TC-064, TC-065 |
| T-052 | Copy review pass over every spoken string vs SAFETY-COPY §5 | P0 | AC2, P3 | all tools | 1.5 | todo | checklist signed in PR |
| T-053 | Hero-flow script (`scripts/hero.mjs`) under 60 s from clean clone, mock mode, and with Bedrock | P0 | §12 | T-021 | 2 | todo | TC-100, TC-101 |
| T-054 | `knip`, lint, typecheck clean; CI required | P0 | DoD | all | 1.5 | todo | CI green on main |
| T-055 | Privacy audit: grep logs for content, inspect Bedrock request payload, confirm `ai_calls` has no text | P0 | NF2, §8 | T-012 | 1.5 | todo | TC-066, TC-067 |

## WS5 Freeze + submission

| ID | Task | Pri | Reqs | Deps | Est | Status | Done when |
|---|---|---|---|---|---|---|---|
| T-060 | **Feature freeze**: tag `v1.0.0-rc1`; only bugfixes after | P0 | | WS1–4 | 1 | todo | tag exists; P1 leftovers marked `dropped` in this file |
| T-070 | README: pitch, GIF, quick start (mock + Bedrock), config table, architecture link, safety disclaimer, limits (Lambda, single user) | P0 | §12, NF5 | T-060 | 3 | todo | fresh-clone dry run by someone else |
| T-071 | Demo video < 3 min: script, record, edit, upload public (no music/trademarks) | P0 | §14 | T-060 | 6 | todo | URL public in private window |
| T-072 | Submission text: features, functionality, track + Bedrock usage | P0 | §14 | T-060 | 2 | todo | draft reviewed |
| T-073 | Product Feedback per tool used + friction log (SDK version, forced tool use, `node:sqlite`, Alexa+ preview) | P0 | §14 | T-011 | 3 | todo | entries for Bedrock Converse, MCP SDK, each Sidekick tool |
| T-074 | Cite 2–3 clinical/community sources for the pain points | P0 | PRD§2 TODO | | 1.5 | todo | sources in README and PRD §2 |
| T-075 | Name check: "Sidekick" on Devpost, GitHub, Alexa skill store (Q6) | P0 | | | 0.5 | todo | result recorded in RAID |
| T-076 | Verify rules/reviewer names; decide public vs private repo; share late if private (Q3) | P0 | §14 | | 1 | todo | Q3 closed |
| T-077 | Submit on Devpost, confirm confirmation page/email | P0 | §14 | T-070..076 | 1 | todo | confirmation saved in RAID |
| T-091 | Bonus: general assistant (Claude Desktop / Inspector) calling same `/mcp`; capture for demo | B | §10 | T-024 | 2 | todo | 20 s clip or screenshots |

## Change log

| Change |
|---|
| Initial breakdown from PRD v1 |
