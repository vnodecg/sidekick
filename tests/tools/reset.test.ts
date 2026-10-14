import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { dopamine, dump, focus, parked, tasks, wins } from "../../src/db/schema.js";
import decisionsModule from "../../src/tools/decisions.js";
import dopamineModule from "../../src/tools/dopamine.js";
import memoryModule from "../../src/tools/memory.js";
import resetModule from "../../src/tools/reset.js";
import tasksModule from "../../src/tools/tasks.js";
import timeModule from "../../src/tools/time.js";
import winsModule from "../../src/tools/wins.js";
import { toolHarness } from "../helpers/harness.js";
import { countRows } from "../helpers/index.js";

const harness = toolHarness([resetModule, tasksModule, timeModule, memoryModule, winsModule, decisionsModule, dopamineModule]);
afterEach(harness.stop);

describe("gentle_reset (TC-047)", () => {
  it("archives tasks, ends focus without a win, clears bookmarks, keeps wins and dump", async () => {
    const { tool, made } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    await tool.call("complete_step");
    await tool.call("start_focus");
    await tool.call("park_my_place", { note: "here" });
    await tool.call("brain_dump", { thought: "keep me" });
    await tool.call("dopamine_menu");
    const winsBefore = countRows(made.ctx.db, wins);
    made.tick(300);

    const { text, meta } = await tool.call("gentle_reset");
    assert.strictEqual(text, "Fresh start. Nothing is held against you. Want to pick one tiny thing?");
    assert.strictEqual(meta?.taskOpen, false);

    const rows = made.ctx.db.select().from(tasks).all();
    assert.ok(rows.every((row) => row.status === "archived" || row.status === "done"));
    assert.ok(rows.some((row) => row.status === "archived"));
    assert.ok(made.ctx.db.select().from(focus).all().every((row) => row.endedAt !== null));
    assert.strictEqual(countRows(made.ctx.db, parked), 0);
    assert.strictEqual(countRows(made.ctx.db, wins), winsBefore);
    assert.strictEqual(countRows(made.ctx.db, dump), 1);
    assert.strictEqual(countRows(made.ctx.db, dopamine), 8);
  });

  it("leaves nothing active and is safe to repeat", async () => {
    const { tool, made } = await harness.start();
    await tool.call("break_down_task", { task: "tidy" });
    await tool.call("gentle_reset");
    await tool.call("gentle_reset");
    assert.strictEqual((await tool.call("next_step")).text, "Nothing is waiting right now. Want to start something?");
    assert.strictEqual((await tool.call("where_was_i")).text, "I don't have a spot saved yet.");
    assert.strictEqual((await tool.call("my_wins")).text, "Nothing logged yet, but we can start with one tiny thing.");
    assert.strictEqual(countRows(made.ctx.db, wins), 0);
  });

  it("does not touch a task started afterwards", async () => {
    const { tool } = await harness.start();
    await tool.call("gentle_reset");
    await tool.call("break_down_task", { task: "tidy" });
    assert.strictEqual((await tool.call("next_step")).text, "Next tiny step: Stand up and walk to the spot.");
  });
});
