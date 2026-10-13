# Safety and copy rules

Status: Draft v1 · Implements AC1, AC2, PRD §5, §11 · Code: `core/reply.ts`, `core/lexicon.ts`, `core/safety.ts`

## 1. Reply rules (AC1)

| Rule | Check |
|---|---|
| 1 to 3 sentences | split on `[.!?]` followed by space or end; ellipses count once; count in 1..3 |
| Plain text | no `* # _ \` > [ ] ( ) |`, no leading `-` or `1.`; no emoji; no newlines |
| Short | each sentence <= 25 words (warn in tests, hard fail at 40) |
| Speakable | digits allowed; no URLs, no ids, no JSON |
| One question max | at most one `?` |

## 2. Banned words (AC2)

Whole-word, case-insensitive. Applied to **template text** and to AI steps. "Later" and "latest" are fine (whole-word match only).

| Tier | Words | Source |
|---|---|---|
| Core (PRD) | overdue, missed, failed, late | PRD AC2 |
| Extended (PROPOSED A6) | miss, fail, fails, failure, behind, lazy, should have, shouldn't have, procrastinate, procrastinating, streak, broke your | PRD §5 principle 3 |

User-supplied words are not rewritten (a user may say "late"); see §3.

## 3. Echoing user text

Tools may repeat the user's own words (step text, parked note, dump items). To keep AC1 true regardless of input, echoed text is:
1. stripped of markdown characters and newlines, whitespace collapsed;
2. has `.`, `!`, `?` and `...` replaced by commas, so it cannot add sentences;
3. truncated at 60 chars (dump items) or 100 chars (notes) at a word boundary;
4. exempt from the banned-word check (we do not censor the user), but counted for sentence length.

`speak()` therefore takes `{ template: string, echo?: Record<string,string> }`. Banned-word lint runs on the rendered template with echo slots masked. A unit test fuzzes echo slots with hostile input (markdown, multi-sentence, "late").

## 4. Enforcement

- **Build time:** `tests/reply-lint.test.ts` calls every tool through the real MCP server with realistic and hostile inputs and checks §1/§2 on `content[0].text` (TC-060, TC-061).
- **Run time:** `speak()` throws in `NODE_ENV=test`; in production it logs `{tool, rule}` (no text) and returns the safe sentence "Okay. I've got that." A `speak` violation is a P1 bug.
- **Template registry:** all templates live as constants next to each tool, so a grep-based test (TC-062) can lint source strings too.

## 5. Voice guide for copywriters

- Speak like a calm friend: "Okay." "Nice." "Got it." "Fresh start."
- Imperative, concrete, physical: "Put one cup in the sink."
- Never: "just", "simply", "you should", "you need to", time pressure, comparisons, counts of what's undone.
- Praise effort, not outcome: "That counts." not "Great job, you're so productive!"
- Numbers: counts of wins and saved items are fine; never counts of unfinished or dropped things.

## 6. Crisis handling (PRD §11)

- `safety.screen(text)` runs on every free-text input **before** storage or any AI call.
- Matches a phrase list in `lexicon.ts` (self-harm, suicide, "kill myself", "end it all", "don't want to be here", "hurt myself", and common variants). Word-boundary, case-insensitive, normalises apostrophes.
- On a match the tool **stores nothing, calls nothing**, and returns (not an error):

  > "I'm really glad you told me. You deserve support right now, so please contact your local emergency number or a crisis line, or reach someone you trust nearby. I'm here for small tasks whenever you want."

- Region-neutral on purpose (no hard-coded number). README documents that deployers may extend the text via `SIDEKICK_CRISIS_TEXT` (P1).
- **Limits (documented, not hidden):** keyword screening has false negatives and false positives. It is a safeguard for a productivity aid, not a clinical tool. Reviewed in T-051; do not claim detection in the submission text.
- The reply is exempt from the 3-sentence limit only if it stays at 3; it is written to fit.

## 7. Medical and scope boundaries

- No medication, dosing, diagnosis, or treatment content is generated anywhere. `add_routine` stores text only; reminders repeat it verbatim.
- If a routine name contains medication-like words we still store it and do not comment (TC-063).
- README and tool descriptions state: "A productivity aid, not medical advice."

## 8. Privacy rules

| Data | Where | Rule |
|---|---|---|
| Task text | Bedrock | Sent only for `break_down_task`; nothing else; no user id |
| User content | SQLite | Local file only; `delete_my_data` erases |
| Logs | stderr JSON lines | `{ts, tool, ok, ms, errClass?}`. Lint rule: no `console.*` outside `core/log.ts` |
| `ai_calls` | SQLite | model, attempt, success, error class, latency. No text |
| Telemetry | none | no third-party analytics |
