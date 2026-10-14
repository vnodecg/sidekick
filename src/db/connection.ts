import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";

export type Db = NodeSQLiteDatabase & { $client: DatabaseSync };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Reader = Db | Tx;

const IN_MEMORY = ":memory:";
const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));
const PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
  "PRAGMA foreign_keys = ON",
  "PRAGMA busy_timeout = 3000",
];

/*
 * Drizzle rejects async callbacks for sync drivers through a conditional type
 * that cannot be restated for a generic T, so the callback is cast once here.
 * Never await inside: node:sqlite is synchronous and the lock is held.
 */
export function tx<T>(db: Db, fn: (tx: Tx) => T): T {
  return db.transaction(fn as never, { behavior: "immediate" });
}

export function openDb(path: string): Db {
  if (path !== IN_MEMORY) mkdirSync(dirname(path), { recursive: true });
  const client = new DatabaseSync(path);
  for (const pragma of PRAGMAS) client.exec(pragma);
  const db = drizzle({ client });
  const failed = migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  if (failed !== undefined) throw new Error("Database migration failed");
  return db;
}
