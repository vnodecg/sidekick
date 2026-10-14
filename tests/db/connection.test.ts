import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { openDb, tx } from "../../src/db/connection.js";
import * as schema from "../../src/db/schema.js";
import { countRows, makeDb, TEST_START } from "../helpers/index.js";
import type { Db } from "../../src/db/connection.js";

const { aiCalls, dopamine, dump, focus, parked, routines, tasks, wins } = schema;
const NOW = TEST_START;
const TABLES = ["ai_calls", "dopamine", "dump", "focus", "parked", "routines", "tasks", "wins"];

const open: Array<Db> = [];
const dirs: Array<string> = [];

function track(db: Db): Db {
  open.push(db);
  return db;
}

function fresh(): Db {
  return track(makeDb());
}

function task(overrides: Partial<typeof tasks.$inferInsert> = {}): typeof tasks.$inferInsert {
  return { userId: "u", title: "t", createdAt: NOW, updatedAt: NOW, ...overrides };
}

function violation(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, (error: unknown) => {
    const messages = [error, (error as { cause?: unknown }).cause].map((e) => (e instanceof Error ? e.message : ""));
    return messages.some((message) => pattern.test(message));
  });
}

afterEach(() => {
  for (const db of open.splice(0)) db.$client.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("schema", () => {
  it("creates every DATA-MODEL table and records the migration", () => {
    const db = fresh();
    const names = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.deepStrictEqual(names, TABLES);
    assert.strictEqual(db.$client.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get()?.n, 1);
  });

  it("has user_id on every domain table", () => {
    for (const table of [aiCalls, dopamine, dump, focus, parked, routines, tasks, wins]) {
      const config = getTableConfig(table);
      assert.ok(
        config.columns.some((column) => column.name === "user_id" && column.notNull),
        config.name,
      );
    }
  });

  it("types enums and booleans for callers", () => {
    const db = fresh();
    const [row] = db.insert(dopamine).values({ userId: "u", idea: "stretch", createdAt: NOW }).returning().all();
    assert.strictEqual(row?.isDefault, false);
    db.insert(aiCalls).values({ userId: "u", model: "mock", attempt: 1, success: true, latencyMs: 3, createdAt: NOW }).run();
    assert.strictEqual(db.select().from(aiCalls).get()?.success, true);
  });

  it("enforces enums, step shape and the done/completed_at pairing", () => {
    const db = fresh();
    violation(() => db.run(sql`INSERT INTO wins (user_id, kind, text, created_at) VALUES ('u', 'bogus', 't', 1)`), /CHECK/);
    violation(() => db.insert(tasks).values(task({ position: 1 })).run(), /CHECK/);
    violation(() => db.insert(tasks).values(task({ status: "done" })).run(), /CHECK/);
    violation(() => db.insert(tasks).values(task({ status: "open", completedAt: NOW })).run(), /CHECK/);
    violation(() => db.insert(routines).values({ userId: "u", name: "r", timeOfDay: "24:00", createdAt: NOW }).run(), /CHECK/);
    violation(() => db.insert(routines).values({ userId: "u", name: "r", lastDoneOn: "yesterday", createdAt: NOW }).run(), /CHECK/);
    violation(() => db.insert(focus).values({ userId: "u", startedAt: 10, endedAt: 5 }).run(), /CHECK/);
    violation(() => db.insert(focus).values({ userId: "u", startedAt: 1, plannedMinutes: 241 }).run(), /CHECK/);
    violation(() => db.run(sql`INSERT INTO dopamine (user_id, idea, is_default, created_at) VALUES ('u', 'i', 2, 1)`), /CHECK/);
    db.insert(routines).values({ userId: "u", name: "ok", timeOfDay: "23:59", lastDoneOn: "2026-10-14", createdAt: NOW }).run();
  });

  it("makes a cross-user parent link unrepresentable and cascades deletes", () => {
    const db = fresh();
    const parent = db.insert(tasks).values(task({ userId: "a" })).returning({ id: tasks.id }).get();
    violation(() => db.insert(tasks).values(task({ userId: "b", parentId: parent.id, position: 1 })).run(), /FOREIGN KEY/);
    db.insert(tasks).values(task({ userId: "a", parentId: parent.id, position: 1 })).run();
    assert.strictEqual(countRows(db, tasks), 2);
    db.delete(tasks).where(eq(tasks.id, parent.id)).run();
    assert.strictEqual(countRows(db, tasks), 0);
  });

  it("keeps source on parent rows only", () => {
    const db = fresh();
    const parent = db.insert(tasks).values(task({ source: "mock" })).returning({ id: tasks.id }).get();
    violation(() => db.insert(tasks).values(task({ parentId: parent.id, position: 1, source: "ai" })).run(), /CHECK/);
    violation(() => db.insert(tasks).values(task({ source: "gpt" as never })).run(), /CHECK/);
  });

  it("allows one open focus session per user", () => {
    const db = fresh();
    db.insert(focus).values([{ userId: "a", startedAt: 1 }, { userId: "b", startedAt: 1 }]).run();
    violation(() => db.insert(focus).values({ userId: "a", startedAt: 2 }).run(), /UNIQUE/);
    db.update(focus).set({ endedAt: 5 }).where(eq(focus.userId, "a")).run();
    db.insert(focus).values({ userId: "a", startedAt: 6 }).run();
  });
});

describe("openDb", () => {
  it("creates parent directories, applies pragmas, migrates once and survives reopening", () => {
    const dir = mkdtempSync(join(tmpdir(), "sidekick-db-"));
    dirs.push(dir);
    const path = join(dir, "nested", "sidekick.db");
    const first = openDb(path);
    assert.strictEqual(first.$client.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
    assert.strictEqual(first.$client.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    assert.strictEqual(first.$client.prepare("PRAGMA busy_timeout").get()?.timeout, 3000);
    first.insert(dump).values({ userId: "u", text: "t", createdAt: NOW }).run();
    first.$client.close();
    const second = track(openDb(path));
    assert.strictEqual(countRows(second, dump), 1);
    assert.strictEqual(second.$client.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get()?.n, 1);
  });
});

describe("tx", () => {
  it("commits on success and returns the result", () => {
    const db = fresh();
    const id = tx(db, (t) => t.insert(dump).values({ userId: "u", text: "t", createdAt: NOW }).returning({ id: dump.id }).get().id);
    assert.ok(typeof id === "number");
    assert.strictEqual(countRows(db, dump), 1);
  });

  it("rolls back everything and rethrows on failure", () => {
    const db = fresh();
    assert.throws(
      () =>
        tx(db, (t) => {
          t.insert(dump).values({ userId: "u", text: "t", createdAt: NOW }).run();
          throw new Error("boom");
        }),
      /boom/,
    );
    assert.strictEqual(countRows(db, dump), 0);
    tx(db, (t) => t.insert(dump).values({ userId: "u", text: "t", createdAt: NOW }).run());
    assert.strictEqual(countRows(db, dump), 1);
  });

  it("rolls back a multi-statement write when a constraint fails midway", () => {
    const db = fresh();
    assert.throws(() =>
      { tx(db, (t) => {
        t.insert(parked).values({ userId: "u", note: "n", createdAt: NOW }).run();
        t.insert(wins).values({ userId: "u", kind: "nope" as never, text: "x", createdAt: NOW }).run();
      }); },
    );
    assert.strictEqual(countRows(db, parked), 0);
  });
});
