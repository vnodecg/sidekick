# Traceability matrix

Requirement -> spec -> implementation task -> test. If a row has an empty cell, it is a gap. Update when IDs change.

## Derived non-functional requirements

| ID | Requirement | Source |
|---|---|---|
| NF1 | Spoken reply within ~4 s end to end for `break_down_task` | PRD §8 |
| NF2 | Logs and `ai_calls` never contain user content | PRD §8, §11 |
| NF3 | Times stored as UTC epoch s, shown in `SIDEKICK_TZ` | PRD §9 |
| NF4 | `SIDEKICK_MOCK_AI=1` works with no AWS call or SDK import | PRD §8 |
| NF5 | One command to run; hero flow < 60 s from clean clone | PRD §4 goal 3, §12 |
| NF6 | Crisis text is never turned into a task | PRD §11 |
| NF7 | MCP 2025-11-25 Streamable HTTP at one `/mcp` endpoint | PRD §10 |
| NF8 | Bedrock model id, region, timeout from env | PRD §8 |
| NF9 | All data partitioned by `user_id`; deletion complete | PRD §9, F14 |
| NF10 | Safe HTTP defaults: loopback, Origin check, optional token | derived (ADR-004) |

## Matrix

| Req | Pri | Spec | Tasks | Tests |
|---|---|---|---|---|
| F1 break_down_task | P0 | TOOLS §1, AI-BEDROCK | T-010..014 | TC-001..009, TC-067, TC-070 |
| F2 next/complete step | P0 | TOOLS §1 | T-013 | TC-010..014 |
| F3 parent done on last step | P0 | TOOLS §1, DATA §5 | T-013 | TC-011 |
| F4 im_stuck | P1 | TOOLS §1 | T-015 | TC-015 |
| F5 focus/time | P0 | TOOLS §2 | T-030 | TC-020..024 |
| F6 transition_warning | P1 | TOOLS §2, ADR-011 | T-043 | TC-048 |
| F7 dump | P0 | TOOLS §3 | T-031 | TC-025, TC-026, TC-029 |
| F8 bookmark | P0 | TOOLS §3 | T-031 | TC-027, TC-028 |
| F9 one suggestion | P0 | TOOLS §4 | T-033 | TC-030, TC-033, TC-034 |
| F10 wins | P0 | TOOLS §4 | T-032 | TC-031, TC-032 |
| F11 dopamine | P1 | TOOLS §5 | T-040 | TC-035 |
| F12 routines | P1 | TOOLS §5 | T-041 | TC-036..039, TC-063 |
| F13 gentle_reset | P1 | TOOLS §5 | T-042 | TC-047 |
| F14 delete_my_data | P0 | TOOLS §6, ADR-012 | T-034 | TC-050..052 |
| AC1 reply shape | P0 | SAFETY-COPY §1 | T-006, T-050 | TC-060, TC-061, TC-029 |
| AC2 banned words | P0 | SAFETY-COPY §2 | T-006, T-050, T-052 | TC-061, TC-062, TC-038 |
| AC3 first step only | P0 | TOOLS §1 | T-013 | TC-070 |
| NF1 latency | P0 | AI-BEDROCK §7 | T-011 | TC-101, live check |
| NF2 privacy logging | P0 | SAFETY-COPY §8 | T-002, T-055 | TC-066, TC-068 |
| NF3 time handling | P0 | DATA-MODEL §1 | T-005 | TC-024, TC-039, TC-080..083 |
| NF4 mock mode | P0 | AI-BEDROCK §6 | T-010 | TC-001, CI default |
| NF5 one-command run | P0 | ARCHITECTURE §7 | T-001, T-025, T-053 | TC-100 |
| NF6 crisis handling | P0 | SAFETY-COPY §6 | T-006, T-051 | TC-064, TC-065 |
| NF7 protocol | P0 | PROTOCOL | T-003, T-020, T-021 | TC-040..046, TC-102 |
| NF8 env config | P0 | ARCHITECTURE §6 | T-002, T-011 | config unit tests |
| NF9 user partition | P0 | DATA-MODEL §1 | T-004, T-034 | TC-052 |
| NF10 safe HTTP | P1 | PROTOCOL §3 | T-020, T-044 | TC-044, TC-045, TC-049 |
| PRD §12 hero flow | P0 | DESIGN §2.2 | T-053 | TC-100, TC-101 |
| PRD §12 failure tests | P0 | AI-BEDROCK §9 | T-014 | TC-002, TC-004, TC-005 |
| PRD §14 submission | P0 | SUBMISSION | T-070..077 | checklist |
| PRD §10 Alexa-ready descriptions | P0 | TOOLS §0, PROTOCOL §7 | T-013.., T-091 | TC-040 (descriptions present), T-091 |

## Coverage check

- Every F, AC and PRD §12 item has at least one task and one test.
- Gaps by design: P1 rows may be `dropped` after freeze; mark them here and in TASKS.md together.
