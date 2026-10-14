# Friction log

Raw material for the Product Feedback section ([SUBMISSION.md](SUBMISSION.md)). Newest last. Facts only.

| Date | Tool | Friction | Workaround |
|---|---|---|---|
| 2026-10-14 | MCP TypeScript SDK | Lockfile resolved 1.20.2 while the starter claimed spec 2025-11-25 support; the server silently answered `initialize` with `2025-06-18`. No warning anywhere. | Upgrade to ^1.32.1 and pin the negotiated version in a test (ADR-002). |
| 2026-10-14 | MCP TypeScript SDK | `McpServer` installs `tools/list` only when the first tool is registered, so a server with no tools answers `-32601 Method not found`. The check is on private state. | Probe with `server.server.assertCanSetRequestHandler("tools/list")` and install an empty list. |
| 2026-10-14 | MCP TypeScript SDK | `listChanged: true` is hard-coded for tools even when the tool set is static. | Left as is; documented in ADR-002. |
| 2026-10-14 | `node:sqlite` | Experimental warning on every start. | `--disable-warning=ExperimentalWarning` in `npm start` (ADR-003). |
| 2026-10-14 | dotenv 17 | `config()` prints a banner to stdout, which corrupts the stdio MCP transport. | `config({ quiet: true })`. |
| 2026-10-14 | drizzle-orm | Stable 0.45.x has no `node:sqlite` driver; `drizzle-orm/node-sqlite` exists only in the 1.0 RC. | Exact-pin `1.0.0-rc.4` (ADR-013). |
| 2026-10-14 | drizzle-kit | `casing: "snake_case"` is not applied to column names or check-constraint SQL in `generate` (output had `"isDefault"`). | Explicit column names. |
| 2026-10-14 | drizzle-orm | Sync-driver `db.transaction` rejects a generic `T` callback through a conditional type; `db.$count()` returns a lazy builder, not a number. | One documented cast in `tx()`; `select({ n: count() })` in tests. |
