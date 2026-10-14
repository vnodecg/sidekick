import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createTestClient } from "../helpers/index.js";

const SERVER = fileURLToPath(new URL("../../build/index.js", import.meta.url));
const PACKAGE = fileURLToPath(new URL("../../package.json", import.meta.url));

const TOOL_NAMES = [
  "break_down_task", "next_step", "complete_step", "im_stuck",
  "start_focus", "time_check", "end_focus", "transition_warning",
  "brain_dump", "sort_dump", "park_my_place", "where_was_i",
  "pick_for_me", "match_energy", "what_now", "log_win", "my_wins",
  "dopamine_menu", "add_dopamine_idea", "add_routine", "routine_check", "routine_done",
  "gentle_reset", "delete_my_data",
];

describe("server boot (built)", () => {
  it("discovers all 24 tools with LLM-router descriptions and honest annotations (PRD tool inventory)", async () => {
    const client = await createTestClient();
    try {
      const { tools } = await client.listTools();
      assert.deepStrictEqual(tools.map((tool) => tool.name).sort(), [...TOOL_NAMES].sort());
      assert.ok(tools.every((tool) => (tool.description ?? "").startsWith("Use ")));
      const destructive = tools.filter((tool) => tool.annotations?.destructiveHint === true).map((tool) => tool.name);
      assert.deepStrictEqual(destructive, ["delete_my_data"]);
    } finally {
      await client.teardown();
    }
  });

  it("refuses to bind beyond loopback without a token (TC-049)", () => {
    const result = spawnSync("node", [SERVER], {
      env: { PATH: process.env.PATH, STARTER_TRANSPORT: "http", SIDEKICK_HOST: "0.0.0.0", SIDEKICK_MOCK_AI: "1", SIDEKICK_DB_PATH: ":memory:" },
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /SIDEKICK_AUTH_TOKEN: required when SIDEKICK_HOST is not loopback/);
  });

  it("exits non-zero with a readable message on invalid configuration", () => {
    const result = spawnSync("node", [SERVER], {
      env: { PATH: process.env.PATH, STARTER_TRANSPORT: "http", PORT: "not-a-port" },
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 1);
    assert.strictEqual(result.stdout, "");
    assert.match(result.stderr, /Invalid configuration.*PORT/);
  });

  it("reports the package version as the server version", async () => {
    const { version } = JSON.parse(readFileSync(PACKAGE, "utf8")) as { version: string };
    const client = await createTestClient();
    try {
      assert.strictEqual(client.getServerVersion()?.name, "sidekick");
      assert.strictEqual(client.getServerVersion()?.version, version);
    } finally {
      await client.teardown();
    }
  });
});
