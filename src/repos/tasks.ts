import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { insertWin } from "./wins.js";
import { tx } from "../db/connection.js";
import { tasks } from "../db/schema.js";
import type { Steps } from "../ai/types.js";
import type { Db, Reader, Tx } from "../db/connection.js";

type TaskRow = typeof tasks.$inferSelect;
type TaskSource = NonNullable<TaskRow["source"]>;

export type NewTask = {
  userId: string;
  title: string;
  steps: Steps;
  source: TaskSource;
  now: number;
};

export type StepCompletion =
  | { kind: "none" }
  | { kind: "next"; step: string }
  | { kind: "finished" };

export function createTask(db: Db, task: NewTask): number {
  return tx(db, (t) => {
    const stamps = { userId: task.userId, createdAt: task.now, updatedAt: task.now };
    const parent = t
      .insert(tasks)
      .values({ ...stamps, title: task.title, position: 0, source: task.source })
      .returning({ id: tasks.id })
      .get();
    t.insert(tasks)
      .values(task.steps.map((title, index) => ({ ...stamps, title, parentId: parent.id, position: index + 1 })))
      .run();
    return parent.id;
  });
}

export function activeTask(db: Reader, userId: string): TaskRow | undefined {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.parentId), eq(tasks.status, "open")))
    .orderBy(desc(tasks.updatedAt), desc(tasks.id))
    .limit(1)
    .get();
}

function currentStep(db: Reader, userId: string, parentId: number): TaskRow | undefined {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.parentId, parentId), eq(tasks.status, "open")))
    .orderBy(asc(tasks.position))
    .limit(1)
    .get();
}

export function currentStepTitle(db: Db, userId: string): string | undefined {
  const parent = activeTask(db, userId);
  return parent === undefined ? undefined : currentStep(db, userId, parent.id)?.title;
}

function markDone(t: Tx, row: TaskRow, now: number): void {
  t.update(tasks).set({ status: "done", completedAt: now, updatedAt: now }).where(eq(tasks.id, row.id)).run();
}

export function completeStep(db: Db, userId: string, now: number): StepCompletion {
  return tx(db, (t) => {
    const parent = activeTask(t, userId);
    const step = parent === undefined ? undefined : currentStep(t, userId, parent.id);
    if (parent === undefined || step === undefined) return { kind: "none" };
    markDone(t, step, now);
    insertWin(t, { userId, kind: "step", text: step.title, refId: step.id, createdAt: now });
    const next = currentStep(t, userId, parent.id);
    if (next !== undefined) {
      t.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, parent.id)).run();
      return { kind: "next", step: next.title };
    }
    markDone(t, parent, now);
    insertWin(t, { userId, kind: "task", text: parent.title, refId: parent.id, createdAt: now });
    return { kind: "finished" };
  });
}

export function archiveOpenTasks(db: Reader, userId: string, now: number): void {
  db.update(tasks)
    .set({ status: "archived", updatedAt: now })
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "open")))
    .run();
}
