import { and, desc, eq, gte } from "drizzle-orm";
import { wins } from "../db/schema.js";
import type { Reader } from "../db/connection.js";

export type WinRow = typeof wins.$inferInsert;

export function insertWin(db: Reader, row: WinRow): void {
  db.insert(wins).values(row).run();
}

export function winsSince(db: Reader, userId: string, since: number): Array<string> {
  return db
    .select({ text: wins.text })
    .from(wins)
    .where(and(eq(wins.userId, userId), gte(wins.createdAt, since)))
    .orderBy(desc(wins.createdAt), desc(wins.id))
    .all()
    .map((row) => row.text);
}
