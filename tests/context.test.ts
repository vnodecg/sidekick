import assert from "node:assert";
import { describe, it } from "node:test";
import { makeContext, TEST_START } from "./helpers/index.js";
import { findViolation } from "../src/core/reply.js";

describe("createContext", () => {
  it("shares one config, clock, log, migrated database and speak across consumers", () => {
    const { ctx, lines, tick } = makeContext();
    assert.strictEqual(ctx.config.dbPath, ":memory:");
    assert.strictEqual(ctx.clock.now(), TEST_START);
    tick(90);
    assert.strictEqual(ctx.clock.now(), TEST_START + 90);
    assert.strictEqual(ctx.db.$client.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get()?.n, 1);
    ctx.log({ event: "ping" });
    assert.match(lines[0] ?? "", /"ts":"2027-01-15T08:01:30.000Z"/);
    const block = ctx.speak({ template: "Okay." }).content[0];
    assert.ok(block?.type === "text" && findViolation(block.text) === undefined);
  });

  it("builds a strict speak in test and a lenient one otherwise", () => {
    assert.throws(() => makeContext().ctx.speak({ template: "You are late." }), /banned-word/);
    const { ctx, lines } = makeContext({ NODE_ENV: "production" });
    assert.deepStrictEqual(ctx.speak({ template: "You are late." }).content, [{ type: "text", text: "Okay. I've got that." }]);
    assert.match(lines[0] ?? "", /reply_violation/);
  });
});
