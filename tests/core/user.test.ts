import assert from "node:assert";
import { describe, it } from "node:test";
import { resolveUserId } from "../../src/core/user.js";

describe("resolveUserId", () => {
  it("returns the single v1 user", () => {
    assert.strictEqual(resolveUserId(), "default");
  });
});
