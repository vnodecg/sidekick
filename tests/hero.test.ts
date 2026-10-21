import assert from "node:assert";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SCRIPT = fileURLToPath(new URL("../scripts/hero.mjs", import.meta.url));
const MAX_MS = 60_000;

describe("scripts/hero.mjs (TC-100)", () => {
  it("runs the hero flow in mock mode and prints four replies inside a minute", async () => {
    const started = performance.now();
    const { stdout } = await promisify(execFile)("node", [SCRIPT], { timeout: MAX_MS });
    const replies = stdout.split("\n").filter((line) => /^(?:break_down_task|complete_step|next_step|my_wins)\s/.test(line));
    assert.strictEqual(replies.length, 4, stdout);
    assert.match(stdout, /source: mock/);
    assert.ok(performance.now() - started < MAX_MS);
  });
});
