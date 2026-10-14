# Delivery plan

Status: Draft v1
Task detail and status: [TASKS.md](TASKS.md)

## 1. Approach

Build a **walking skeleton first**: mock AI + one tool + `/mcp` + a thin page, then widen. Every day ends with something demoable. The hero flow (task -> first step -> done -> next step) is protected above everything else.

## 2. Schedule

| Milestone (PRD §13) | Exit criteria | Tasks |
|---|---|---|
| Planning | Docs set committed | T-000 |
| M1: Bedrock-backed `break_down_task` + validation, fallback, mock | Hero flow works through a Node test client; failure matrix green; real Bedrock p50 measured | T-001..006, T-010..014, T-075 |
| M2: `/mcp` endpoint + web MCP client | Browser completes hero flow by voice; protocol test green | T-020..025, T-030..033 |
| M3: P0 tools complete, tests, safety, `delete_my_data` | Reply-lint covers all tools; privacy audit done; CI green; P1s as time allows | T-034, T-050..055, T-015, T-040..044 |
| **M4: Feature freeze** | Tag `v1.0.0-rc1`; unfinished P1 -> `dropped` | T-060 |
| M5: Demo video, README, license, feedback | Video public; README tested on a clean clone | T-070..074, T-076, T-091 |
| M6: Submit | Devpost confirmation saved | T-077 |
| Buffer | Only if submission failed or an urgent fix is needed | |

## 3. Critical path

`T-001 -> T-003 (SDK spike) -> T-020 (sessions) -> T-021 (protocol test) -> T-022 -> T-024 (UI) -> T-053 (hero script) -> T-060 -> T-071 (video) -> T-077`

Parallel track that unblocks the demo's "real Bedrock" claim: `T-010 -> T-011 (needs AWS access, Q1) -> T-012 -> T-013`. **If AWS access is not confirmed by the end of M1's first day, escalate**: everything else proceeds in mock mode, but the track's judging value (AWS Builder challenge) depends on it.

## 4. Capacity and scope control

- Remaining P0 effort is ~92 h; P1 ~10 h; bonus 2 h. Over the nine working days that is ~10 h/day for one person. **Assumption: 2 contributors** (Q5). With one, expect to cut: T-024 polish, all P1, and T-091.
- **Cut order if behind** (first cut first): T-091 -> T-044 -> T-043 -> T-042 -> T-041 -> T-040 -> T-015 -> web drawer niceties (raw JSON expand) -> speech input (typed fallback remains).
- **Never cut:** T-013 hero flow, T-012 fallback, T-021 protocol test, T-050 reply-lint, T-034 `delete_my_data`, T-055 privacy audit, T-071 video.
- WIP limit: at most 2 tasks `doing` per person. Blocked > 4 h goes to RAID.

## 5. Workstream parallelism (2 people)

| Step | Person A (server/AI) | Person B (protocol/client) |
|---|---|---|
| 1 | T-001, T-002, T-004, T-010 | T-003, T-005, T-006, T-075 |
| 2 | T-011, T-012, T-013, T-014 | T-030, T-031, T-032 |
| 3 | T-033, T-034 | T-020, T-021 |
| 4 | T-015, T-040 | T-022, T-023, T-024, T-025 |
| 5 | T-050, T-051, T-041 | T-024 finish, T-053 |
| 6 | T-052, T-055, T-042, T-043 | T-054, T-044, T-053 polish |
| 7 | T-060 freeze, regression | regression |
| 8 | T-070, T-073 | T-071, T-072, T-091, T-074, T-076 |
| 9 | T-077 | verification |

## 6. Engineering ground rules

- Trunk-based on `main` with short-lived branches; CI required (lint, typecheck, test, protocol test in mock mode).
- Mock AI is the default in CI and local dev; real Bedrock only in T-011, T-053 (real mode run), the demo and `npm run test:bedrock` (opt-in, skipped without env).
- Cost guard: no Bedrock call inside the default test suite; track spend in RAID after T-011.
- Weekly cadence is replaced by a **daily 10-min sync** and an EOD update to TASKS.md + RAID.md.

## 7. Release and submission mechanics

1. Freeze (M4): tag, copy the [SUBMISSION.md](SUBMISSION.md) checklist into a GitHub issue.
2. Repo visibility, submission and pre-submit checks: [SUBMISSION.md](SUBMISSION.md) §1, §5.
3. Judging period: keep `main` stable; no breaking pushes; README states the exact commit judged.

## 8. Definition of "demo-ready" (go/no-go at M4)

| Gate | Pass condition |
|---|---|
| Hero flow | < 60 s from clean clone to spoken next step (TC-100) |
| Real Bedrock | Visible in drawer with `source: bedrock` (TC-101) |
| Failure handling | All of TC-002..009 pass |
| Protocol | TC-040 passes in CI |
| Copy | TC-060..062 pass; no `console.*` of content (TC-066) |
| Privacy | `delete_my_data` verified (TC-050..052) |
