import { and, asc, eq, max, sql } from "drizzle-orm";
import { tx } from "../db/connection.js";
import { dopamine } from "../db/schema.js";
import type { Db, Tx } from "../db/connection.js";

const DEFAULT_IDEAS = [
  "stretch for one minute",
  "drink a glass of water",
  "step outside for fresh air",
  "put on one favourite song",
  "do ten slow breaths",
  "walk to another room and back",
  "text a friend a silly emoji",
  "doodle for two minutes",
] as const;

function ensureSeeded(t: Tx, userId: string, now: number): void {
  const seeded = t
    .select({ id: dopamine.id })
    .from(dopamine)
    .where(and(eq(dopamine.userId, userId), eq(dopamine.isDefault, true)))
    .limit(1)
    .get();
  if (seeded !== undefined) return;
  t.insert(dopamine)
    .values(DEFAULT_IDEAS.map((idea) => ({ userId, idea, isDefault: true, createdAt: now })))
    .run();
}

export type NewIdea = {
  userId: string;
  idea: string;
  now: number;
};

export function addIdea(db: Db, entry: NewIdea): void {
  tx(db, (t) => {
    ensureSeeded(t, entry.userId, entry.now);
    t.insert(dopamine).values({ userId: entry.userId, idea: entry.idea, createdAt: entry.now }).run();
  });
}

/*
 * Never-used ideas come first, then the least recently used. Timestamps have
 * one-second resolution, so the stamp is pushed past the newest existing one;
 * otherwise two picks in the same second would tie and the same idea would repeat.
 */
export function nextBreak(db: Db, userId: string, now: number): string {
  return tx(db, (t) => {
    ensureSeeded(t, userId, now);
    const pick = t
      .select()
      .from(dopamine)
      .where(eq(dopamine.userId, userId))
      .orderBy(sql`${dopamine.lastUsedAt} is not null`, asc(dopamine.lastUsedAt), asc(dopamine.id))
      .limit(1)
      .get();
    if (pick === undefined) throw new Error("No break ideas after seeding");
    const newest = t.select({ at: max(dopamine.lastUsedAt) }).from(dopamine).where(eq(dopamine.userId, userId)).get();
    const stamp = Math.max(now, (newest?.at ?? 0) + 1);
    t.update(dopamine).set({ lastUsedAt: stamp }).where(eq(dopamine.id, pick.id)).run();
    return pick.idea;
  });
}
