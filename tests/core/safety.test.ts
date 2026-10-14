import assert from "node:assert";
import { describe, it } from "node:test";
import { CRISIS_PHRASES, CRISIS_TEXT } from "../../src/core/lexicon.js";
import { findViolation } from "../../src/core/reply.js";
import { crisisReply, screen } from "../../src/core/safety.js";
import { makeContext } from "../helpers/index.js";

describe("screen", () => {
  it("flags every phrase in the lexicon", () => {
    for (const phrase of CRISIS_PHRASES) {
      assert.ok(screen(`honestly ${phrase} today`), phrase);
    }
  });

  it("ignores case, curly apostrophes, punctuation and spacing", () => {
    assert.ok(screen("I DON’T want to be here"));
    assert.ok(screen("dont   want to be here."));
    assert.ok(screen("I might Kill... myself"));
    assert.ok(screen("thinking about self-harm"));
  });

  it("does not flag near misses (TC-065 policy: whole phrases only)", () => {
    for (const text of [
      "this task is killing me",
      "kill the process",
      "I need to hurt less",
      "myself and I will clean the kitchen",
      "I need to clean the kitchen",
    ]) {
      assert.strictEqual(screen(text), false, text);
    }
  });

  it("accepts known false positives rather than risk a miss", () => {
    assert.ok(screen("I want to die laughing at this meme"));
  });

  it("matches whole words only", () => {
    assert.strictEqual(screen("suicides are mentioned in the novel"), false);
  });
});

describe("crisisReply", () => {
  it("is a calm, valid reply and not an error", () => {
    const result = crisisReply(makeContext().ctx.speak);
    assert.strictEqual(result.isError, undefined);
    assert.deepStrictEqual(result.content, [{ type: "text", text: CRISIS_TEXT }]);
    assert.strictEqual(findViolation(CRISIS_TEXT), undefined);
  });
});
