# Sidekick: Product Requirements Document

**Status:** Draft v1 · **Target:** Amazon Developer Hackathon, Alexa+ track + AWS Builder mini challenge

> Frozen copy of the original PRD. Engineering interpretation and gap-fill lives in the specs; conflicts are logged in [../plan/RAID.md](../plan/RAID.md).
> Known stale text: the PRD's references to the "Python MCP SDK" and `mcp<2` are superseded by [ADR-001](../architecture/DECISIONS.md) (TypeScript).

## 1. Summary

Sidekick is a voice-first assistant for people with ADHD. It helps you start tasks, feel time pass and park stray thoughts, one tiny step at a time. It is a self-hosted MCP server (Streamable HTTP, MCP spec 2025-11-25) that stores data in SQLite and uses Amazon Bedrock to break big tasks into tiny steps.

**The line to remember:** say "I can't start" and Sidekick gives you one tiny step, never a list.

## 2. Problem

People with ADHD usually know what to do; the trouble is starting, tracking time and holding the thought. Most productivity apps add more to manage, which is the wrong direction for this audience.

| Pain point | What it feels like | Sidekick response |
| --- | --- | --- |
| Task initiation | A big task is a wall; the first step is invisible | Break it into tiny steps; say only the first |
| Time blindness | Minutes vanish; transitions arrive as surprises | Focus sessions, plain-language time checks, staged warnings |
| Working memory | A stray thought loops; a place is lost after an interruption | One-sentence brain dump; "where was I" bookmark |
| Decision paralysis | Too many options, so nothing gets picked | Pick one thing, state it confidently |
| Shame spiral | A missed day feels like failure | No "overdue" language, wins log, gentle reset |

> TODO before submission: cite two or three clinical or community sources for these pain points.

## 3. Users

**Primary:** an adult with ADHD at home or at a desk who wants help without opening an app, screen or list. Speaking takes less effort than unlocking a phone and typing.

**Secondary:** anyone who gets stuck starting tasks (students, remote workers) and benefits from the same flow.

## 4. Goals and non-goals

**Goals**

1. Turn a spoken task into saved tiny steps and speak only the first one.
2. Keep every reply to one to three short sentences, safe to read aloud.
3. Run end to end with one server command plus a web client, with no accounts or paid services beyond Bedrock.
4. Show a real Bedrock call at runtime (AWS Builder mini challenge).

**Non-goals (v1)**

- Not a medical product: no diagnosis, medication or dosing advice, or treatment claims.
- No calendar, email or smart-home integrations.
- No accounts, billing or multi-device sync.

## 5. Principles

1. **Voice first:** every reply works when spoken, with no reliance on a screen.
2. **One thing at a time:** never read a list when a single next step will do.
3. **No shame:** no "overdue", no streak loss, no counts of what was missed.
4. **Low friction:** every tool works with almost no input and asks at most one question.
5. **Externalise memory and time:** the server holds what an ADHD brain tends to drop.

## 6. User stories

- As a user who is frozen, I say "I need to clean the kitchen" and hear only the first tiny step.
- As a user mid-task, I say "done" and hear the next step, or that the whole task is finished.
- As a user who loses track of time, I ask "how long have I been at this?" and get a plain answer.
- As a user with a stray thought, I say it once and it is saved, so I can let it go.
- As a user who was interrupted, I ask "where was I?" and hear my last bookmark.
- As a user who feels they did nothing, I ask for my wins and hear what I did.
- As a user who can't choose, I say "pick for me" and get one decision.
- As a user after a bad day, I say "fresh start" and nothing is held against me.

## 7. Functional requirements

Priority: **P0** = needed for the demo and submission; **P1** = if time allows.

### 7.1 Task initiation

| ID | Requirement | Priority |
| --- | --- | --- |
| F1 | `break_down_task` takes the task text, calls Bedrock, validates and saves 3 to 8 steps, returns only the first | P0 |
| F2 | `next_step` returns the next open step; `complete_step` marks it done, logs a win, returns the next | P0 |
| F3 | Finishing the last step marks the parent task done | P0 |
| F4 | `im_stuck` returns one tiny unblocking action, not advice | P1 |

### 7.2 Time

| ID | Requirement | Priority |
| --- | --- | --- |
| F5 | `start_focus`, `time_check` and `end_focus` track a session and answer in plain words | P0 |
| F6 | `transition_warning` gives a staged heads-up plan before switching activities | P1 |

### 7.3 Memory

| ID | Requirement | Priority |
| --- | --- | --- |
| F7 | `brain_dump` saves a thought with no follow-up questions; `sort_dump` returns up to five items on request | P0 |
| F8 | `park_my_place` and `where_was_i` save and recall a bookmark with how long ago it was | P0 |

### 7.4 Decisions, motivation, routines

| ID | Requirement | Priority |
| --- | --- | --- |
| F9 | `pick_for_me`, `match_energy` and `what_now` return exactly one suggestion; `what_now` order: running focus session, due routine, next step, short break | P0 |
| F10 | `log_win` and `my_wins` record and read back wins | P0 |
| F11 | `dopamine_menu` offers one short break; `add_dopamine_idea` extends it | P1 |
| F12 | `add_routine`, `routine_check`, `routine_done` handle daily anchors without "overdue" wording | P1 |
| F13 | `gentle_reset` gives a shame-free fresh start | P1 |
| F14 | `delete_my_data` removes every row for the caller | P0 |

### 7.5 Acceptance criteria (all tools)

- AC1: Every reply is at most three sentences, plain text, no markdown or lists.
- AC2: No reply contains "overdue", "missed", "failed" or "late" as judgement words.
- AC3: `break_down_task` never returns more than the first step in its spoken reply.

## 8. AI requirements (Amazon Bedrock)

- **Call:** Bedrock Converse API from the server, only for `break_down_task`; model id, region and timeout come from environment variables.
- **Prompt rules:** 3 to 8 steps; each a single physical action under 2 minutes; the first step almost embarrassingly easy; imperative voice; at most 12 words per step; no judgement words.
- **Output:** `{"steps": ["..."]}` only, forced through a tool schema where the model supports it.
- **Validation:** count between 3 and 8, every step non-empty and at most 12 words, no banned words. Anything else is a failure: retry once, then use a fixed fallback template (open what you need, do two minutes, take a short break).
- **Latency target:** a spoken reply within about 4 seconds (to be tuned once measured).
- **Dev mode:** `SIDEKICK_MOCK_AI=1` returns canned steps with no AWS call.
- **Privacy:** send only the task text; never a user id or other stored data.
- **Logging:** an `ai_calls` table records model, success, latency and time; it stores no response text.

## 9. Data (SQLite)

One file. Every table has `user_id` (v1 uses one fixed user; how Alexa+ identifies callers is open).

| Table | Purpose |
| --- | --- |
| `tasks` | A task and its tiny steps (step points to parent) |
| `dump` | Stray thoughts |
| `wins` | Completed steps, routines and focus sessions |
| `parked` | "Where was I" bookmarks |
| `focus` | Focus sessions; an open one has no end time |
| `routines` | Daily anchors, done once per day |
| `dopamine` | Quick breaks, seeded with defaults |
| `ai_calls` | Log of Bedrock calls (new) |

Times are stored as UTC epoch seconds and shown in the user's timezone. WAL mode, one writer.

## 10. Integration and architecture

- The Alexa+ add-on tools are in preview and limited to select partners, so Sidekick follows the path the hackathon FAQ allows: a self-hosted MCP server plus a web page that acts as a real MCP client (initialize, tools/list, tools/call over Streamable HTTP) at a single `/mcp` endpoint.
- Flow: user speaks or types → client → `tools/call` → server runs the tool against SQLite → for `break_down_task` only, calls Bedrock → returns one to three short sentences.
- Each tool description says in plain words when to use it, so an assistant such as Alexa+ can pick the right tool from natural speech.
- Optional bonus: show a general AI assistant calling the same server.

## 11. Safety and privacy

- A productivity aid, not treatment. Never gives medication or dosing advice; the routine tool only repeats reminders the user wrote.
- Never shames, counts misses or uses streak loss.
- If a message suggests crisis or self-harm risk, do not turn it into a task; respond with care and encourage contacting local emergency services, a crisis line or a trusted person nearby.
- Data stays in the local SQLite file; `delete_my_data` erases it. Logs record tool names and timings, not what the user said.

## 12. Success criteria

For the hackathon (judged on tech implementation, design, potential impact and quality of the idea):

- A judge can run the repo and complete the hero flow (task → first step → done → next step) in under a minute.
- Real Bedrock call visible in the demo and documented in Product Feedback.
- Protocol test passes: initialize, tools/list and tools/call over Streamable HTTP.
- Failure tests pass: Bedrock timeout, malformed JSON and too many steps all end in the fallback.
- Demo video under 3 minutes.

## 13. Milestones

| Milestone |
| --- |
| Bedrock-backed `break_down_task` with validation, fallback and mock mode |
| Web MCP client and `/mcp` Streamable HTTP endpoint |
| Tests, safety wording checks, `delete_my_data` |
| Feature freeze |
| Demo video, README, license |
| Submit (buffer day) |
| Hard deadline |

## 14. Submission checklist

- [ ] Public GitHub repo with source, assets, run instructions and an open-source license, or a private repo shared with the listed reviewers (invitations expire after 7 days, so share late)
- [ ] Text description of features and functionality
- [ ] Demo video link (under 3 minutes, public on YouTube or Vimeo, no unlicensed music or third-party trademarks)
- [ ] Track declared as Alexa+ and the AWS Builder mini challenge, with Bedrock usage described
- [ ] Product Feedback for each tool used
- [ ] Optional: feature requests and friction log entries (can add up to 10% to the Stage Two score)
- [ ] Runnable by judges through the judging period

## 15. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Bedrock slow or unavailable | Spoken reply stalls; demo breaks | Timeout, one retry, fallback template, mock mode |
| SQLite on AWS Lambda | Lambda storage is temporary; data lost between runs | Demo locally or on a small server; judges run the repo themselves |
| MCP spec version | Entry must implement spec 2025-11-25; the prototype pins `mcp<2` | Check the SDK against the spec before building the client |
| No AWS credits | Real Bedrock calls cost money | Mock in development; real calls only for testing and the demo |
| Alexa+ caller identity unknown | Cannot separate data per user | One fixed user in v1; `user_id` already in every table |
| Short schedule | Scope creeps past the deadline | Freeze at the feature-freeze milestone; cut P1 items first |

## 16. Open questions

- Which Bedrock model and region do we have access to, and which is fastest for short JSON output?
- Does the current Python MCP SDK implement spec 2025-11-25 over Streamable HTTP, and do we stay on version 1 or move to version 2 (where FastMCP was renamed)?
- Public repo with which license, or private and shared? The rules page lists a reviewer name that looks inconsistent with the Amazon reviewer list; verify first.
- Do we also package an Agent Skill, or ship the MCP server alone?
- Who is on the team, and who is the appointed representative?
- Is "Sidekick" free to use on Devpost, GitHub and the Alexa skill store?

## 17. References

- [Hackathon resources](https://amazonappdev2026.devpost.com/resources)
- [Rules](https://amazonappdev2026.devpost.com/rules)
- [FAQs](https://amazonappdev2026.devpost.com/details/faqs)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http)
