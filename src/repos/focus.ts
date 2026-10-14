import { and, eq, isNull, sql } from "drizzle-orm";
import { insertWin } from "./wins.js";
import { tx } from "../db/connection.js";
import { focus } from "../db/schema.js";
import type { Db, Reader } from "../db/connection.js";

export type FocusRow = typeof focus.$inferSelect;

export type NewFocus = {
  userId: string;
  label: string | null;
  plannedMinutes: number | null;
  now: number;
};

const UNLABELLED_WIN = "a focus session";

export function openFocus(db: Reader, userId: string): FocusRow | undefined {
  return db
    .select()
    .from(focus)
    .where(and(eq(focus.userId, userId), isNull(focus.endedAt)))
    .get();
}

export function startFocus(db: Db, session: NewFocus): void {
  db.insert(focus)
    .values({
      userId: session.userId,
      label: session.label,
      plannedMinutes: session.plannedMinutes,
      startedAt: session.now,
    })
    .run();
}

/*
 * max() keeps ended_at >= started_at even if the system clock stepped backwards.
 */
export function closeOpenFocus(db: Reader, userId: string, now: number): FocusRow | undefined {
  return db
    .update(focus)
    .set({ endedAt: sql`max(${now}, ${focus.startedAt})` })
    .where(and(eq(focus.userId, userId), isNull(focus.endedAt)))
    .returning()
    .get();
}

export function endFocus(db: Db, userId: string, now: number): FocusRow | undefined {
  return tx(db, (t) => {
    const ended = closeOpenFocus(t, userId, now);
    if (ended !== undefined) {
      insertWin(t, { userId, kind: "focus", text: ended.label ?? UNLABELLED_WIN, refId: ended.id, createdAt: now });
    }
    return ended;
  });
}
