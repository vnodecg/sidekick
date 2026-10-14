import assert from "node:assert";
import { describe, it } from "node:test";
import { ago, duration } from "../../src/core/timewords.js";

describe("duration", () => {
  it("uses the three tiers from TOOLS §0", () => {
    assert.strictEqual(duration(0), "less than a minute");
    assert.strictEqual(duration(59), "less than a minute");
    assert.strictEqual(duration(60), "1 minute");
    assert.strictEqual(duration(12 * 60 + 40), "12 minutes");
    assert.strictEqual(duration(3599), "59 minutes");
    assert.strictEqual(duration(3600), "about 1 hour");
    assert.strictEqual(duration(5 * 3600 + 1200), "about 5 hours");
  });

  it("switches to days after two days and treats negatives as zero", () => {
    assert.strictEqual(duration(47 * 3600), "about 47 hours");
    assert.strictEqual(duration(48 * 3600), "about 2 days");
    assert.strictEqual(duration(-30), "less than a minute");
  });
});

describe("ago", () => {
  it("appends ago to the elapsed time", () => {
    assert.strictEqual(ago(1000, 1000 + 600), "10 minutes ago");
    assert.strictEqual(ago(1000, 1010), "less than a minute ago");
  });
});
