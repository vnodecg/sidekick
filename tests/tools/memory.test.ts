import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { CRISIS_TEXT } from "../../src/core/lexicon.js";
import { dump, parked } from "../../src/db/schema.js";
import memoryModule from "../../src/tools/memory.js";
import tasksModule from "../../src/tools/tasks.js";
import { toolHarness } from "../helpers/harness.js";
import { countRows } from "../helpers/index.js";

const harness = toolHarness([memoryModule, tasksModule]);
afterEach(harness.stop);

describe("brain_dump (TC-025)", () => {
  it("saves quietly, never echoes, never asks a question", async () => {
    const { tool, made } = await harness.start();
    const { text } = await tool.call("brain_dump", { thought: "buy oat milk" });
    assert.strictEqual(text, "Got it. It's saved, so you can let it go.");
    assert.ok(!text.includes("?") && !text.includes("milk"));
    assert.strictEqual(countRows(made.ctx.db, dump), 1);
  });

  it("asks for the thought when empty and answers a crisis phrase without storing (TC-064)", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("brain_dump", { thought: "  " })).text, "Go ahead, I'm listening.");
    assert.strictEqual((await tool.call("brain_dump", { thought: "I want to die" })).text, CRISIS_TEXT);
    assert.strictEqual(countRows(made.ctx.db, dump), 0);
  });

  it("rejects text over 280 characters", async () => {
    const { tool } = await harness.start();
    assert.ok((await tool.call("brain_dump", { thought: "x".repeat(281) })).isError);
  });
});

describe("sort_dump (TC-026, TC-029)", () => {
  async function dumpMany(count: number): ReturnType<typeof harness.start> {
    const started = await harness.start();
    for (let i = 1; i <= count; i += 1) {
      await started.tool.call("brain_dump", { thought: `item ${String(i)}` });
      started.made.tick(1);
    }
    return started;
  }

  it("says nothing is saved when empty", async () => {
    const { tool } = await harness.start();
    assert.strictEqual((await tool.call("sort_dump")).text, "Nothing saved yet.");
  });

  it("reads three items newest first", async () => {
    const { tool } = await dumpMany(3);
    assert.strictEqual((await tool.call("sort_dump")).text, "You saved: item 3, item 2 and item 1.");
  });

  it("speaks five of nine and counts the rest", async () => {
    const { tool } = await dumpMany(9);
    assert.strictEqual((await tool.call("sort_dump")).text, "You saved: item 9, item 8, item 7, item 6, item 5 and 4 more.");
  });

  it("keeps hostile saved text to a safe, short sentence", async () => {
    const { tool } = await harness.start();
    await tool.call("brain_dump", { thought: "**call** them. It was late! # really?\nnew line" });
    const { text } = await tool.call("sort_dump");
    assert.strictEqual(text, "You saved: call them, It was late, really, new line.");
  });

  it("does not archive or change anything", async () => {
    const { tool, made } = await dumpMany(2);
    await tool.call("sort_dump");
    await tool.call("sort_dump");
    assert.strictEqual(countRows(made.ctx.db, dump), 2);
    assert.strictEqual((await tool.call("sort_dump")).text, "You saved: item 2 and item 1.");
  });
});

describe("park_my_place and where_was_i (TC-027, TC-028)", () => {
  it("says nothing is saved before anything is parked", async () => {
    const { tool } = await harness.start();
    assert.strictEqual((await tool.call("where_was_i")).text, "I don't have a spot saved yet.");
  });

  it("parks a note and recalls it with a plain time ago", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("park_my_place", { note: "writing the intro" })).text, "Parked. I'll remember where you were.");
    made.tick(7 * 60);
    assert.strictEqual((await tool.call("where_was_i")).text, "7 minutes ago, you were here: writing the intro.");
    made.tick(50 * 60 * 60);
    assert.strictEqual((await tool.call("where_was_i")).text, "About 2 days ago, you were here: writing the intro.");
  });

  it("starts the sentence with a capital for a very recent spot", async () => {
    const { tool } = await harness.start();
    await tool.call("park_my_place", { note: "here" });
    assert.strictEqual((await tool.call("where_was_i")).text, "Less than a minute ago, you were here: here.");
  });

  it("uses the open step as the note when none is given", async () => {
    const { tool } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    await tool.call("park_my_place");
    assert.strictEqual((await tool.call("where_was_i")).text, "Less than a minute ago, you were here: Stand up and walk to the spot.");
  });

  it("asks where they are when there is no note and no step", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("park_my_place")).text, "Where are you right now?");
    assert.strictEqual(countRows(made.ctx.db, parked), 0);
  });

  it("adds the current step when it differs from the note, and recalls the newest spot", async () => {
    const { tool, made } = await harness.start();
    await tool.call("park_my_place", { note: "old spot" });
    made.tick(1);
    await tool.call("park_my_place", { note: "new spot" });
    await tool.call("break_down_task", { task: "tidy" });
    assert.strictEqual(
      (await tool.call("where_was_i")).text,
      "Less than a minute ago, you were here: new spot. Next tiny step: Stand up and walk to the spot.",
    );
  });

  it("answers a crisis phrase without storing", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("park_my_place", { note: "I want to kill myself" })).text, CRISIS_TEXT);
    assert.strictEqual(countRows(made.ctx.db, parked), 0);
  });
});
