import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { CRISIS_TEXT } from "../../src/core/lexicon.js";
import { aiCalls, tasks, wins } from "../../src/db/schema.js";
import tasksModule from "../../src/tools/tasks.js";
import { GOOD_STEPS, fakeClient, namedError } from "../helpers/ai.js";
import { countRows, makeContext } from "../helpers/index.js";
import { connectModule } from "../helpers/tool-client.js";
import type { AiClient } from "../../src/ai/types.js";
import type { ToolClient } from "../helpers/tool-client.js";

const NOTHING = "Nothing is waiting right now. Want to start something?";
let open: ToolClient | undefined;

async function setup(client?: AiClient): Promise<{ tool: ToolClient; made: ReturnType<typeof makeContext> }> {
  const made = makeContext();
  if (client !== undefined) made.ctx.ai = client;
  open = await connectModule(tasksModule, made.ctx);
  return { tool: open, made };
}

afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("break_down_task", () => {
  it("speaks only the first step and saves parent plus steps (TC-001, TC-070)", async () => {
    const { tool, made } = await setup();
    const { text, meta } = await tool.call("break_down_task", { task: "clean the kitchen" });
    assert.strictEqual(text, "Okay. First tiny step: Stand up and walk to the spot.");
    assert.ok(!text.includes("Pick up one thing"));
    assert.strictEqual(meta?.source, "mock");
    assert.strictEqual(meta.stepCount, 5);
    assert.strictEqual(countRows(made.ctx.db, tasks), 6);
  });

  it("uses fallback steps when the model keeps failing, with the same reply shape (TC-002)", async () => {
    const failing = namedError("ThrottlingException");
    const { tool, made } = await setup(fakeClient([failing, failing]));
    const { text, meta } = await tool.call("break_down_task", { task: "file taxes" });
    assert.strictEqual(text, "Okay. First tiny step: Open what you need for this.");
    assert.strictEqual(meta?.source, "fallback");
    assert.strictEqual(countRows(made.ctx.db, aiCalls), 2);
  });

  it("asks one question for empty input without writing", async () => {
    const { tool, made } = await setup();
    assert.strictEqual((await tool.call("break_down_task", { task: "   " })).text, "What do you need to get started on?");
    assert.strictEqual((await tool.call("break_down_task")).text, "What do you need to get started on?");
    assert.strictEqual(countRows(made.ctx.db, tasks), 0);
  });

  it("answers a crisis phrase with support and never calls the model", async () => {
    const client = fakeClient([GOOD_STEPS]);
    const { tool, made } = await setup(client);
    const { text } = await tool.call("break_down_task", { task: "I want to die" });
    assert.strictEqual(text, CRISIS_TEXT);
    assert.strictEqual(client.calls.length, 0);
    assert.strictEqual(countRows(made.ctx.db, tasks), 0);
  });

  it("makes the newest task active and leaves the other open (TC-014)", async () => {
    const { tool, made } = await setup();
    await tool.call("break_down_task", { task: "first" });
    made.tick(5);
    await tool.call("break_down_task", { task: "second" });
    await tool.call("complete_step");
    const open = made.ctx.db.select().from(tasks).all().filter((row) => row.parentId === null);
    assert.deepStrictEqual(open.map((row) => [row.title, row.status]), [["first", "open"], ["second", "open"]]);
  });
});

describe("next_step", () => {
  it("is calm and read-only with no task (TC-013)", async () => {
    const { tool, made } = await setup();
    assert.strictEqual((await tool.call("next_step")).text, NOTHING);
    assert.strictEqual(countRows(made.ctx.db, tasks), 0);
  });

  it("repeats the current step without advancing", async () => {
    const { tool } = await setup();
    await tool.call("break_down_task", { task: "tidy" });
    const first = (await tool.call("next_step")).text;
    assert.strictEqual(first, "Next tiny step: Stand up and walk to the spot.");
    assert.strictEqual((await tool.call("next_step")).text, first);
  });
});

describe("complete_step", () => {
  it("logs a win and speaks the next step (TC-010)", async () => {
    const { tool, made } = await setup();
    await tool.call("break_down_task", { task: "tidy" });
    assert.strictEqual((await tool.call("complete_step")).text, "Nice. Next tiny step: Pick up one thing.");
    assert.strictEqual(countRows(made.ctx.db, wins), 1);
  });

  it("finishes the parent on the last step (TC-011)", async () => {
    const { tool, made } = await setup();
    await tool.call("break_down_task", { task: "tidy" });
    for (let i = 0; i < 4; i += 1) await tool.call("complete_step");
    assert.strictEqual((await tool.call("complete_step")).text, "Nice. That was the last step, so the whole thing is done.");
    const kinds = made.ctx.db.select().from(wins).all().map((row) => row.kind);
    assert.deepStrictEqual(kinds, ["step", "step", "step", "step", "step", "task"]);
    const parent = made.ctx.db.select().from(tasks).all().find((row) => row.parentId === null);
    assert.strictEqual(parent?.status, "done");
    assert.notStrictEqual(parent.completedAt, null);
  });

  it("is a no-op once everything is done or nothing exists (TC-012, TC-013)", async () => {
    const { tool, made } = await setup();
    assert.strictEqual((await tool.call("complete_step")).text, NOTHING);
    await tool.call("break_down_task", { task: "tidy" });
    for (let i = 0; i < 5; i += 1) await tool.call("complete_step");
    const winCount = countRows(made.ctx.db, wins);
    assert.strictEqual((await tool.call("complete_step")).text, NOTHING);
    assert.strictEqual(countRows(made.ctx.db, wins), winCount);
  });
});

describe("im_stuck", () => {
  it("returns one pool sentence alone when no step is open (TC-015)", async () => {
    const { tool } = await setup();
    const { text } = await tool.call("im_stuck");
    assert.ok(!text.includes("Then:"));
  });

  it("restates the current step and rotates the pool", async () => {
    const { tool } = await setup();
    await tool.call("break_down_task", { task: "tidy" });
    const first = (await tool.call("im_stuck")).text;
    const second = (await tool.call("im_stuck")).text;
    assert.ok(first.endsWith("Then: Stand up and walk to the spot."));
    assert.notStrictEqual(first, second);
  });
});
