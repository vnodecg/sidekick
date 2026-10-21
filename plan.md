# Submission plan: Amazon Developer Hackathon (Alexa+ track)

Source of truth for tasks remains `docs/plan/TASKS.md`; detailed submission pack in `docs/plan/SUBMISSION.md`. This file is the consolidated plan after reviewing the official Devpost rules.

## 1. Entries

| Entry | Decision |
|---|---|
| Primary track | **Alexa+**, via the **simulated-experience path** (no Alexa+ access): a web app simulating the Alexa+ voice experience that talks to our self-hosted MCP server (spec 2025-11-25, Streamable HTTP). Rules: no specific framework required, but the repo must include the simulation's source and the demo must clearly show it working |
| Mini challenge: AWS Builder | **Yes.** Amazon Bedrock in `break_down_task`; needs documented integration |
| Mini challenge: Open Source | **Open decision.** Needs a *new, additional* open-source project or a contribution (branch/fork/PR) to a public repo made during the window. Sidekick itself probably does not count. Needs contribution URL, repo URL, GitHub username, short description |
| Prize limit | One track prize and one mini-challenge prize per project |

## 1a. Simulated Alexa+ path (what this means for us)

The web client (`web/public/`: `mcp-client.js`, `router.js`, `app.js`) is the simulation. It is a real MCP client over Streamable HTTP with speech in/out, so the simulation is genuine protocol traffic, not a mock.

- [ ] Frame it honestly everywhere: "Alexa+-style voice simulator", not an Alexa product. No Amazon/Alexa logos or trademarked sounds (wake word chime, light ring). Plain name mentions only
- [ ] Make the simulation read as an assistant: wake phrase or push-to-talk, spoken reply (speech synthesis), visible transcript, "assistant is calling Sidekick" state driven by real `tools/call` events
- [ ] Keep the tool-call drawer: it proves the assistant is calling the MCP server rather than scripted UI
- [ ] README states: simulation source lives in `web/public/`, how to run it, and that Alexa+ add-on tools are preview-only
- [ ] Optional extra for the "Agent Skills" angle in the rules: add a `SKILL.md` Agent Skill that wraps Sidekick's MCP tools, so any agentic tool can load it (P1, only if time allows)
- [ ] T-091 stays P0: a second, independent MCP client (Claude Desktop/Inspector) calling the same `/mcp` shows the server is a standard integration, not coupled to our UI

## 2. Required submission items

- [ ] Text description: what it does, how it works
- [ ] GitHub repo with all source, assets and run instructions
  - Public + open-source licence file (MIT present), **or**
  - Private, shared with `testing@devpost.com`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`. Add at submit time (invites expire after 7 days)
- [ ] Repo calls the track tech in code (MCP server entry: `src/index.ts`, `src/server/boot.ts`); point to it in README and video
- [ ] Demo video: under 3:00, public on YouTube/Vimeo, English, no third-party trademarks, no unlicensed music
- [ ] **Product feedback** on every tool/API/SDK used (what for, what worked, what needs work, onboarding, would build again). Include AWS services and how
- [ ] Tracks and mini challenges declared
- [ ] "What changed during the hackathon window" (project pre-existed; needs window dates)
- [ ] Optional: feature requests (critical / important / nice-to-have)
- [ ] Optional: friction log entries (up to +10% judging bonus): task, steps, expected vs actual, severity, workaround, suggestion

## 3. Corrections needed in `docs/plan/SUBMISSION.md`

1. Product feedback is **required**, not optional.
2. Friction log is optional with up to 10% judging bonus. Add severity and expected-vs-actual fields to the template.
3. Add feature-request template with urgency.
4. Add "what changed during the hackathon" section.
5. Replace reviewer note with exact collaborator list above.
6. Add Open Source mini-challenge decision.
7. Promote T-091 (general assistant calling `/mcp`) from bonus to P0: it is the clearest Alexa+ integration evidence.

## 4. Work order

1. **T-011 Bedrock**: get model access, real call, measure p50/p95 over 20+ calls into `docs/plan/LATENCY.md`. Run `npm run hero -- --bedrock` (TC-101). Unblocks AWS Builder and the demo.
2. **Finish T-024, T-053, T-054**: device checks (TEST-PLAN §6), hero script with Bedrock, CI green.
3. **T-060 freeze**: tag `v1.0.0-rc1`; mark leftover P1 `dropped`.
4. **T-091**: capture a general assistant (Claude Desktop/Inspector) calling the same `/mcp`.
5. **T-071 video** (see §5).
6. **T-070 README**, **T-072 submission text**, **T-073 product feedback + friction log**, **T-074 cited sources**, **T-075 name check**, **T-076 repo visibility**.
7. Decide Open Source entry; if yes, ship spin-off or PR and add to submission.
8. **Pre-submit checks** (§6), then **T-077 submit** and save confirmation.

## 5. Demo video (target 2:40, lead with best material)

| Time | Shot |
|---|---|
| 0:00-0:10 | One-line problem, straight into voice |
| 0:10-0:50 | Hero flow by voice in the Alexa+-style simulator: "I can't start" -> one tiny step, no lists. Say on screen/voiceover that this is a simulated Alexa+ experience |
| 0:50-1:20 | Tool drawer: initialize, tools/list, tools/call; `source: bedrock` chip and latency |
| 1:20-1:50 | General assistant calling the same `/mcp` (T-091) |
| 1:50-2:10 | Focus timer, brain dump, "where was I" |
| 2:10-2:30 | Failure fallback (AWS creds unset): still calm |
| 2:30-2:40 | Wins, delete my data, repo URL |

Rules: Chrome 1080p, system voice, no music, no logos, captions on, rehearse twice, record a mock-mode backup take.

## 6. Pre-submit checks

- [ ] Clean clone on another machine: `npm ci && npm start`, hero flow works in mock and with Bedrock
- [ ] README commands copy-paste correctly
- [ ] `LICENSE` present; no secrets in git history
- [ ] `npm run lint && npm run typecheck && npm test` green
- [ ] Video plays logged out, under 3:00
- [ ] Devpost links open in a private window
- [ ] Reviewers added (if private) and invites accepted
- [ ] Tag `v1.0.0` pushed; commit hash in README

## 7. Judging criteria mapping

| Criterion | Evidence |
|---|---|
| Tech Implementation | MCP 2025-11-25 over Streamable HTTP, Bedrock forced tool use with validated fallback, protocol tests, 24 tools |
| Design | Calm voice UX, 1-3 sentence replies, no lists, a11y (Lighthouse 100) |
| Potential Impact | Cited ADHD pain-point sources (T-074), works with any MCP assistant, delete-my-data |
| Quality of the Idea | "One tiny step, never a list"; shame-free by construction |

## 8. Open questions

- Hackathon window dates and submission deadline (not in the pasted rules)
- Is the optional `SKILL.md` Agent Skill worth adding, or is the simulator plus MCP server enough?
- Public or private repo
- Enter Open Source mini challenge? If so, which spin-off or PR
