import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { aiCalls, dopamine, dump, focus, parked, routines, tasks, wins } from "../../src/db/schema.js";
import dataModule from "../../src/tools/data.js";
import decisionsModule from "../../src/tools/decisions.js";
import memoryModule from "../../src/tools/memory.js";
import routinesModule from "../../src/tools/routines.js";
import tasksModule from "../../src/tools/tasks.js";
import timeModule from "../../src/tools/time.js";
import winsModule from "../../src/tools/wins.js";
import { toolHarness } from "../helpers/harness.js";
import { countRows } from "../helpers/index.js";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

const harness = toolHarness([dataModule, tasksModule, timeModule, memoryModule, winsModule, decisionsModule, routinesModule]);
afterEach(harness.stop);

const TABLES: Array<[string, SQLiteTable]> = [
  ["tasks", tasks],
  ["dump", dump],
  ["wins", wins],
  ["parked", parked],
  ["focus", focus],
  ["routines", routines],
  ["dopamine", dopamine],
  ["ai_calls", aiCalls],
];

async function populate(tool: Awaited<ReturnType<typeof harness.start>>["tool"]): Promise<void> {
  await tool.call("break_down_task", { task: "tidy" });
  await tool.call("complete_step");
  await tool.call("brain_dump", { thought: "a thought" });
  await tool.call("park_my_place", { note: "here" });
  await tool.call("start_focus");
  await tool.call("add_routine", { name: "stretch" });
  await tool.call("match_energy", { energy: "low" });
  await tool.call("log_win", { text: "something" });
}

describe("delete_my_data", () => {
  it("asks first and deletes nothing without confirm (TC-050)", async () => {
    const { tool, made } = await harness.start();
    await populate(tool);
    const before = TABLES.map(([, table]) => countRows(made.ctx.db, table));
    const message = "This erases everything I saved for you. Say yes to confirm.";
    assert.strictEqual((await tool.call("delete_my_data")).text, message);
    assert.strictEqual((await tool.call("delete_my_data", { confirm: false })).text, message);
    assert.deepStrictEqual(TABLES.map(([, table]) => countRows(made.ctx.db, table)), before);
  });

  it("empties all eight tables for the user when confirmed (TC-051)", async () => {
    const { tool, made } = await harness.start();
    await populate(tool);
    for (const [name, table] of TABLES.slice(0, 7)) assert.ok(countRows(made.ctx.db, table) > 0, name);
    made.ctx.db.insert(aiCalls).values({ userId: "default", model: "m", attempt: 1, success: true, latencyMs: 5, createdAt: 1 }).run();
    const { text, meta } = await tool.call("delete_my_data", { confirm: true });
    assert.strictEqual(text, "Done. Everything is erased.");
    assert.strictEqual(meta?.taskOpen, false);
    for (const [name, table] of TABLES) assert.strictEqual(countRows(made.ctx.db, table), 0, name);
  });

  it("keeps other users' rows and is idempotent (TC-052)", async () => {
    const { tool, made } = await harness.start();
    const { db } = made.ctx;
    await populate(tool);
    db.insert(wins).values({ userId: "someone-else", kind: "manual", text: "theirs", createdAt: 1 }).run();
    db.insert(dump).values({ userId: "someone-else", text: "theirs", createdAt: 1 }).run();
    db.insert(tasks).values({ userId: "someone-else", title: "theirs", createdAt: 1, updatedAt: 1 }).run();
    await tool.call("delete_my_data", { confirm: true });
    assert.strictEqual((await tool.call("delete_my_data", { confirm: true })).text, "Done. Everything is erased.");
    for (const table of [wins, dump, tasks]) assert.strictEqual(countRows(db, table), 1);
  });

  it("re-seeds break ideas on next use", async () => {
    const { tool, made } = await harness.start();
    await tool.call("what_now");
    await tool.call("delete_my_data", { confirm: true });
    assert.strictEqual(countRows(made.ctx.db, dopamine), 0);
    await tool.call("what_now");
    assert.strictEqual(countRows(made.ctx.db, dopamine), 8);
  });
});
