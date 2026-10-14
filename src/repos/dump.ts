import { and, count, desc, eq, isNull } from "drizzle-orm";
import { dump } from "../db/schema.js";
import type { Db } from "../db/connection.js";

export type DumpListing = {
  items: Array<string>;
  total: number;
};

export type NewEntry = {
  userId: string;
  text: string;
  now: number;
};

export function addDump(db: Db, entry: NewEntry): void {
  db.insert(dump).values({ userId: entry.userId, text: entry.text, createdAt: entry.now }).run();
}

export function recentDump(db: Db, userId: string, limit: number): DumpListing {
  const saved = and(eq(dump.userId, userId), isNull(dump.archivedAt));
  const items = db
    .select({ text: dump.text })
    .from(dump)
    .where(saved)
    .orderBy(desc(dump.createdAt), desc(dump.id))
    .limit(limit)
    .all()
    .map((row) => row.text);
  return { items, total: db.select({ n: count() }).from(dump).where(saved).get()?.n ?? 0 };
}
