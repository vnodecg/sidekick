# Tool specifications

Status: Draft v1 · Covers F1–F14 · Reply rules: [SAFETY-COPY.md](SAFETY-COPY.md) · Schema: [DATA-MODEL.md](../data/DATA-MODEL.md)

## 0. Conventions (apply to every tool)

- **Result shape:** `{ content: [{type:"text", text}], _meta?: {...}, isError?: true }`. `text` is the spoken reply (AC1/AC2). `_meta` is for UI only (source, latency, ids) and is never spoken.
- **Inputs:** zod schemas, everything optional unless stated. Missing required input yields one short question as the reply (not an error).
- **Descriptions** are written for an LLM router: plain words, start with *"Use when the user says ..."*. Text below is the literal description to ship.
- **Annotations:** `readOnlyHint` true for reads; `destructiveHint` true only for `delete_my_data`; `idempotentHint` where noted.
- **Free-text inputs** (`task`, `thought`, `note`, `label`, `text`, `name`, `idea`) go through `safety.screen()` first and are capped at 280 chars (task 500).
- **Active task** = the open parent task with the latest `updated_at`. Defined once in `repos/tasks.ts`.
- **Time phrases** come from `timewords.ts`: under 1 min "less than a minute", then "N minutes", then "about N hours".
- Samples below are examples of the reply template, not fixtures; tests assert rules, plus a few exact strings marked (exact).

## 1. Task initiation

### `break_down_task` · F1 · P0
- **Description:** "Use when the user says they need to do something big, can't start, or feels stuck on a task. Takes the task in the user's own words and returns only the first tiny step."
- **Input:** `task: string` (required, 1–500).
- **Behaviour:** screen -> `ai/breakdown` (see [AI-BEDROCK.md](AI-BEDROCK.md)) -> tx: insert parent (`position 0`) + steps (`1..n`, status open) -> reply = first step only (AC3). Existing open tasks stay open; new task becomes active.
- **Reply:** `"Okay. First tiny step: {step1}."` (exact form) Max 2 sentences. Never mentions count of steps. Never mentions the AI.
- **`_meta`:** `{taskId, source: "ai"|"fallback"|"mock", latencyMs, stepCount}`.
- **Empty input:** "What do you need to get started on?"
- **Tests:** TC-001..009, TC-070.

### `next_step` · F2 · P0
- **Description:** "Use when the user asks what to do next, or says they're ready for the next step."
- **Input:** none.
- **Behaviour:** active task's lowest-position open step. No hit: "Nothing is waiting right now. Want to start something?" (no active task) or the task-finished line.
- **Reply:** `"Next tiny step: {step}."`. Idempotent, read-only.

### `complete_step` · F2, F3 · P0
- **Description:** "Use when the user says they did it, they're done, or they finished the step."
- **Input:** none (acts on the current step; optional `note` ignored in v1).
- **Behaviour (single tx):** mark current step done -> insert win `kind=step` -> if open steps remain, reply with next; else mark parent done, insert win `kind=task`, reply finished.
- **Reply:** `"Nice. Next tiny step: {step}."` or `"Nice. That was the last step, so the whole thing is done."`
- **No open step:** same as `next_step` empty reply; writes nothing (idempotent on double "done" via step id + status check).
- **Tests:** TC-010..014.

### `im_stuck` · F4 · P1
- **Description:** "Use when the user says they are stuck or frozen right now, even on a tiny step. Returns one tiny unblocking action."
- **Input:** none.
- **Behaviour (no AI, ADR-010):** if an open step exists: pick from the *unblocker pool* (e.g. "Stand up, take one breath, then touch the first thing you need."), else from a general pool. One sentence plus optionally the current step restated. Rotates least-recently-used (in-memory is acceptable).
- **Reply:** `"{unblocker} Then: {step}."` or only the unblocker.
- **Safety:** pool contains physical actions only; no advice about feelings, diagnosis, or medication.

## 2. Time

### `start_focus` · F5 · P0
- **Description:** "Use when the user says they are starting to work on something now, or wants a focus timer."
- **Input:** `label?: string`, `minutes?: int 1–240`.
- **Behaviour:** if an open session exists, do not create another; reply with its time check ("You're already going. {elapsed} in."). Else insert `focus` row. Default label: active task title, else none.
- **Reply:** `"Okay, focus time started."` + `" I'll note {minutes} minutes."` if given.

### `time_check` · F5 · P0
- **Description:** "Use when the user asks how long they've been working, or how much time has passed."
- **Input:** none. Read-only.
- **Reply:** `"You've been at it for {elapsed}."` With `minutes` set add one stage phrase: halfway, "about five minutes left", or "you've passed your {minutes} minutes, no rush". Never "overdue", never "behind".
- **No session:** "No focus session is running. Want to start one?"

### `end_focus` · F5 · P0
- **Description:** "Use when the user says they are done working or wants to stop the timer."
- **Behaviour:** set `ended_at`, insert win `kind=focus` (text = label or "a focus session"), reply with duration. No session: "No focus session is running." (no write).
- **Reply:** `"Good work. You focused for {elapsed}."`

### `transition_warning` · F6 · P1
- **Description:** "Use when the user wants a heads-up before switching to something else, like leaving the house or a meeting."
- **Input:** `minutes: int 5–180` (required), `label?`.
- **Behaviour:** pure function, no storage. Returns the plan as one spoken sentence: heads-up points at half, 10, 5 and 2 minutes (those that fit in `minutes`). Result `_meta.schedule = [{atMinutes}]` so an assistant or the web client can schedule reminders (ADR-011).
- **Reply:** `"Okay. I'll count down to {label or 'the switch'} in {minutes} minutes: heads-up at {points}, and wrap up at 2."` (<= 3 sentences, numbers as words not needed).

## 3. Memory

### `brain_dump` · F7 · P0
- **Description:** "Use when the user says a stray thought, idea or reminder they want out of their head. Save it and ask nothing back."
- **Input:** `thought: string` (required).
- **Reply:** `"Got it. It's saved, so you can let it go."` (exact; does not echo thought). One short variant pool allowed.
- **No follow-up question**, ever.

### `sort_dump` · F7 · P0
- **Description:** "Use only when the user asks to hear their saved thoughts or brain dump."
- **Behaviour:** latest five un-archived items, newest first. Spoken as one sentence, items joined by commas, and "and N more" when there are more (a count of saved items is allowed; it is not a count of misses). Empty: "Nothing saved yet."
- **Reply:** `"You saved: {a}, {b}, {c}. Want me to read more?"` Echoed items truncated to 60 chars each.

### `park_my_place` · F8 · P0
- **Description:** "Use when the user is about to be interrupted or switch away and wants to remember where they were."
- **Input:** `note: string` (required; if missing, derive from active step title, else ask "Where are you right now?").
- **Reply:** `"Parked. I'll remember where you were."`

### `where_was_i` · F8 · P0
- **Description:** "Use when the user asks where they were, what they were doing, or returns after a break."
- **Reply:** `"{timeago}, you were here: {note}."`; also appends current step if one is open and `note` differs. None: "I don't have a spot saved yet."
- **Time ago:** `timewords.ago(created_at)`. No judgement ("only", "already", "a long time").

## 4. Decisions, motivation

### `pick_for_me` · F9 · P0
- **Description:** "Use when the user can't decide and wants Sidekick to choose for them."
- **Input:** `options?: string[]` (2–10).
- **Behaviour:** with options: uniform random pick (injectable RNG); no options: delegates to the `what_now` selection. Always exactly one result stated confidently, no hedging, no reasons list.
- **Reply:** `"Go with {option}."` / `"Do this: {suggestion}."`

### `match_energy` · F9 · P0
- **Description:** "Use when the user says how much energy they have, like low, medium or high, and wants one thing to do."
- **Input:** `energy: "low"|"medium"|"high"` (required; also accept "tired"/"wired" synonyms in router, not server).
- **Mapping:** low -> a quick dopamine/rest idea, or a step already marked tiny (first step of active task); medium -> next step; high -> next step of the active task and, if none, "pick something that's been waiting" (suggest `break_down_task`). One suggestion.
- **Reply:** `"With low energy, try this: {x}."`

### `what_now` · F9 · P0
- **Description:** "Use when the user asks what they should do right now, or doesn't know what to do."
- **Order (first hit wins):** 1) running focus session -> "Keep going, you're {elapsed} into {label}." 2) due routine (see F12) -> "It's time for {routine}." 3) next open step -> "Next tiny step: {step}." 4) a short break from `dopamine`. Exactly one sentence of suggestion.
- **Tests:** TC-030 (all four branches, plus ordering conflicts).

### `log_win` · F10 · P0
- **Description:** "Use when the user wants to record something they did, even something small."
- **Input:** `text: string` (required).
- **Reply:** `"Logged. That counts."`

### `my_wins` · F10 · P0
- **Description:** "Use when the user asks what they've done, wants to hear their wins, or feels like they did nothing."
- **Behaviour:** wins from the user's local "today" (`SIDEKICK_TZ`); if none today, last 24h; if none, last 7 days; if none ever: "Nothing logged yet, but we can start with one tiny thing." Reply names up to three newest items and, if more, "and {n} more". Counts of wins only, never of what wasn't done.
- **Reply:** `"Today you: {a}, {b} and {c}, and 4 more."`

## 5. Dopamine, routines, reset

### `dopamine_menu` · F11 · P1
- **Description:** "Use when the user needs a quick, enjoyable break or a little boost."
- **Reply:** one idea from `dopamine`, LRU rotated: `"Try this for five minutes: {idea}."` Seeds defaults on first use (DATA-MODEL §4).

### `add_dopamine_idea` · F11 · P1
- **Input:** `idea` (required, <= 60 chars). **Reply:** `"Added to your break ideas."`

### `add_routine` · F12 · P1
- **Description:** "Use when the user wants a daily reminder anchor, like taking out the bins or stretching."
- **Input:** `name` (required), `time_of_day?: "HH:MM"` local. **Reply:** `"Okay, {name} is on your daily list."` The tool only stores and repeats the user's own words. Medication-like names are accepted but no dosing or advice is ever generated (safety note, TC-063).

### `routine_check` · F12 · P1
- **Description:** "Use when the user asks which daily routines are coming up or what's due."
- **Due rule:** active routine with no `time_of_day`, or `now_local >= time_of_day`, and `last_done_on != today`. Returns one: `"It's time for {name}."` None: "Nothing is waiting right now." Wording never says overdue/late/missed.

### `routine_done` · F12 · P1
- **Input:** `name?` (fuzzy match, case-insensitive; default = the one `routine_check` would return). Sets `last_done_on = today`, inserts win `kind=routine`. **Reply:** `"Done. {name} is checked off for today."`

### `gentle_reset` · F13 · P1
- **Description:** "Use when the user says they had a bad day, wants a fresh start, or feels behind."
- **Behaviour (tx):** set every open task (and its steps) to `archived`, end any open focus session without logging a win, and clear parked bookmarks. Brain-dump items and wins are kept. Nothing is deleted. No counts, no "you had N unfinished".
- **Reply:** `"Fresh start. Nothing is held against you. Want to pick one tiny thing?"` (exact)

## 6. Data

### `delete_my_data` · F14 · P0
- **Description:** "Use only when the user clearly asks to erase all their Sidekick data."
- **Input:** `confirm?: boolean`.
- **Behaviour:** `confirm !== true` -> `"This erases everything I saved for you. Say yes to confirm."` (nothing written). `confirm === true` -> one tx deleting every row for the user in all 8 tables (incl. `ai_calls`), then `"Done. Everything is erased."` Idempotent. Annotations: `destructiveHint: true`.
- **Tests:** TC-050..052.

## 7. Tool inventory

| # | Tool | F | Pri | Writes | Reads | AI |
|---|---|---|---|---|---|---|
| 1 | break_down_task | F1 | P0 | tasks, ai_calls | | yes |
| 2 | next_step | F2 | P0 | | tasks | |
| 3 | complete_step | F2,F3 | P0 | tasks, wins | tasks | |
| 4 | im_stuck | F4 | P1 | | tasks | |
| 5 | start_focus | F5 | P0 | focus | tasks, focus | |
| 6 | time_check | F5 | P0 | | focus | |
| 7 | end_focus | F5 | P0 | focus, wins | focus | |
| 8 | transition_warning | F6 | P1 | | | |
| 9 | brain_dump | F7 | P0 | dump | | |
| 10 | sort_dump | F7 | P0 | | dump | |
| 11 | park_my_place | F8 | P0 | parked | tasks | |
| 12 | where_was_i | F8 | P0 | | parked, tasks | |
| 13 | pick_for_me | F9 | P0 | | (what_now) | |
| 14 | match_energy | F9 | P0 | | tasks, dopamine | |
| 15 | what_now | F9 | P0 | | focus, routines, tasks, dopamine | |
| 16 | log_win | F10 | P0 | wins | | |
| 17 | my_wins | F10 | P0 | | wins | |
| 18 | dopamine_menu | F11 | P1 | dopamine (seed) | dopamine | |
| 19 | add_dopamine_idea | F11 | P1 | dopamine | | |
| 20 | add_routine | F12 | P1 | routines | | |
| 21 | routine_check | F12 | P1 | | routines | |
| 22 | routine_done | F12 | P1 | routines, wins | routines | |
| 23 | gentle_reset | F13 | P1 | tasks, focus, parked | | |
| 24 | delete_my_data | F14 | P0 | all | | |

P0 count: 16 tools. P1 count: 8.

## 8. PRD gaps resolved here (confirm in RAID)

| Gap in PRD | Resolution | Ref |
|---|---|---|
| `sort_dump` returns up to 5 items but AC1 forbids lists | Spoken as one comma-joined sentence | A3 |
| `delete_my_data` is destructive, "asks at most one question" | Confirm flag, one question | A2 / ADR-012 |
| What "due routine" means | `time_of_day` reached and not done today | A4 |
| `im_stuck` / `match_energy` without AI | Curated pools (ADR-010) | ADR-010 |
| "Staged warnings" vs no push channel | Pull-based, plan in `_meta.schedule` | ADR-011 |
| Multiple open tasks | Latest-updated is active; none auto-closed | A5 |
