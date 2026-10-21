import assert from "node:assert";
import { before, describe, it } from "node:test";
import { argSets, startAllTools } from "./helpers/all-tools.js";
import { CORE_BANNED_WORDS, EXTENDED_BANNED_WORDS } from "../src/core/lexicon.js";
import type { AllTools, ToolSpec } from "./helpers/all-tools.js";

const MIN_TOOLS = 24;
const NORMAL_WORDS = 25;
const HOSTILE_WORDS = 40;
const BANNED = new RegExp(`\\b(?:${[...CORE_BANNED_WORDS, ...EXTENDED_BANNED_WORDS].join("|")})\\b`, "i");
const MARKUP = /[*#_`>[\]()|]|^\s*(?:-|\d+\.)\s|[\n\r]|https?:\/\/|www\./;
const EMOJI = /\p{Extended_Pictographic}/u;

const NORMAL = "water the plants";
const HOSTILE = [
  "**bold** _it_ `code` [link](http://example.com)",
  "x".repeat(280),
  "line one\nline two\n- item\n1. thing",
  "clean the desk 🧹 then 🎉",
  "I am so late and lazy",
  "!!!",
  "Wait... what?? Really?! Fine. Okay. Sure. Go.",
  "# heading > quote | pipe",
];

type Seed = (tool: AllTools) => Promise<void>;

/*
 * Each state exercises a different branch of the replies: nothing saved,
 * a task plus a running focus session and notes, and a routine that is due.
 */
const STATES: Record<string, Seed> = {
  empty: () => Promise.resolve(),
  busy: async (tool) => {
    await tool.call("break_down_task", { task: "clean the kitchen" });
    await tool.call("start_focus", { label: "the kitchen", minutes: 25 });
    await tool.call("brain_dump", { thought: "email Sam" });
    await tool.call("park_my_place", { note: "wiping the counter" });
    await tool.call("log_win", { text: "made the bed" });
  },
  routine: async (tool) => {
    await tool.call("add_routine", { name: "stretch", time_of_day: "00:00" });
    await tool.call("log_win", { text: "made the bed" });
  },
};

function assertReply(text: string, maxWords: number, context: string): void {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence !== "");
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${context}: ${String(sentences.length)} sentences in "${text}"`);
  assert.ok(!MARKUP.test(text), `${context}: markup in "${text}"`);
  assert.ok(!EMOJI.test(text), `${context}: emoji in "${text}"`);
  assert.ok(text.split("?").length <= 2, `${context}: more than one question in "${text}"`);
  for (const sentence of sentences) {
    assert.ok(sentence.split(/\s+/).length <= maxWords, `${context}: sentence over ${String(maxWords)} words in "${text}"`);
  }
}

/*
 * A fresh server per call keeps tools from changing each other's state.
 * Banned words are checked on the whole reply only for the normal input; for
 * hostile input the user's own words are echoed, so the template-only check in
 * speak() (strict in tests, which would surface here as isError) covers AC2.
 */
async function sweep(specs: Array<ToolSpec>, text: string, rules: { maxWords: number; banned: boolean }): Promise<number> {
  let calls = 0;
  for (const [state, seed] of Object.entries(STATES)) {
    for (const spec of specs) {
      for (const args of argSets(spec, text)) {
        const tool = await startAllTools();
        await seed(tool);
        const reply = await tool.call(spec.name, args);
        const context = `${spec.name} [${state}]`;
        assert.ok(!reply.isError, `${context} errored: ${reply.text}`);
        assertReply(reply.text, rules.maxWords, context);
        if (rules.banned) assert.ok(!BANNED.test(reply.text), `${context}: banned word in "${reply.text}"`);
        await tool.close();
        calls += 1;
      }
    }
  }
  return calls;
}

describe("reply lint over every registered tool", () => {
  let specs: Array<ToolSpec> = [];

  before(async () => {
    const tool = await startAllTools();
    specs = tool.specs;
    await tool.close();
  });

  it("discovers the whole tool surface from tools/list", () => {
    assert.ok(specs.length >= MIN_TOOLS, specs.map((spec) => spec.name).join(", "));
  });

  it("holds the reply rules for realistic input in every state (TC-060)", async () => {
    const calls = await sweep(specs, NORMAL, { maxWords: NORMAL_WORDS, banned: true });
    assert.ok(calls >= MIN_TOOLS * Object.keys(STATES).length);
  });

  it("holds the reply rules for hostile input in every state (TC-061)", async () => {
    for (const hostile of HOSTILE) await sweep(specs, hostile, { maxWords: HOSTILE_WORDS, banned: false });
  });
});
