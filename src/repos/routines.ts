import { and, asc, eq, isNull } from "drizzle-orm";
import { insertWin } from "./wins.js";
import { tx } from "../db/connection.js";
import { routines } from "../db/schema.js";
import type { Db } from "../db/connection.js";

export type RoutineRow = typeof routines.$inferSelect;

export type LocalMoment = {
  today: string;
  time: string;
};

export type NewRoutine = {
  userId: string;
  name: string;
  timeOfDay: string | null;
  now: number;
};

export function addRoutine(db: Db, routine: NewRoutine): void {
  db.insert(routines)
    .values({ userId: routine.userId, name: routine.name, timeOfDay: routine.timeOfDay, createdAt: routine.now })
    .run();
}

function activeRoutines(db: Db, userId: string): Array<RoutineRow> {
  return db
    .select()
    .from(routines)
    .where(and(eq(routines.userId, userId), isNull(routines.archivedAt)))
    .orderBy(asc(routines.id))
    .all();
}

const isDue = (routine: RoutineRow, moment: LocalMoment): boolean =>
  routine.lastDoneOn !== moment.today && (routine.timeOfDay === null || moment.time >= routine.timeOfDay);

/*
 * Timed routines come first in clock order, then untimed ones, so the earliest
 * anchor of the day is the one spoken. Time-of-day strings compare correctly as text.
 */
export function dueRoutine(db: Db, userId: string, moment: LocalMoment): RoutineRow | undefined {
  return activeRoutines(db, userId)
    .filter((routine) => isDue(routine, moment))
    .sort((a, b) => (a.timeOfDay ?? "99:99").localeCompare(b.timeOfDay ?? "99:99"))[0];
}

export function findRoutine(db: Db, userId: string, query: string): RoutineRow | undefined {
  const wanted = query.trim().toLowerCase();
  const all = activeRoutines(db, userId);
  return (
    all.find((routine) => routine.name.toLowerCase() === wanted) ??
    all.find((routine) => {
      const name = routine.name.toLowerCase();
      return name.includes(wanted) || wanted.includes(name);
    })
  );
}

export function markRoutineDone(db: Db, routine: RoutineRow, when: { today: string; now: number }): void {
  tx(db, (t) => {
    t.update(routines).set({ lastDoneOn: when.today }).where(eq(routines.id, routine.id)).run();
    insertWin(t, { userId: routine.userId, kind: "routine", text: routine.name, refId: routine.id, createdAt: when.now });
  });
}
