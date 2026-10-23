# Sidekick

**Say "I can't start" and Sidekick gives you one tiny step, never a list.**

A voice-first assistant for people with ADHD. It helps you start tasks, feel time pass and park stray thoughts, one tiny step at a time. Sidekick is a self-hosted [MCP](https://modelcontextprotocol.io) server (Streamable HTTP, spec 2025-11-25) that keeps data in SQLite and uses Amazon Bedrock to break big tasks into tiny steps. A small web page acts as a real MCP client, so you can speak to it or type.

Built for the Amazon Developer Hackathon: Alexa+ track and AWS Builder mini challenge.

> A productivity aid, not medical advice. Sidekick does not diagnose, treat, or give medication guidance.

## Status

All 24 tools and the web client are implemented and run in mock mode. Real Amazon Bedrock calls need an API key (see *With Amazon Bedrock*). Track progress in [docs/plan/TASKS.md](docs/plan/TASKS.md).

## What it does

| You say | Sidekick says |
|---|---|
| "I need to clean the kitchen." | "Okay. First tiny step: put one dish in the sink." |
| "Done." | "Nice. Next tiny step: fill the sink with warm water." |
| "How long have I been at this?" | "You've been at it for 6 minutes." |
| "Remember to email Sam." | "Got it. It's saved, so you can let it go." |
| "Where was I?" | "10 minutes ago, you were here: wiping the counter." |
| "Fresh start." | "Fresh start. Nothing is held against you." |

Every reply is one to three short, plain sentences that are safe to read aloud. No "overdue", no streaks, no counts of what you missed.

24 tools in five groups:

- **Start:** `break_down_task`, `next_step`, `complete_step`, `im_stuck`
- **Time:** `start_focus`, `time_check`, `end_focus`, `transition_warning`
- **Memory:** `brain_dump`, `sort_dump`, `park_my_place`, `where_was_i`
- **Decide and motivate:** `pick_for_me`, `match_energy`, `what_now`, `log_win`, `my_wins`, `dopamine_menu`, `add_dopamine_idea`
- **Routines and reset:** `add_routine`, `routine_check`, `routine_done`, `gentle_reset`, `delete_my_data`

Full behaviour: [docs/specs/TOOLS.md](docs/specs/TOOLS.md).

## How it works

```
You (voice/typing) -> web client -> POST /mcp (tools/call) -> Sidekick server -> SQLite
                                                                   |
                                                    break_down_task only
                                                                   v
                                                      Amazon Bedrock (Converse)
```

- **Bedrock** is called only by `break_down_task`, and only the task text is sent. Output is forced into a JSON schema, validated (3 to 8 steps, at most 12 words each, no judgement words), retried once, then replaced by a fixed fallback if it still fails. Details: [docs/specs/AI-BEDROCK.md](docs/specs/AI-BEDROCK.md).
- **Everything else is deterministic** and runs locally against one SQLite file.
- **Any MCP client** can use the same `/mcp` endpoint (MCP Inspector, Claude Desktop, and so on).

## Quick start

Requirements: Node.js >= 22.13. The commands work on macOS, Linux and Windows (PowerShell: use `Copy-Item .env.example .env`).

```bash
npm ci
cp .env.example .env      # loaded automatically; mock mode is on by default
npm start                 # builds, serves the web client and /mcp on http://127.0.0.1:3000
```

Open http://127.0.0.1:3000, tap the mic (Chrome or Edge) or type. `http://127.0.0.1:3000/healthz` reports `"mockAi": true` when running without AWS.

### Without AWS (mock steps, no cost)

Keep `SIDEKICK_MOCK_AI=1` in `.env` (the default in `.env.example`), or run `SIDEKICK_MOCK_AI=1 npm start`.

### With Amazon Bedrock

In `.env`, remove `SIDEKICK_MOCK_AI=1` and set:

```bash
AWS_REGION=us-east-1                      # a region where you have model access
SIDEKICK_BEDROCK_MODEL_ID=<model-or-inference-profile-id>
AWS_BEARER_TOKEN_BEDROCK=<your Bedrock API key>
```

Then `npm start`. Check `/healthz` shows `"mockAi": false`, and `npm run hero -- --bedrock` should report `source: ai` for `break_down_task`.

Open the "Tool calls" drawer in the page to see the real `initialize`, `tools/list` and `tools/call` traffic and a `source` chip (`bedrock`, `fallback`, `mock`).

### Docker

```bash
docker compose up --build   # data persists in ./data
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `SIDEKICK_HOST` | `3000` / `127.0.0.1` | bind address |
| `SIDEKICK_DB_PATH` | `./data/sidekick.db` | SQLite file |
| `SIDEKICK_TZ` | system timezone | local-day boundaries |
| `SIDEKICK_MOCK_AI` | unset | `1` = canned steps, no AWS call |
| `AWS_REGION` | none | Bedrock region |
| `SIDEKICK_BEDROCK_MODEL_ID` | none | model or inference profile id |
| `SIDEKICK_AI_TIMEOUT_MS` / `SIDEKICK_AI_BUDGET_MS` | `2500` / `4500` | per-attempt and total AI time |
| `SIDEKICK_ALLOWED_ORIGINS` | localhost | allowed browser origins |
| `SIDEKICK_AUTH_TOKEN` | unset | bearer token for `/mcp`; required when `SIDEKICK_HOST` is not loopback |
| `SIDEKICK_ALLOW_OPEN_BIND` | unset | `1` skips that requirement (used by `docker-compose.yml`, which only publishes on 127.0.0.1) |

Full list: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) §6.

## Privacy and safety

- Data stays in the local SQLite file. `delete_my_data` erases it (it asks for confirmation first).
- Logs record tool names and timings, never what you said. The `ai_calls` table stores model, success and latency, no text.
- If a message suggests crisis or self-harm risk, Sidekick stores nothing and encourages contacting local emergency services, a crisis line or someone nearby. This is a simple keyword safeguard and will miss things; it is not a clinical tool.
- Limits of the crisis screen: it matches a fixed list of phrases (see `src/core/lexicon.ts`), so indirect wording such as "I can't do this anymore" is not caught, and a harmless sentence that contains a listed phrase ("I want to die laughing") is. Ordinary near misses such as "this task is killing me" or "kill the process" pass through as normal tasks. Deployers should treat it as a safeguard for a productivity aid and not as detection.

## Known limits

- One user per database in v1; no accounts or sync.
- Not suitable for AWS Lambda (ephemeral storage); run locally, in Docker, or on a small server.
- Time awareness is on request, not proactive: an MCP server cannot speak unprompted.
- Alexa+ add-on tools are preview-only, so integration is via self-hosted MCP plus the web client.
- Speech input needs a browser with the Web Speech API (Chrome, Edge); other browsers get typed input.

## Development

```bash
npm run build        # compile TypeScript
npm test             # node --test
npm run lint && npm run typecheck
npm run hero         # hero flow over real HTTP in mock mode (add -- --bedrock for a real model)
npm run inspect      # MCP Inspector (stdio)
npm run inspect:http # MCP Inspector against http://localhost:3000/mcp
```

Tools are auto-loaded from `src/tools/`; see [CLAUDE.md](CLAUDE.md) for the module pattern.

## Documentation

Start at [docs/README.md](docs/README.md): PRD, architecture and decisions, tool specs, data model, design, delivery plan, task tracker, test plan, risks and submission pack.

## License

MIT (see `LICENSE`, added in task T-001).
