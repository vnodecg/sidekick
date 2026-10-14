import assert from "node:assert";
import { describe, it } from "node:test";
import { route } from "../../src/web/public/router.js";

const IDLE = { hasActiveTask: false, pendingDelete: false };
const ACTIVE = { hasActiveTask: true, pendingDelete: false };

type Row = [utterance: string, tool: string, args: Record<string, unknown>];

function check(rows: Array<Row>, state = IDLE): void {
  for (const [utterance, tool, args] of rows) {
    const routed = route(utterance, state);
    assert.strictEqual(routed.tool, tool, `${utterance} -> ${routed.tool} (${routed.pattern})`);
    assert.deepStrictEqual(routed.args, args, utterance);
  }
}

describe("router grammar (TC-090)", () => {
  it("routes task openers to break_down_task with the remainder as the task", () => {
    check([
      ["I need to clean the kitchen.", "break_down_task", { task: "clean the kitchen" }],
      ["I have to file my taxes", "break_down_task", { task: "file my taxes" }],
      ["Help me with my taxes", "break_down_task", { task: "my taxes" }],
      ["I can't start on the report", "break_down_task", { task: "the report" }],
      ["I can’t start", "break_down_task", {}],
    ]);
  });

  it("routes progress phrases only while a task is open", () => {
    check([["done", "complete_step", {}], ["I did it!", "complete_step", {}], ["Finished.", "complete_step", {}], ["next", "complete_step", {}]], ACTIVE);
    check([["what's next", "next_step", {}], ["next step please", "next_step", {}]]);
  });

  it("routes stuck and reset phrases", () => {
    check([
      ["I'm stuck", "im_stuck", {}],
      ["I'm frozen", "im_stuck", {}],
      ["I can't move", "im_stuck", {}],
      ["fresh start", "gentle_reset", {}],
      ["I had a bad day", "gentle_reset", {}],
    ]);
  });

  it("routes the time tools, pulling out a label and minutes", () => {
    check([
      ["start focus", "start_focus", {}],
      ["starting work on the report", "start_focus", { label: "the report" }],
      ["start a timer for 25 minutes", "start_focus", { minutes: 25 }],
      ["start focus on emails for 30 min", "start_focus", { label: "emails", minutes: 30 }],
      ["how long have I been at this", "time_check", {}],
      ["time check", "time_check", {}],
      ["I'm done working", "end_focus", {}],
      ["stop the timer", "end_focus", {}],
    ]);
  });

  it("routes memory tools and keeps the user's own casing", () => {
    check([
      ["Remember to email Sam about the invoice.", "brain_dump", { thought: "email Sam about the invoice" }],
      ["brain dump: Buy oat milk", "brain_dump", { thought: "Buy oat milk" }],
      ["what did I save", "sort_dump", {}],
      ["read my dump", "sort_dump", {}],
      ["park my place", "park_my_place", {}],
      ["Park, writing the intro", "park_my_place", { note: "writing the intro" }],
      ["I'll be right back", "park_my_place", {}],
      ["where was I", "where_was_i", {}],
    ]);
  });

  it("routes decisions, energy, wins and breaks", () => {
    check([
      ["pick for me, pasta or rice", "pick_for_me", { options: ["pasta", "rice"] }],
      ["you choose", "pick_for_me", {}],
      ["you decide between tea, coffee or water", "pick_for_me", { options: ["tea", "coffee", "water"] }],
      ["pasta or rice", "pick_for_me", { options: ["pasta", "rice"] }],
      ["I have low energy", "match_energy", { energy: "low" }],
      ["I'm tired", "match_energy", { energy: "low" }],
      ["high energy today", "match_energy", { energy: "high" }],
      ["I'm wired", "match_energy", { energy: "high" }],
      ["what now", "what_now", {}],
      ["what should I do", "what_now", {}],
      ["I did the dishes", "log_win", { text: "the dishes" }],
      ["log a win: called the bank", "log_win", { text: "called the bank" }],
      ["my wins", "my_wins", {}],
      ["what have I done today", "my_wins", {}],
      ["I need a break", "dopamine_menu", {}],
      ["dopamine", "dopamine_menu", {}],
    ]);
  });
});

describe("router edge cases (TC-091..093)", () => {
  it("prefers the narrow phrase over the broad one", () => {
    check([["I'm done working", "end_focus", {}]], ACTIVE);
    check([["what did I save", "sort_dump", {}], ["what did I do", "my_wins", {}]], ACTIVE);
    assert.strictEqual(route("I need to break this down", IDLE).tool, "break_down_task");
  });

  it("treats a bare done or next as a plain question when no task is open (TC-093)", () => {
    check([["done", "what_now", {}], ["next", "what_now", {}]]);
  });

  it("sends a long sentence to break_down_task only when no task is open (TC-092)", () => {
    check([["the garage is a total mess again", "break_down_task", { task: "the garage is a total mess again" }]]);
    check([["the garage is a total mess again", "what_now", {}]], ACTIVE);
  });

  it("falls back to what_now, never an error, for anything else (TC-091)", () => {
    check([["", "what_now", {}], ["hmm", "what_now", {}], ["???", "what_now", {}], ["banana", "what_now", {}]]);
  });

  it("only treats yes as a delete confirmation straight after the delete question", () => {
    check([["erase everything", "delete_my_data", {}], ["please delete my data", "delete_my_data", {}]]);
    check([["yes", "delete_my_data", { confirm: true }]], { hasActiveTask: false, pendingDelete: true });
    check([["yes", "what_now", {}]]);
  });

  it("limits a pick to ten options and names the matching pattern", () => {
    const many = Array.from({ length: 14 }, (_, index) => `item${String(index)}`).join(", ");
    const routed = route(`pick for me ${many}`, IDLE);
    assert.strictEqual((routed.args.options as Array<string>).length, 10);
    assert.strictEqual(routed.pattern, "pick");
  });

  it("is a pure function of its inputs", () => {
    const state = { hasActiveTask: true, pendingDelete: false };
    assert.deepStrictEqual(route("done", state), route("done", state));
    assert.deepStrictEqual(state, { hasActiveTask: true, pendingDelete: false });
  });
});
