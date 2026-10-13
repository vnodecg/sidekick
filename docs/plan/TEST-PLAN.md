# Test plan

Status: Draft v1 · Runner: `node --test` · Mock AI by default · Traceability: [../TRACEABILITY.md](../TRACEABILITY.md)

## 1. Strategy

| Layer | What | Tools |
|---|---|---|
| Unit | pure functions: validate, timewords, lexicon, safety, router, speak | `node:test`, in-memory DB where needed |
| Repository | SQL behaviour on in-memory SQLite with real migrations | helper `makeDb()` |
| Tool (in-process) | MCP client <-> server via in-memory transport, fake clock, fake `AiClient`, seeded RNG | `tests/helpers` |
| Protocol | real HTTP server on a random port, raw `fetch` doing initialize -> tools | `tests/protocol.test.ts` |
| Lint-style | all tools x hostile inputs vs AC1/AC2, auto-discovered from `tools/list` | `tests/reply-lint.test.ts` |
| Manual | voice, a11y, demo rehearsal | §6 checklist |
| Opt-in live | real Bedrock, skipped unless `SIDEKICK_LIVE=1` | `npm run test:bedrock` |

Determinism: inject `clock.now()`, RNG, and `AiClient`; no sleeps (use fake timers or abort signals).

## 2. Test cases

IDs are stable. "Reqs" refers to PRD IDs or derived IDs in the traceability matrix.

### 2.1 Task breakdown (T-012/013/014)

| TC | Case | Expected | Reqs |
|---|---|---|---|
| TC-001 | Happy path with fake AI returning 5 valid steps | Reply is first step only; 1 parent + 5 steps saved; `_meta.source` set | F1, AC3 |
| TC-002 | Both attempts time out | Fallback template saved; 2 failed `ai_calls`; reply still normal | F1, §12 |
| TC-003 | First times out, second succeeds | AI steps saved; `ai_calls` = fail, ok | F1 |
| TC-004 | Malformed JSON twice | Fallback | §12 |
| TC-005 | 12 steps returned twice | Fallback | §12 |
| TC-006 | Step > 12 words / banned word / empty step | Rejected with right `error_class`, retry, fallback | §8 |
| TC-007 | Fenced JSON / numbered steps | Accepted after normalisation | §8 |
| TC-008 | Throttling exception | Retry once then fallback; no throw to caller | §8 |
| TC-009 | Prompt-injection task text | Fake returns bad output; fallback; reply not hijacked | §8 |
| TC-010 | `complete_step` mid-task | Step done; win logged; next step spoken | F2 |
| TC-011 | `complete_step` on last step | Parent done; win `task`; finished line | F3 |
| TC-012 | `complete_step` twice quickly | Second call is a no-op (idempotent) | F2 |
| TC-013 | `next_step` with no task / with finished task | Calm empty reply, no write | F2 |
| TC-014 | Two open tasks | Latest-updated is active; other untouched | A5 |
| TC-015 | `im_stuck` with/without open step | One sentence from pool; no advice words | F4 |

### 2.2 Time, memory, decisions, wins

| TC | Case | Expected | Reqs |
|---|---|---|---|
| TC-020 | start -> time_check -> end with fake clock | Plain phrases; win logged | F5 |
| TC-021 | start twice | One open session; second reply says already going | F5 |
| TC-022 | time_check with `minutes` set: halfway, 5 left, past | Stage phrase; never "overdue/late" | F5, AC2 |
| TC-023 | end_focus with none open | Calm no-op | F5 |
| TC-024 | Phrasing boundaries (59 s, 61 s, 59 min, 61 min) | `timewords` table | NF3 |
| TC-025 | `brain_dump` | Stored; reply has no question mark | F7 |
| TC-026 | `sort_dump` with 0, 3, 5, 9 items | <= 5 spoken; "and more" when > 5; single sentence list | F7, AC1 |
| TC-027 | `park_my_place` + `where_was_i` | Note + time ago; None-saved reply | F8 |
| TC-028 | Park without note while step open | Uses step title | F8 |
| TC-029 | Hostile dump text (markdown, multi-sentence, "late") | Sanitised; still <= 3 sentences | AC1 |
| TC-030 | `what_now` order: focus > routine > step > break | Each branch isolated + conflicts | F9 |
| TC-031 | `log_win` | Stored; reply fixed | F10 |
| TC-032 | `my_wins`: today / yesterday / none / many | Windowing rules; max 3 named | F10 |
| TC-033 | `pick_for_me` with options (seeded RNG) / without | Exactly one result | F9 |
| TC-034 | `match_energy` low/medium/high | One suggestion each | F9 |
| TC-035 | `dopamine_menu` rotates LRU; add idea | No repeat until all used | F11 |
| TC-036 | Routine due: before/after time, done today, next day | Local-date logic | F12 |
| TC-037 | `routine_done` default and by name | Win `routine` | F12 |
| TC-038 | Routine wording | No overdue/late/missed | F12, AC2 |
| TC-039 | Timezone change at midnight boundary (`SIDEKICK_TZ`) | Correct local day | F12, NF3 |
| TC-047 | `gentle_reset` | Tasks archived, focus ended, wins kept, reply exact | F13 |
| TC-048 | `transition_warning` | Points <= minutes; `_meta.schedule`; no write | F6 |
| TC-049 | Bearer token required when configured; loopback default | 401/403 paths | NF10 |

### 2.3 Data and privacy

| TC | Case | Expected | Reqs |
|---|---|---|---|
| TC-050 | `delete_my_data` without confirm | Question; nothing deleted | F14 |
| TC-051 | With confirm after populating all 8 tables | Zero rows for user in every table | F14 |
| TC-052 | Other `user_id` rows survive; repeat call is idempotent | Verified | F14, NF9 |
| TC-066 | Log capture during full tool run | No task/thought text in any log line | NF2 |
| TC-067 | Spy on Bedrock request | Body = system prompt + `<task>` only | §8 |
| TC-068 | `ai_calls` content | No text columns populated | §8 |
| TC-069 | Migration idempotency and WAL pragma | Re-open DB OK | PRD§9 |

### 2.4 Protocol and web client

| TC | Case | Expected | Reqs |
|---|---|---|---|
| TC-040 | **Protocol test**: initialize -> notifications/initialized -> tools/list (24 tools, all with descriptions) -> tools/call break_down_task | Valid JSON-RPC, session header, negotiated version | §12 |
| TC-041 | Two concurrent sessions | Independent, both work | ADR-004 |
| TC-042 | Unknown session id | 404 | PROTOCOL §4 |
| TC-043 | `DELETE` closes session | Subsequent call 404 | PROTOCOL §4 |
| TC-044 | Bad `Origin` | 403 | PROTOCOL §3 |
| TC-045 | Oversized body / non-JSON | 4xx, server survives | PROTOCOL §3 |
| TC-046 | Browser client end to end against server (headless or manual) | Hero flow works, reconnect after restart | §10 |
| TC-090..093 | Router: each grammar row; ambiguous phrases; fallback; no-active-task rule | Right tool and args | ADR-007 |

### 2.5 Copy, safety, acceptance

| TC | Case | Expected | Reqs |
|---|---|---|---|
| TC-060 | Reply-lint: all tools, normal inputs | AC1 rules hold | AC1 |
| TC-061 | Reply-lint: hostile inputs (markdown, 500-char, newlines, emoji, "late", "!!!") | AC1 holds; banned check on template only | AC1, AC2 |
| TC-062 | Source scan of template constants for banned words | None found | AC2 |
| TC-063 | Routine named like a medication | Stored, echoed verbatim, no advice | §11 |
| TC-064 | Crisis phrases on every free-text tool | Care reply; nothing stored; no AI call | NF6 |
| TC-065 | Near-miss phrases ("this task is killing me", "kill the process") | Policy documented; at minimum no crash; false-positive list reviewed | NF6 |
| TC-070 | `break_down_task` reply contains only step 1 | Other steps' text absent | AC3 |
| TC-080..083 | Clock/time helpers: DST, UTC epoch, local-day | Correct | NF3 |

### 2.6 End to end

| TC | Case | Expected | Reqs |
|---|---|---|---|
| TC-100 | `scripts/hero.mjs` from clean clone in mock mode | < 60 s total including install; prints 4 replies | §12 |
| TC-101 | Same with Bedrock; drawer shows `source: bedrock` | Real call visible | §12, goal 4 |
| TC-102 | Kill server mid-session, restart, continue | Client re-initialises; data intact | NF7 |

## 3. Exit criteria

- Unit/tool/protocol suites green in CI on Node 22 and 24.
- TC-002..009, TC-040, TC-060..062 are release blockers.
- No test depends on network or AWS unless `SIDEKICK_LIVE=1`.

## 4. Coverage

Target (not a gate): `core/` and `ai/` >= 90% lines, `tools/` >= 80%. Tracked with `node --test --experimental-test-coverage`.

## 5. Live Bedrock check (opt-in)

`SIDEKICK_LIVE=1 npm run test:bedrock`: 5 diverse tasks; asserts validity and records latency to stdout. Used for T-011 (model choice, `LATENCY.md`) and a pre-demo smoke run on Oct 21.

## 6. Manual checklist (T-024, pre-freeze, pre-video)

- [ ] Chrome desktop and Android: mic permission, speak, reply spoken, mute works
- [ ] Safari/Firefox: typed fallback is shown automatically
- [ ] 320 px wide: no horizontal scroll; touch targets >= 44 px
- [ ] Keyboard only: tab order, `/`, Enter, Space
- [ ] Screen reader announces replies (VoiceOver or NVDA)
- [ ] `prefers-reduced-motion` and dark mode
- [ ] Server restart: UI recovers on next utterance
- [ ] Offline Bedrock (unset AWS vars, no mock): fallback steps, calm speech
