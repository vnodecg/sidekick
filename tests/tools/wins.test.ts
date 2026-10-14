import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { CRISIS_TEXT } from "../../src/core/lexicon.js";
import { wins } from "../../src/db/schema.js";
import tasksModule from "../../src/tools/tasks.js";
import winsModule from "../../src/tools/wins.js";
import { toolHarness } from "../helpers/harness.js";
import { countRows } from "../helpers/index.js";

const DAY = 86_400;
const harness = toolHarness([winsModule, tasksModule]);
afterEach(harness.stop);

describe("log_win (TC-031)", () => {
  it("logs a manual win", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("log_win", { text: "emailed the landlord" })).text, "Logged. That counts.");
    const [win] = made.ctx.db.select().from(wins).all();
    assert.deepStrictEqual([win?.kind, win?.text], ["manual", "emailed the landlord"]);
  });

  it("asks when empty and answers a crisis phrase without storing", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("log_win")).text, "What did you do?");
    assert.strictEqual((await tool.call("log_win", { text: "I want to die" })).text, CRISIS_TEXT);
    assert.strictEqual(countRows(made.ctx.db, wins), 0);
  });
});

describe("my_wins (TC-032)", () => {
  it("invites a first win when none exist", async () => {
    const { tool } = await harness.start();
    assert.strictEqual((await tool.call("my_wins")).text, "Nothing logged yet, but we can start with one tiny thing.");
  });

  it("names up to three of today's wins, newest first, and counts the rest", async () => {
    const { tool, made } = await harness.start();
    for (const text of ["a", "b", "c", "d", "e"]) {
      await tool.call("log_win", { text });
      made.tick(1);
    }
    assert.strictEqual((await tool.call("my_wins")).text, "Today you: e, d, c and 2 more.");
  });

  it("names one, two or three without a count", async () => {
    const { tool, made } = await harness.start();
    await tool.call("log_win", { text: "a" });
    assert.strictEqual((await tool.call("my_wins")).text, "Today you: a.");
    made.tick(1);
    await tool.call("log_win", { text: "b" });
    assert.strictEqual((await tool.call("my_wins")).text, "Today you: b and a.");
  });

  it("widens to the last day, then the last week, when today is empty", async () => {
    const { tool, made } = await harness.start({ SIDEKICK_TZ: "UTC" });
    await tool.call("log_win", { text: "old win" });
    made.tick(17 * 60 * 60);
    assert.strictEqual((await tool.call("my_wins")).text, "In the last day you: old win.");
    made.tick(3 * DAY);
    assert.strictEqual((await tool.call("my_wins")).text, "This past week you: old win.");
    made.tick(10 * DAY);
    assert.strictEqual((await tool.call("my_wins")).text, "Nothing logged yet, but we can start with one tiny thing.");
  });

  it("includes wins earned by finishing steps", async () => {
    const { tool } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    await tool.call("complete_step");
    assert.strictEqual((await tool.call("my_wins")).text, "Today you: Stand up and walk to the spot.");
  });

  it("uses the local day, not UTC, for today (TC-039 boundary)", async () => {
    const { tool, made } = await harness.start({ SIDEKICK_TZ: "Pacific/Kiritimati" });
    await tool.call("log_win", { text: "early" });
    made.tick(11 * 60 * 60);
    assert.match((await tool.call("my_wins")).text, /^In the last day you/);
  });
});
