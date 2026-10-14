# Sidekick docs

Single source of truth for building Sidekick. Read in this order.

| # | Doc | Answers | Owner |
|---|-----|---------|-------|
| 1 | [product/PRD.md](product/PRD.md) | What and why (frozen input, v1) | PM |
| 2 | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) | How the system fits together | Eng |
| 3 | [architecture/DECISIONS.md](architecture/DECISIONS.md) | Why we chose X (ADR log) | Eng |
| 4 | [specs/TOOLS.md](specs/TOOLS.md) | Exact behaviour of all 24 MCP tools | Eng |
| 5 | [specs/AI-BEDROCK.md](specs/AI-BEDROCK.md) | Prompt, schema, validation, fallback | Eng |
| 6 | [specs/PROTOCOL.md](specs/PROTOCOL.md) | HTTP/MCP wire contract and web-client contract | Eng |
| 7 | [specs/SAFETY-COPY.md](specs/SAFETY-COPY.md) | Reply rules, banned words, crisis handling | Eng/PM |
| 8 | [data/DATA-MODEL.md](data/DATA-MODEL.md) | SQLite schema, migrations, queries | Eng |
| 9 | [design/DESIGN.md](design/DESIGN.md) | Voice UX, reply voice, web client UI | Design |
| 10 | [plan/PLAN.md](plan/PLAN.md) | Schedule, critical path, scope cuts | Eng |
| 11 | [plan/TASKS.md](plan/TASKS.md) | **Work breakdown. The tracker.** | Eng |
| 12 | [plan/TEST-PLAN.md](plan/TEST-PLAN.md) | Test cases mapped to requirements | Eng |
| 13 | [plan/RAID.md](plan/RAID.md) | Risks, assumptions, issues, open questions | Eng |
| 14 | [plan/SUBMISSION.md](plan/SUBMISSION.md) | Checklist, demo script, Product Feedback | PM |
| 15 | [TRACEABILITY.md](TRACEABILITY.md) | Requirement -> tool -> task -> test | Eng |

## Tracking conventions

- **IDs are permanent.** Never renumber. Retire with status `dropped`.
  `F#` functional (from PRD), `AC#` acceptance, `NF#` derived non-functional, `T-###` task, `TC-###` test case,
  `ADR-###` decision, `R#` risk, `A#` assumption, `Q#` open question.
- **Status vocabulary:** `todo`, `doing`, `blocked`, `done`, `dropped`. Only `plan/TASKS.md` carries task status.
- **Update rule:** a PR that finishes a task flips its status in `TASKS.md` and ticks any linked checklist row.
  A PR that changes behaviour updates the owning spec in the same PR.
- **Definition of done (every task):** code merged, `npm run lint && npm run typecheck && npm test` green,
  linked test cases pass, spec updated if behaviour changed, no `console.log` of user content.
- **Priorities:** P0 demo-critical, P1 if time allows, cut P1 first.
- Schedule and milestones live in [plan/PLAN.md](plan/PLAN.md).
- Items marked **PROPOSED** are engineering assumptions where the PRD is silent; they are tracked in RAID.md as `A#`/`Q#` until confirmed.
