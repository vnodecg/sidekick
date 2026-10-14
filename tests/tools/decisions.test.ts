import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { CRISIS_TEXT } from "../../src/core/lexicon.js";
import decisionsModule from "../../src/tools/decisions.js";
import dopamineModule from "../../src/tools/dopamine.js";
import routinesModule from "../../src/tools/routines.js";
import tasksModule from "../../src/tools/tasks.js";
import timeModule from "../../src/tools/time.js";
import { toolHarness } from "../helpers/harness.js";

const harness = toolHarness([decisionsModule, tasksModule, timeModule, routinesModule, dopamineModule]);
afterEach(harness.stop);

const BREAK = /^Take a short break: .+\.$/;

describe("what_now (TC-030)", () => {
  it("falls back to a short break when nothing else applies", async () => {
    const { tool } = await harness.start();
    assert.strictEqual((await tool.call("what_now")).text, "Take a short break: stretch for one minute.");
  });

  it("prefers the next tiny step over a break", async () => {
    const { tool } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    assert.strictEqual((await tool.call("what_now")).text, "Next tiny step: Stand up and walk to the spot.");
  });

  it("prefers a due routine over the step", async () => {
    const { tool } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    await tool.call("add_routine", { name: "stretch" });
    assert.strictEqual((await tool.call("what_now")).text, "It's time for stretch.");
  });

  it("prefers a running focus session over everything", async () => {
    const { tool, made } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    await tool.call("add_routine", { name: "stretch" });
    await tool.call("start_focus", { label: "the report" });
    made.tick(600);
    assert.strictEqual((await tool.call("what_now")).text, "Keep going, you're 10 minutes into the report.");
  });

  it("handles an unlabelled focus session", async () => {
    const { tool, made } = await harness.start();
    await tool.call("start_focus");
    made.tick(90);
    assert.strictEqual((await tool.call("what_now")).text, "Keep going, you're 1 minute in.");
  });

  it("returns to the lower branches once the higher one is done", async () => {
    const { tool } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    await tool.call("add_routine", { name: "stretch" });
    await tool.call("routine_done");
    assert.strictEqual((await tool.call("what_now")).text, "Next tiny step: Stand up and walk to the spot.");
    await tool.call("start_focus");
    await tool.call("end_focus");
    assert.strictEqual((await tool.call("what_now")).text, "Next tiny step: Stand up and walk to the spot.");
  });

  it("is always exactly one sentence", async () => {
    const { tool } = await harness.start();
    for (const reply of [await tool.call("what_now"), await tool.call("what_now")]) {
      assert.strictEqual(reply.text.split(/(?<=[.!?])\s+/).length, 1);
    }
  });
});

describe("pick_for_me (TC-033)", () => {
  it("picks one of the options with the injected random source", async () => {
    const { tool, made } = await harness.start();
    made.ctx.random = () => 0;
    assert.strictEqual((await tool.call("pick_for_me", { options: ["tea", "coffee", "water"] })).text, "Go with tea.");
    made.ctx.random = () => 0.99;
    assert.strictEqual((await tool.call("pick_for_me", { options: ["tea", "coffee", "water"] })).text, "Go with water.");
    made.ctx.random = () => 0.5;
    assert.strictEqual((await tool.call("pick_for_me", { options: ["tea", "coffee", "water"] })).text, "Go with coffee.");
  });

  it("uses the what_now choice without options", async () => {
    const { tool } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    assert.strictEqual((await tool.call("pick_for_me")).text, "Next tiny step: Stand up and walk to the spot.");
  });

  it("rejects fewer than two or more than ten options", async () => {
    const { tool } = await harness.start();
    assert.ok((await tool.call("pick_for_me", { options: ["only"] })).isError);
    assert.ok((await tool.call("pick_for_me", { options: Array.from({ length: 11 }, (_v, i) => String(i)) })).isError);
  });

  it("keeps hostile options to one short sentence and screens for crisis", async () => {
    const { tool, made } = await harness.start();
    made.ctx.random = () => 0;
    const hostile = await tool.call("pick_for_me", { options: ["# do **this**. Now! why? ".repeat(10), "b"] });
    assert.ok(hostile.text.startsWith("Go with "));
    assert.ok(!/[#*\n]/.test(hostile.text));
    assert.strictEqual((await tool.call("pick_for_me", { options: ["nap", "I want to die"] })).text, CRISIS_TEXT);
  });
});

describe("match_energy (TC-034)", () => {
  it("gives a rest idea for low energy", async () => {
    const { tool } = await harness.start();
    assert.strictEqual((await tool.call("match_energy", { energy: "low" })).text, "With low energy, try this: stretch for one minute.");
  });

  it("gives the next step for medium and high energy", async () => {
    const { tool } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    assert.strictEqual((await tool.call("match_energy", { energy: "medium" })).text, "With medium energy, try this: Stand up and walk to the spot.");
    assert.strictEqual((await tool.call("match_energy", { energy: "high" })).text, "With high energy, try this: Stand up and walk to the spot.");
  });

  it("points high energy at starting something, and medium at the general suggestion, with no task", async () => {
    const { tool } = await harness.start();
    assert.strictEqual(
      (await tool.call("match_energy", { energy: "high" })).text,
      "With high energy, pick something that's been waiting and tell me what it is.",
    );
    assert.match((await tool.call("match_energy", { energy: "medium" })).text, BREAK);
  });

  it("rejects an unknown energy level", async () => {
    const { tool } = await harness.start();
    assert.ok((await tool.call("match_energy", { energy: "ecstatic" })).isError);
  });
});
