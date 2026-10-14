import assert from "node:assert";
import { describe, it } from "node:test";
import { localDate, startOfLocalDay, systemClock } from "../../src/core/clock.js";

const epoch = (iso: string): number => Date.parse(iso) / 1000;

describe("systemClock", () => {
  it("returns whole UTC epoch seconds", () => {
    const now = systemClock.now();
    assert.ok(Number.isInteger(now));
    assert.ok(Math.abs(now - Date.now() / 1000) < 2);
  });
});

describe("localDate", () => {
  it("uses the configured zone, not UTC", () => {
    const instant = epoch("2026-03-10T23:30:00Z");
    assert.strictEqual(localDate(instant, "UTC"), "2026-03-10");
    assert.strictEqual(localDate(instant, "Asia/Kolkata"), "2026-03-11");
    assert.strictEqual(localDate(instant, "America/Los_Angeles"), "2026-03-10");
  });

  it("flips at local midnight", () => {
    assert.strictEqual(localDate(epoch("2026-05-31T18:29:59Z"), "Asia/Kolkata"), "2026-05-31");
    assert.strictEqual(localDate(epoch("2026-05-31T18:30:00Z"), "Asia/Kolkata"), "2026-06-01");
  });
});

describe("startOfLocalDay", () => {
  it("returns local midnight as a UTC epoch", () => {
    assert.strictEqual(startOfLocalDay(epoch("2026-03-10T23:30:00Z"), "Asia/Kolkata"), epoch("2026-03-10T18:30:00Z"));
    assert.strictEqual(startOfLocalDay(epoch("2026-03-10T12:00:00Z"), "UTC"), epoch("2026-03-10T00:00:00Z"));
  });

  it("handles the spring-forward day (23 hours long)", () => {
    const midday = epoch("2026-03-08T20:00:00Z");
    assert.strictEqual(startOfLocalDay(midday, "America/Los_Angeles"), epoch("2026-03-08T08:00:00Z"));
    assert.strictEqual(
      startOfLocalDay(epoch("2026-03-09T20:00:00Z"), "America/Los_Angeles") - startOfLocalDay(midday, "America/Los_Angeles"),
      23 * 3600,
    );
  });

  it("handles the fall-back day (25 hours long)", () => {
    const next = startOfLocalDay(epoch("2026-11-02T20:00:00Z"), "America/Los_Angeles");
    const day = startOfLocalDay(epoch("2026-11-01T20:00:00Z"), "America/Los_Angeles");
    assert.strictEqual(day, epoch("2026-11-01T07:00:00Z"));
    assert.strictEqual(next - day, 25 * 3600);
  });

  it("is never later than the instant and within a day of it", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"]) {
      const instant = epoch("2026-09-27T14:15:16Z");
      const start = startOfLocalDay(instant, zone);
      assert.ok(start <= instant && instant - start < 25 * 3600, zone);
      assert.strictEqual(localDate(start, zone), localDate(instant, zone), zone);
    }
  });
});
