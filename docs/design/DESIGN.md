# Design

Status: Draft v1 · Implements PRD §3, §5, §6 · Companion: [SAFETY-COPY.md](../specs/SAFETY-COPY.md)

## 1. Design intent

Reduce friction to near zero and never add something to manage. The product is a **voice**; the screen exists only so judges (and people without a smart speaker) can use and inspect it.

Principles to concrete rules:

| Principle (PRD §5) | Rule |
|---|---|
| Voice first | Every flow is completable by speaking. The UI shows nothing the reply does not say. |
| One thing at a time | The UI shows one large line (the latest reply). No lists, no task boards, no step counters. |
| No shame | No red, no warning icons, no "overdue", no streak or completion percentages. |
| Low friction | One big mic button; typed input is a fallback. No settings screen. At most one question per reply. |
| Externalise memory/time | Elapsed focus time is visible as a calm, passive clock when a session is running. |

## 2. Voice UX

### 2.1 Conversation model
Stateless utterances, stateful server. The user never needs to say a tool name, an id, or "step 3".

### 2.2 Golden path scripts (also the demo and TC-100)

| User says | Tool | Sidekick says |
|---|---|---|
| "I need to clean the kitchen." | break_down_task | "Okay. First tiny step: Put one dish in the sink." |
| "Done." | complete_step | "Nice. Next tiny step: Fill the sink with warm water." |
| "How long have I been at this?" (after "start focus") | time_check | "You've been at it for 6 minutes." |
| "Remember to email Sam about the invoice." | brain_dump | "Got it. It's saved, so you can let it go." |
| "Where was I?" | where_was_i | "10 minutes ago, you were here: wiping the counter." |
| "What have I done today?" | my_wins | "Today you: put one dish in the sink and filled the sink." |
| "Pick for me, pasta or rice." | pick_for_me | "Go with pasta." |
| "Fresh start." | gentle_reset | "Fresh start. Nothing is held against you. Want to pick one tiny thing?" |

### 2.3 Empty and error states (all spoken, all calm)
- No data: "Nothing saved yet." / "Nothing is waiting right now."
- Server fault: "Sorry, I couldn't do that just now. Try me again in a moment." (no codes)
- Unrecognised intent in the web client: routes to `what_now`, never "I didn't understand".
- Slow reply (> 2 s): UI shows a soft pulse, no spinner text, no "loading".

### 2.4 Speech
- Speech output: `speechSynthesis`, rate 0.95, one utterance per reply, cancelled when a new one starts. Mute toggle.
- Speech input: `SpeechRecognition` (Chrome/Edge). Push-to-talk (tap to start, auto-stop on silence). If unsupported: typed input is shown automatically with a one-line note.
- Never read `_meta`, source badges or trace.

## 3. Web client UI

### 3.1 Layout (mobile first, then desktop)

```
+------------------------------------------+
|  Sidekick                       [mute]   |   top bar: name, mute only
|                                          |
|   First tiny step:                       |
|   Put one dish in the sink.              |   hero line: latest reply, 28-36px
|                                          |
|              ( mic )                     |   72px round button, tap to talk
|        or type...  [______________] [>]  |   text input, visible when no speech API
|                                          |
|   focus  06:12                           |   only while a focus session runs
|------------------------------------------|
|  > Tool calls (for judges)       [open]  |   collapsed drawer
|    initialize          200   18 ms       |
|    tools/call break_down_task  1.2 s     |
|    source: bedrock · anthropic.claude... |
+------------------------------------------+
```

- **Hero line** is the product. Everything else is secondary and quiet.
- **Tool-call drawer** (collapsed by default, `?debug=1` opens it): a table of the real JSON-RPC calls (method, tool, args, ms, status), response text, and a `source` chip (`bedrock`, `fallback`, `mock`) so the Bedrock call is visibly real (PRD §12). Raw JSON expandable.
- **Source chip** is text, not colour alone. `fallback` is neutral grey, never red.

### 3.2 Visual language
- Calm, low-stimulation: off-white `#FAF8F5` / dark `#16181D`, one accent `#3B6FD4` (focus ring and mic active state), body text >= 18px, line-height 1.5, hero >= 28px.
- Font: system UI stack (no network fonts; works offline).
- Motion: one gentle 300 ms fade for reply text; mic pulse while listening. Respect `prefers-reduced-motion` (remove pulse and fades).
- Dark mode via `prefers-color-scheme`; both themes meet WCAG AA contrast.
- No toasts, modals, badges, counters or streak visuals. Delete flow uses the spoken confirm, not a modal.

### 3.3 Accessibility
- Mic button is a real `<button>` with `aria-pressed`; reply region is `aria-live="polite"` so screen readers announce new replies.
- Full keyboard use: `Space` toggles mic when focus is on the button, `Enter` submits typed input, `/` focuses the input.
- Touch targets >= 44px. Works at 320px width. No hover-only controls.
- Does not rely on colour, sound or motion alone.

### 3.4 States
`idle` -> `listening` -> `thinking` (tool in flight) -> `speaking` -> `idle`. Errors fall back to idle with the calm spoken sentence. Offline/server-down: "I can't reach Sidekick right now." plus the typed input stays enabled.

## 4. Persona and tone

Name: Sidekick. Warm, brief, never gushing. Does not claim feelings, does not give medical or emotional advice, does not moralise. Tool descriptions (read by other assistants) mirror this: plain, "Use when the user says ...".

## 5. Copy inventory

All spoken strings are constants in each tool module and listed in [TOOLS.md](../specs/TOOLS.md). A copy review (T-052) checks them against SAFETY-COPY §5 once, before freeze, because copy is the product.

## 6. Demo and README design

- README top: one-line pitch, a 20-second GIF of the hero flow, `npm ci && npm start`, link to docs.
- Demo video (< 3 min, plan in [SUBMISSION.md](../plan/SUBMISSION.md)): voice only on screen, drawer open once to show the Bedrock call and the `initialize -> tools/list -> tools/call` trace.
