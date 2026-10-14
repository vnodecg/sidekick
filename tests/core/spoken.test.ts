import assert from "node:assert";
import { describe, it } from "node:test";
import { createSpeak } from "../../src/core/reply.js";
import { spokenList } from "../../src/core/spoken.js";

const speak = createSpeak({ strict: true, log: () => undefined });

function say(items: Array<string>, total?: number): string {
  const { template, echo } = spokenList(items, total);
  const result = speak({ template: `You saved: ${template}.`, echo });
  return (result.content[0] as { text: string }).text;
}

describe("spokenList", () => {
  it("joins with commas and a final and", () => {
    assert.strictEqual(say(["milk"]), "You saved: milk.");
    assert.strictEqual(say(["milk", "eggs"]), "You saved: milk and eggs.");
    assert.strictEqual(say(["milk", "eggs", "tea"]), "You saved: milk, eggs and tea.");
  });

  it("counts the rest as and N more", () => {
    assert.strictEqual(say(["a", "b", "c"], 7), "You saved: a, b, c and 4 more.");
  });

  it("stays one speakable sentence for hostile items", () => {
    const hostile = "# one. two! three? ".repeat(6);
    const text = say([hostile, hostile, hostile, hostile, hostile], 5);
    assert.ok(!/[#\n]/.test(text));
    assert.ok(text.split(/(?<=[.!?])\s+/).length <= 3);
  });

  it("drops trailing items that would overrun the word budget but keeps at least one", () => {
    const wordy = "a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j";
    const text = say([wordy, wordy, wordy], 3);
    assert.match(text, /and 2 more\.$/);
    assert.ok(text.split(/\s+/).length < 40);
  });

  it("falls back to a neutral phrase when nothing is readable", () => {
    assert.strictEqual(say(["😀", "***"]), "You saved: a few things.");
  });
});
