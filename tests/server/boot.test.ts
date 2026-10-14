import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createTestClient } from "../helpers/index.js";

const SERVER = fileURLToPath(new URL("../../build/index.js", import.meta.url));
const PACKAGE = fileURLToPath(new URL("../../package.json", import.meta.url));

describe("server boot (built)", () => {
  it("serves an empty tool list when no module registers tools", async () => {
    const client = await createTestClient();
    try {
      const { tools } = await client.listTools();
      assert.deepStrictEqual(tools, []);
    } finally {
      await client.teardown();
    }
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
