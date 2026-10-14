import { count } from "drizzle-orm";
import { openDb } from "../../src/db/connection.js";
import type { Db } from "../../src/db/connection.js";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

export function makeDb(): Db {
  return openDb(":memory:");
}

export function countRows(db: Db, table: SQLiteTable): number {
  return db.select({ n: count() }).from(table).get().n;
}
