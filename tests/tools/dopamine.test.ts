import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { CRISIS_TEXT } from "../../src/core/lexicon.js";
import { dopamine } from "../../src/db/schema.js";
import dopamineModule from "../../src/tools/dopamine.js";
import { toolHarness } from "../helpers/harness.js";
import { countRows } from "../helpers/index.js";

const harness = toolHarness([dopamineModule]);
afterEach(harness.stop);

const ideaOf = (text: string): string => text.replace(/^Try this for five minutes: /, "").replace(/\.$/, "");

describe("dopamine_menu (TC-035)", () => {
  it("seeds on first use and rotates without repeats until all are used, even within one second", async () => {
    const { tool, made } = await harness.start();
    const first = ideaOf((await tool.call("dopamine_menu")).text);
    assert.strictEqual(first, "stretch for one minute");
    assert.strictEqual(countRows(made.ctx.db, dopamine), 8);
    const seen = new Set([first]);
    for (let i = 0; i < 7; i += 1) seen.add(ideaOf((await tool.call("dopamine_menu")).text));
    assert.strictEqual(seen.size, 8);
    assert.strictEqual(ideaOf((await tool.call("dopamine_menu")).text), first);
  });

  it("serves a new idea next, before any already-used one", async () => {
    const { tool } = await harness.start();
    for (let i = 0; i < 8; i += 1) await tool.call("dopamine_menu");
    assert.strictEqual((await tool.call("add_dopamine_idea", { idea: "pet the dog" })).text, "Added to your break ideas.");
    assert.strictEqual((await tool.call("dopamine_menu")).text, "Try this for five minutes: pet the dog.");
  });

  it("keeps the defaults when an idea is added before the first menu", async () => {
    const { tool, made } = await harness.start();
    await tool.call("add_dopamine_idea", { idea: "pet the dog" });
    assert.strictEqual(countRows(made.ctx.db, dopamine), 9);
  });
});

describe("add_dopamine_idea", () => {
  it("asks when empty, caps at 60 characters and screens for crisis", async () => {
    const { tool, made } = await harness.start();
    assert.strictEqual((await tool.call("add_dopamine_idea")).text, "What would you like to add?");
    assert.ok((await tool.call("add_dopamine_idea", { idea: "x".repeat(61) })).isError);
    assert.strictEqual((await tool.call("add_dopamine_idea", { idea: "I want to die" })).text, CRISIS_TEXT);
    assert.strictEqual(countRows(made.ctx.db, dopamine), 0);
  });
});
