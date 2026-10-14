# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

Sidekick is a voice-first ADHD assistant: a self-hosted [MCP](https://modelcontextprotocol.io) server (TypeScript, Streamable HTTP) with SQLite storage and Amazon Bedrock for task breakdown. Product and design intent live in `docs/`. Start at `docs/README.md`; it is the source of truth and defines ID and status conventions. Update the owning spec in the same change as any behaviour change.

## Commands

| Command | Purpose |
|---|---|
| `npm run build` | Compile to `build/` (required before `dev`, `inspect`, `serve:*`) |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` / `lint:fix` | ESLint (strict, type-checked) |
| `npm test` | All tests (Node native runner); one file: `node --test tests/<name>.test.ts` |
| `npm run knip` | Find unused files, exports and dependencies |
| `npm run dev` / `inspect` | REPL / MCP Inspector for manual protocol testing |
| `npm run gen:tool` / `gen:prompt` / `gen:resource` | Hygen generators (module plus test) |

Before finishing any task, run `npm run lint && npm run typecheck && npm test`. All three must pass.

## Architecture

- `src/index.ts` is the entry point; `src/server/boot.ts` wires transport and registry.
- `src/registry/` auto-discovers modules in `src/tools/`, `src/resources/`, `src/prompts/`. Drop a file in the right directory; do not register by hand.
- Every module default-exports a `RegisterableModule` (`src/registry/types.ts`).
- Inputs are validated with Zod. Never trust unvalidated input.
- Only `break_down_task` may call Bedrock, and only task text may leave the process.

## Code standards

Keep code clean, DRY and minimal.

- **Minimal:** implement only what the task or spec requires. No speculative abstractions, options, or dead code. Delete what you replace.
- **DRY:** before writing a helper, search for an existing one. Extract on the second real duplicate, not before. `sonarjs/no-identical-functions` and `no-duplicate-string` are enforced.
- **Types:** strict TypeScript. No `any`, no `!` assertions, no `@ts-ignore` (`@ts-expect-error` needs a description). Use `type`, not `interface`; string-literal unions and `as const`, not enums; `Array<T>`, not `T[]`.
- **Style:** ES modules with `.js` extensions in relative imports; `import type` for types; named exports except module defaults; explicit return types on functions; max 3 parameters (use an options object beyond that); complexity at most 10.
- **Naming:** `camelCase` for values and functions, `PascalCase` for types, `UPPER_CASE` for constants.
- **Errors:** throw `Error` objects, handle promises (no floating promises), validate at boundaries and trust internal types.
- **Comments:** the linter forbids inline and TODO-style comments. Write self-explanatory code; use a block comment only for a non-obvious *why*.
- **Dependencies:** add one only when the standard library or an existing dependency cannot do the job. Run `npm run knip` after removing or adding code.

## Testing

- Node native test runner, no extra frameworks. Tests live in `tests/` and mirror `src/`.
- Use helpers in `tests/helpers/` (`withTestClient`, `assertToolResponse`, `assertToolError`) rather than duplicating setup.
- Every new tool, resource or prompt ships with a test. Cover the failure path, not only the happy path.
- Default test runs must not call AWS. Use mock AI mode (`SIDEKICK_MOCK_AI=1`).

## Privacy and safety

- Never log or store user content in logs or `ai_calls`; no `console.log` of user text.
- Follow `docs/specs/SAFETY-COPY.md` for reply shape, banned words and crisis handling.
- Never commit secrets, `.env` files or SQLite data files.

## Workflow

- Small, focused changes. Do not mix refactors with behaviour changes.
- Do not edit generated output (`build/`) or lockfiles by hand.
- Task status lives only in `docs/plan/TASKS.md`; flip it when a task is finished.
