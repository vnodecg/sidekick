import assert from "node:assert";
import { before, describe, it } from "node:test";
import { argSets, freeTextNames, startAllTools } from "./helpers/all-tools.js";
import { countRows } from "./helpers/index.js";
import { CRISIS_TEXT } from "../src/core/lexicon.js";
import * as schema from "../src/db/schema.js";
import type { ToolSpec } from "./helpers/all-tools.js";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

const TABLES: Array<SQLiteTable> = [schema.tasks, schema.dump, schema.wins, schema.parked, schema.focus, schema.routines, schema.dopamine, schema.aiCalls];

const CRISIS_INPUTS = [
  "I want to kill myself",
  "i DON’T want to be here",
  "Some days I think about suicide.",
  `${"I cleaned the whole flat today and it was fine, ".repeat(3)}but I want to end it all`,
];

let specs: Array<ToolSpec> = [];

before(async () => {
  const tool = await startAllTools();
  specs = tool.specs;
  await tool.close();
});

function withPhrase(property: ToolSpec["properties"][string] | undefined, phrase: string): string | Array<string> {
  const fitted = phrase.slice(-(property?.maxLength ?? property?.items?.maxLength ?? phrase.length));
  return property?.type === "array" ? ["pasta", fitted] : fitted;
}

async function assertCare(spec: ToolSpec, name: string, phrase: string): Promise<void> {
  const tool = await startAllTools();
  const { ctx } = tool.made;
  const modelCalls: Array<string> = [];
  ctx.ai = { kind: "ai", model: "spy", breakDown: (task) => (modelCalls.push(task), Promise.reject(new Error("must not be called"))) };
  await tool.call("add_routine", { name: "stretch", time_of_day: "00:00" });
  await tool.call("break_down_task", { task: "clean the kitchen" });
  const stored = (): Array<number> => TABLES.map((table) => countRows(ctx.db, table));
  const before = stored();
  const callsBefore = modelCalls.length;

  const value = withPhrase(spec.properties[name], phrase);
  for (const args of argSets(spec, "water the plants", { [name]: value })) {
    const reply = await tool.call(spec.name, args);
    assert.strictEqual(reply.text, CRISIS_TEXT, `${spec.name}.${name}: ${phrase}`);
    assert.ok(!reply.isError, `${spec.name}.${name} returned an error`);
  }
  assert.deepStrictEqual(stored(), before, `${spec.name}.${name} stored something`);
  assert.strictEqual(modelCalls.length, callsBefore, `${spec.name}.${name} called the model`);
  await tool.close();
}

/*
 * Tools are found from their schemas (any string or string-array input that is
 * not an enum or pattern), so a new free-text tool is covered without an edit.
 * Long phrases are cut from the front to fit a field's limit. For an array
 * input only the second item carries the phrase.
 */
describe("crisis phrases on every free-text input (TC-064)", () => {
  it("finds the free-text tools", () => {
    const names = specs.filter((spec) => freeTextNames(spec).length > 0).map((spec) => spec.name);
    for (const expected of ["break_down_task", "brain_dump", "park_my_place", "log_win", "add_routine", "add_dopamine_idea", "start_focus", "pick_for_me"]) {
      assert.ok(names.includes(expected), `${expected} not discovered as free text: ${names.join(", ")}`);
    }
  });

  it("answers with care, stores nothing and never calls the model", async () => {
    for (const spec of specs) {
      for (const name of freeTextNames(spec)) {
        for (const phrase of CRISIS_INPUTS) await assertCare(spec, name, phrase);
      }
    }
  });
});
