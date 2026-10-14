import assert from "node:assert";
import { describe, it } from "node:test";
import { createLog, failure } from "../../src/core/log.js";

describe("createLog", () => {
  it("writes one JSON line per entry, stamped by the injected clock", () => {
    const lines: Array<string> = [];
    const log = createLog((line) => lines.push(line), { now: () => 1_800_000_000 });
    log({ event: "ping", tool: "next_step", ok: true, ms: 4 });
    assert.deepStrictEqual(lines, ['{"ts":"2027-01-15T08:00:00.000Z","event":"ping","tool":"next_step","ok":true,"ms":4}\n']);
  });
});

describe("failure", () => {
  it("carries the error class and message of an Error", () => {
    assert.deepStrictEqual(failure("boom", new TypeError("bad port"), { module: "m" }), {
      event: "boom",
      ok: false,
      errClass: "TypeError",
      detail: "bad port",
      module: "m",
    });
  });

  it("reports unknown throwables without inventing detail", () => {
    assert.deepStrictEqual(failure("boom", "nope"), { event: "boom", ok: false, errClass: "UnknownError", detail: undefined });
  });
});
