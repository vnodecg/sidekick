# Submission pack

Status: Draft v1 · Tracks PRD §14 · Owner: PM · Tasks T-070..T-077, T-091

## 1. Checklist (mirror of PRD §14, with task links)

- [ ] Repo: public with open-source licence (MIT proposed) **or** private shared with listed reviewers late (invitations expire in 7 days). T-076
- [ ] Source, assets and run instructions in README. T-070
- [ ] Text description of features and functionality. T-072
- [ ] Demo video < 3 min, public on YouTube/Vimeo, no unlicensed music, no third-party trademarks. T-071
- [ ] Track declared: **Alexa+** and **AWS Builder mini challenge**, Bedrock usage described. T-072
- [ ] Product Feedback for each tool used. T-073
- [ ] Optional: feature requests and friction-log entries (up to +10% Stage Two). T-073
- [ ] Runnable by judges through the judging period. T-070, [PLAN.md](PLAN.md) §7
- [ ] Devpost confirmation saved. T-077

## 2. Submission text outline

1. **One-liner:** "Say 'I can't start' and Sidekick gives you one tiny step, never a list."
2. **The problem** (with 2–3 cited sources, T-074): task initiation, time blindness, working memory, decision paralysis, shame.
3. **What it does:** voice-first MCP server with 24 tools in five groups (start, time, memory, decide, reset); one to three short sentences per reply; no shame language by construction.
4. **How it is built:** TypeScript MCP server (Streamable HTTP, spec 2025-11-25), SQLite, web page acting as a real MCP client; any MCP assistant can use `/mcp`.
5. **Amazon Bedrock usage:** summarise [AI-BEDROCK.md](../specs/AI-BEDROCK.md); add model id and measured latency from `LATENCY.md`.
6. **Safety and privacy:** not medical advice; crisis handling; local data; `delete_my_data`.
7. **Honest limits:** Alexa+ add-on tools are preview-only, so integration is via self-hosted MCP; single user; keyword crisis screen; pull-based time checks.
8. **What's next:** Alexa+ identity, per-user accounts, streamed first step.

## 3. Demo video script (target 2:40)

| Time | Shot | Voiceover / on screen |
|---|---|---|
| 0:00–0:15 | Problem: person staring at a messy kitchen | "A big task is a wall. Sidekick finds the first step." |
| 0:15–0:50 | Hero flow by voice, script in [DESIGN.md](../design/DESIGN.md) §2.2 | Reply text large; no lists |
| 0:50–1:20 | Open tool drawer: initialize, tools/list, tools/call; `source: bedrock`, latency | "Real MCP over Streamable HTTP; real Bedrock call" |
| 1:20–1:50 | Time and memory: start focus, "how long", brain dump, "where was I" | |
| 1:50–2:10 | Failure handling: unset AWS creds or fake timeout -> fallback steps, still calm | "Never leaves you stuck" |
| 2:10–2:30 | Wins and fresh start; mention delete my data | "No shame, ever" |
| 2:30–2:40 | General assistant calling the same server (T-091) + repo URL | |

Rules: record in Chrome at 1080p, system voice, no music, no logos other than our own; captions on; rehearse twice; keep a backup take recorded in mock mode (R1).

## 4. Product Feedback template (one entry per tool/service used)

```
Tool/service:        <Amazon Bedrock Converse | MCP TypeScript SDK | node:sqlite | Alexa+ docs | MCP Inspector | ...>
What I used it for:  <one sentence>
What worked well:    <specific>
Friction / bug:      <exact error, version, workaround>
Request:             <feature or doc change>
Evidence:            <link, command, request id>
Time lost:           <minutes>
```

Pre-seed entries while building (log as you go in `docs/plan/FRICTION.md`, created on first entry), not at the end:
- Bedrock Converse: forced `toolChoice` support per model; cold-start and p50/p95 latency; region/model access flow (Q1).
- MCP SDK: protocol version negotiation vs 2025-11-25 (T-003); `server.tool` vs `registerTool`; single shared transport in the starter. Details: ADR-002 result and [FRICTION.md](FRICTION.md).
- Alexa+: preview limitation, caller identity not exposed, no way for an individual developer to attach tools.
- Plus one entry per Sidekick tool group stating how its description was written for an LLM router.

## 5. Final pre-submit checks (buffer day)

- [ ] Clean clone on another machine: `npm ci && npm start`, hero flow works (mock), and with Bedrock
- [ ] README commands copy-paste correctly
- [ ] `LICENSE` present; no secrets in git history (`git log -p | grep -i aws_`)
- [ ] Video plays logged out; length < 3:00
- [ ] Links in the Devpost form open in a private window
- [ ] Tag `v1.0.0` pushed; commit hash noted in README
