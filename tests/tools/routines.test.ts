import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { CRISIS_TEXT } from "../../src/core/lexicon.js";
import { routines, wins } from "../../src/db/schema.js";
import routinesModule from "../../src/tools/routines.js";
import { toolHarness } from "../helpers/harness.js";
import { countRows } from "../helpers/index.js";

const HOUR = 3600;
const harness = toolHarness([routinesModule]);
afterEach(harness.stop);

const NOTHING = "Nothing is waiting right now.";

describe("add_routine and routine_check (TC-036, TC-038)", () => {
  it("confirms and treats an untimed routine as due", async () => {
    const { tool } = await harness.start({ SIDEKICK_TZ: "UTC" });
    assert.strictEqual((await tool.call("routine_check")).text, NOTHING);
    assert.strictEqual((await tool.call("add_routine", { name: "take out the bins" })).text, "Okay, take out the bins is on your daily list.");
    assert.strictEqual((await tool.call("routine_check")).text, "It's time for take out the bins.");
  });

  it("is due only from its time of day, in the local zone", async () => {
    const { tool, made } = await harness.start({ SIDEKICK_TZ: "UTC" });
    await tool.call("add_routine", { name: "stretch", time_of_day: "09:30" });
    assert.strictEqual((await tool.call("routine_check")).text, NOTHING);
    made.tick(HOUR + 29 * 60);
    assert.strictEqual((await tool.call("routine_check")).text, NOTHING);
    made.tick(60);
    assert.strictEqual((await tool.call("routine_check")).text, "It's time for stretch.");
  });

  it("applies SIDEKICK_TZ when deciding what time it is", async () => {
    const { tool } = await harness.start({ SIDEKICK_TZ: "Asia/Kolkata" });
    await tool.call("add_routine", { name: "lunch", time_of_day: "13:00" });
    assert.strictEqual((await tool.call("routine_check")).text, "It's time for lunch.");
  });

  it("speaks the earliest due routine first and never uses blaming words", async () => {
    const { tool, made } = await harness.start({ SIDEKICK_TZ: "UTC" });
    made.tick(10 * HOUR);
    await tool.call("add_routine", { name: "evening walk", time_of_day: "17:00" });
    await tool.call("add_routine", { name: "stretch", time_of_day: "08:30" });
    await tool.call("add_routine", { name: "bins" });
    const text = (await tool.call("routine_check")).text;
    assert.strictEqual(text, "It's time for stretch.");
    assert.ok(!/overdue|late|missed/i.test(text));
  });

  it("rejects a malformed time of day and a crisis phrase, storing nothing", async () => {
    const { tool, made } = await harness.start();
    for (const bad of ["9:30", "24:00", "09:60", "morning"]) {
      assert.ok((await tool.call("add_routine", { name: "x", time_of_day: bad })).isError, bad);
    }
    assert.strictEqual((await tool.call("add_routine", { name: "I want to die" })).text, CRISIS_TEXT);
    assert.strictEqual((await tool.call("add_routine")).text, "What should be on your daily list?");
    assert.strictEqual(countRows(made.ctx.db, routines), 0);
  });

  it("stores and echoes a medication-like name verbatim without advice (TC-063)", async () => {
    const { tool } = await harness.start();
    assert.strictEqual((await tool.call("add_routine", { name: "take vitamin D" })).text, "Okay, take vitamin D is on your daily list.");
    assert.strictEqual((await tool.call("routine_check")).text, "It's time for take vitamin D.");
  });
});

describe("routine_done (TC-037, TC-039)", () => {
  it("checks off the due routine, logs a routine win, and is not due again today", async () => {
    const { tool, made } = await harness.start({ SIDEKICK_TZ: "UTC" });
    await tool.call("add_routine", { name: "stretch" });
    assert.strictEqual((await tool.call("routine_done")).text, "Done. stretch is checked off for today.");
    assert.strictEqual((await tool.call("routine_check")).text, NOTHING);
    assert.strictEqual((await tool.call("routine_done")).text, NOTHING);
    const [win] = made.ctx.db.select().from(wins).all();
    assert.deepStrictEqual([win?.kind, win?.text, countRows(made.ctx.db, wins)], ["routine", "stretch", 1]);
  });

  it("is due again on the next local day", async () => {
    const { tool, made } = await harness.start({ SIDEKICK_TZ: "UTC" });
    await tool.call("add_routine", { name: "stretch" });
    await tool.call("routine_done");
    made.tick(15 * HOUR + 59 * 60);
    assert.strictEqual((await tool.call("routine_check")).text, NOTHING);
    made.tick(60);
    assert.strictEqual((await tool.call("routine_check")).text, "It's time for stretch.");
  });

  it("changes day at local midnight, not UTC midnight", async () => {
    const { tool, made } = await harness.start({ SIDEKICK_TZ: "Asia/Kolkata" });
    await tool.call("add_routine", { name: "stretch" });
    await tool.call("routine_done");
    made.tick(10 * HOUR + 29 * 60);
    assert.strictEqual((await tool.call("routine_check")).text, NOTHING);
    made.tick(60);
    assert.strictEqual((await tool.call("routine_check")).text, "It's time for stretch.");
  });

  it("matches a name case-insensitively and by partial phrase", async () => {
    const { tool } = await harness.start();
    await tool.call("add_routine", { name: "Take out the bins" });
    await tool.call("add_routine", { name: "stretch" });
    assert.strictEqual((await tool.call("routine_done", { name: "BINS" })).text, "Done. Take out the bins is checked off for today.");
    assert.strictEqual((await tool.call("routine_done", { name: "did my stretch" })).text, "Done. stretch is checked off for today.");
  });

  it("says so, writing nothing, for an unknown routine", async () => {
    const { tool, made } = await harness.start();
    await tool.call("add_routine", { name: "stretch" });
    assert.strictEqual((await tool.call("routine_done", { name: "juggling" })).text, "I don't have a routine called that.");
    assert.strictEqual(countRows(made.ctx.db, wins), 0);
  });
});
