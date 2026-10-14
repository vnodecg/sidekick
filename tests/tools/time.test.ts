import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { CRISIS_TEXT } from "../../src/core/lexicon.js";
import { focus, wins } from "../../src/db/schema.js";
import tasksModule from "../../src/tools/tasks.js";
import timeModule from "../../src/tools/time.js";
import { toolHarness } from "../helpers/harness.js";
import { countRows } from "../helpers/index.js";

const harness = toolHarness([timeModule, tasksModule]);
afterEach(harness.stop);

describe("focus tools (TC-020..023)", () => {
  it("starts, checks and ends a session with plain phrases and a win", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("start_focus", { label: "taxes" })).text, "Okay, focus time started.");
    made.tick(25 * 60 + 10);
    assert.strictEqual((await tool.call("time_check")).text, "You've been at it for 25 minutes.");
    assert.strictEqual((await tool.call("end_focus")).text, "Good work. You focused for 25 minutes.");
    const [win] = made.ctx.db.select().from(wins).all();
    assert.deepStrictEqual([win?.kind, win?.text], ["focus", "taxes"]);
  });

  it("keeps one open session and says so on a second start (TC-021)", async () => {
    const { tool, made } = await harness.start();
    await tool.call("start_focus");
    made.tick(130);
    assert.strictEqual((await tool.call("start_focus", { label: "other" })).text, "You're already going, 2 minutes in.");
    assert.strictEqual(countRows(made.ctx.db, focus), 1);
  });

  it("labels the session with the active task when no label is given", async () => {
    const { tool, made } = await harness.start();
    await tool.call("break_down_task", { task: "clean the kitchen" });
    await tool.call("start_focus");
    assert.strictEqual(made.ctx.db.select().from(focus).get()?.label, "clean the kitchen");
  });

  it("notes the planned minutes and speaks stage phrases, never overdue (TC-022)", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("start_focus", { minutes: 20 })).text, "Okay, focus time started. I'll note 20 minutes.");
    made.tick(5 * 60);
    assert.strictEqual((await tool.call("time_check")).text, "You've been at it for 5 minutes.");
    made.tick(5 * 60);
    assert.strictEqual((await tool.call("time_check")).text, "You've been at it for 10 minutes. That's about halfway.");
    made.tick(6 * 60);
    assert.strictEqual((await tool.call("time_check")).text, "You've been at it for 16 minutes. About five minutes left.");
    made.tick(10 * 60);
    assert.strictEqual(
      (await tool.call("time_check")).text,
      "You've been at it for 26 minutes. You've passed your 20 minutes, no rush.",
    );
  });

  it("is calm and writes nothing when no session is running (TC-023)", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("time_check")).text, "No focus session is running. Want to start one?");
    assert.strictEqual((await tool.call("end_focus")).text, "No focus session is running.");
    assert.strictEqual(countRows(made.ctx.db, wins), 0);
  });

  it("rejects a planned length outside 1 to 240", async () => {
    const { tool } = await harness.start();
    assert.ok((await tool.call("start_focus", { minutes: 0 })).isError);
    assert.ok((await tool.call("start_focus", { minutes: 241 })).isError);
  });

  it("answers a crisis phrase in the label with support and stores nothing", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("start_focus", { label: "I want to die" })).text, CRISIS_TEXT);
    assert.strictEqual(countRows(made.ctx.db, focus), 0);
  });

  it("allows a new session after ending one", async () => {
    const { tool, made } = await harness.start();
    await tool.call("start_focus");
    await tool.call("end_focus");
    await tool.call("start_focus");
    assert.strictEqual(countRows(made.ctx.db, focus), 2);
  });
});

describe("transition_warning (TC-048)", () => {
  it("speaks the plan and returns a schedule without writing", async () => {
    const { tool, made } = await harness.start();
    const { text, meta } = await tool.call("transition_warning", { minutes: 60, label: "the meeting" });
    assert.strictEqual(text, "Okay. I'll count down to the meeting in 60 minutes: heads-up at 30, 10 and 5 minutes left, and wrap up at 2.");
    assert.deepStrictEqual(meta?.schedule, [30, 10, 5, 2].map((atMinutes) => ({ atMinutes })));
    assert.strictEqual(countRows(made.ctx.db, focus), 0);
  });

  it("only uses points that fit inside the time given", async () => {
    const { tool } = await harness.start();
    const short = await tool.call("transition_warning", { minutes: 5 });
    assert.strictEqual(short.text, "Okay. I'll count down to the switch in 5 minutes, and wrap up at 2.");
    assert.deepStrictEqual(short.meta?.schedule, [{ atMinutes: 2 }]);
    const mid = await tool.call("transition_warning", { minutes: 12 });
    assert.deepStrictEqual(mid.meta?.schedule, [10, 6, 5, 2].map((atMinutes) => ({ atMinutes })));
  });

  it("asks once when minutes is missing and rejects out-of-range values", async () => {
    const { tool } = await harness.start();
    assert.strictEqual((await tool.call("transition_warning")).text, "How many minutes until the switch?");
    assert.ok((await tool.call("transition_warning", { minutes: 4 })).isError);
    assert.ok((await tool.call("transition_warning", { minutes: 181 })).isError);
  });
});
