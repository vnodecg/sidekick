import assert from "node:assert";
import { describe, it } from "node:test";
import { normaliseStep, validate } from "../../src/ai/validate.js";

const steps = (...items: Array<string>): { steps: Array<string> } => ({ steps: items });
const THREE = ["Stand up.", "Pick up one cup.", "Carry it to the sink."];

function failureOf(raw: unknown): string | undefined {
  const result = validate(raw);
  return result.ok ? undefined : result.errClass;
}

describe("validate", () => {
  it("accepts a valid list and ignores extra keys", () => {
    const result = validate({ steps: THREE, note: "ignored" });
    assert.deepStrictEqual(result, { ok: true, steps: THREE });
  });

  it("accepts fenced JSON text (TC-007)", () => {
    const raw = `\`\`\`json\n${JSON.stringify(steps(...THREE))}\n\`\`\``;
    assert.strictEqual(validate(raw).ok, true);
  });

  it("strips numbering, bullets and quotes (TC-007)", () => {
    const result = validate(steps('1. Stand up.', '2) "Pick up one cup."', "- Carry it to the sink."));
    assert.deepStrictEqual(result, { ok: true, steps: ["Stand up.", "Pick up one cup.", "Carry it to the sink."] });
  });

  it("collapses whitespace", () => {
    assert.strictEqual(normaliseStep("  Stand \n  up  "), "Stand up");
  });

  it("rejects non-JSON, wrong shape and non-string steps as malformed", () => {
    for (const raw of ["not json", undefined, null, 4, [], {}, { steps: "x" }, { steps: [1, 2, 3] }, "{bad"]) {
      assert.strictEqual(failureOf(raw), "malformed", JSON.stringify(raw));
    }
  });

  it("enforces 3 to 8 steps (TC-005)", () => {
    assert.strictEqual(failureOf(steps("One thing.", "Two things.")), "count");
    assert.strictEqual(failureOf(steps(...Array.from({ length: 9 }, (_v, i) => `Do thing ${String(i)}.`))), "count");
    assert.strictEqual(validate(steps(...Array.from({ length: 8 }, (_v, i) => `Do thing ${String(i)}.`))).ok, true);
  });

  it("rejects empty steps (TC-006)", () => {
    assert.strictEqual(failureOf(steps("Stand up.", "   ", "Pick up a cup.")), "empty");
  });

  it("rejects steps over 12 words (TC-006)", () => {
    const twelve = Array.from({ length: 12 }, () => "go").join(" ");
    assert.strictEqual(validate(steps("Stand up.", twelve, "Pick up a cup.")).ok, true);
    assert.strictEqual(failureOf(steps("Stand up.", `${twelve} now`, "Pick up a cup.")), "too_long");
  });

  it("rejects banned words (TC-006)", () => {
    assert.strictEqual(failureOf(steps("Stand up.", "Do not be lazy.", "Pick up a cup.")), "banned");
    assert.strictEqual(failureOf(steps("Stand up.", "Catch up, you are behind.", "Pick up a cup.")), "banned");
  });

  it("rejects consecutive duplicates only", () => {
    assert.strictEqual(failureOf(steps("Stand up.", "Stand up.", "Pick up a cup.")), "dupe");
    assert.strictEqual(validate(steps("Stand up.", "Sit down.", "Stand up.")).ok, true);
  });

  it("rejects markdown characters", () => {
    assert.strictEqual(failureOf(steps("Stand up.", "Open **the** door.", "Pick up a cup.")), "markup");
    assert.strictEqual(failureOf(steps("Stand up.", "Open `the` door.", "Pick up a cup.")), "markup");
  });
});
