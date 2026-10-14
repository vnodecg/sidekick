# RAID log: Risks, Assumptions, Issues, Decisions needed

Last reviewed: 2026-10-13 · Review daily at EOD. Status: `open | mitigating | closed`. Score = Likelihood x Impact (1–3 each).

## Risks

| ID | Risk | L | I | Score | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R1 | Bedrock slow/unavailable/throttled; demo stalls | 2 | 3 | 6 | Timeout, retry and fallback (AI-BEDROCK §1, §7); mock mode; pre-recorded backup take of the demo | Eng | open |
| R2 | SQLite on Lambda loses data | 1 | 2 | 2 | Not deploying to Lambda; README says so; Docker volume | Eng | mitigating |
| R3 | SDK does not implement spec 2025-11-25 as required | 2 | 3 | 6 | Spike T-003 first; upgrade within v1.x; document negotiated version as friction-log item | Eng | open |
| R4 | No AWS credits; Bedrock model access not enabled in region | 2 | 3 | 6 | Confirm access Oct 14 (Q1); mock elsewhere; budget cap alarm; calls only for T-011, rehearsal, demo | Eng | open |
| R5 | Alexa+ caller identity unknown | 3 | 1 | 3 | Fixed user; `resolveUserId` seam | Eng | mitigating |
| R6 | Schedule: ~92 P0 h in 9 days | 3 | 3 | 9 | Two people (Q5); freeze Oct 20; cut order in PLAN §4 | PM | open |
| R7 | `node:sqlite` is experimental / absent on judge's Node | 2 | 2 | 4 | `engines >=22.13`, startup version check with a clear message, Docker path, driver behind repo seam (ADR-003) | Eng | open |
| R8 | Web Speech API unsupported (Firefox/Safari) or flaky | 3 | 2 | 6 | Typed fallback is first-class; demo recorded in Chrome | Eng | open |
| R9 | Rule-based router feels brittle, judges type odd phrases | 2 | 2 | 4 | Fallback to `what_now`; bonus assistant demo shows LLM routing; debug panel; grammar tests | Eng | open |
| R10 | Banned-word/echo rule collides with user text | 2 | 1 | 2 | Echo exemption defined in SAFETY-COPY §3 | Eng | mitigating |
| R11 | Crisis keyword screen misses or over-triggers | 2 | 3 | 6 | Documented limits; no detection claims; review list T-051 | Eng | open |
| R12 | Local server with destructive tool reachable by web pages | 2 | 3 | 6 | PROTOCOL §3 controls; confirm flag (ADR-012) | Eng | mitigating |
| R13 | Judges run on a different OS/Node and fail to start | 2 | 3 | 6 | Clean-clone rehearsal T-053; Docker path; mock default if no AWS env | Eng | open |
| R14 | Starter's deps stale/vulnerable | 1 | 1 | 1 | `npm audit` once before freeze | Eng | open |
| R15 | "Sidekick" name conflict | 2 | 2 | 4 | T-075 early; fallback name decided in advance (Q6) | PM | open |

## Assumptions (PROPOSED defaults; confirm or correct)

| ID | Assumption | Consequence if wrong | Ref | Status |
|---|---|---|---|---|
| A1 | Web client uses a rule-based router; Bedrock stays only in `break_down_task` | If an LLM router is wanted, add a second Bedrock call and update privacy text | ADR-007 | open |
| A2 | `delete_my_data` requires `confirm: true` | Remove the flag; one-call delete | ADR-012 | open |
| A3 | `sort_dump` is spoken as one comma-joined sentence of <= 5 items | Alternative: read one item per call | TOOLS §3 | open |
| A4 | "Due routine" = `time_of_day` reached (or no time) and not done today | Needs a different rule for recurrence | TOOLS §5 | open |
| A5 | Active task = latest-updated open parent; others stay open | Maybe auto-pause others | TOOLS §0 | open |
| A6 | Extended banned-word list beyond PRD's four | Drop extras if too strict | SAFETY-COPY §2 | open |
| A7 | Fallback steps are generic (not task-specific) | Fine per PRD §8 | AI-BEDROCK §5 | closed |
| A8 | Local timezone via `SIDEKICK_TZ`, default system TZ; client does not send TZ | Alexa+ may supply device TZ later | DATA-MODEL | open |
| A9 | Single-user, no auth by default on loopback | Remote deployments need token | PROTOCOL §3 | open |
| A10 | Judges can run Node >= 22.13 or Docker | Widen driver support (better-sqlite3) | ADR-003 | open |

## Open questions (from PRD §16 plus new)

| ID | Question | Needed by | Owner | Status / answer |
|---|---|---|---|---|
| Q1 | Which Bedrock model and region do we have access to; fastest for short JSON? | Oct 14 | Eng | open; blocks T-011 |
| Q2 | Does the SDK implement 2025-11-25 over Streamable HTTP? (Python framing in PRD is stale, see ADR-001) | Oct 14 | Eng | open; T-003 |
| Q3 | Public repo + license (MIT proposed) or private + share? Verify reviewer names vs Amazon list | Oct 21 | PM | open; T-076 |
| Q4 | Package an Agent Skill too, or MCP server only? | Oct 18 | PM | open; **default: server only** |
| Q5 | Who is on the team; who is the appointed representative? How many contributors for capacity? | Oct 14 | PM | open |
| Q6 | Is "Sidekick" free on Devpost, GitHub, Alexa skill store? Fallback name? | Oct 14 | PM | open; T-075 |
| Q7 | Alexa+ track: does judging require demonstrating an Alexa surface, or is the FAQ path (self-hosted MCP + web client) sufficient? Re-read rules/FAQ once | Oct 15 | PM | open |
| Q8 | Any budget cap for Bedrock; which AWS account/profile does the demo use? | Oct 14 | PM | open |
| Q9 | Product Feedback: what exact form/format does Devpost require "for each tool used"? | Oct 18 | PM | open |

## Issues

None yet. Log with: ID `I#`, date, description, impact, owner, status.

## Decisions log

Architecture decisions: [../architecture/DECISIONS.md](../architecture/DECISIONS.md). Product/scope decisions made after PRD v1 go in a `Date | Decision | By` table here; none yet.
