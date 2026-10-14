import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const TASK_STATUSES = ["open", "done", "archived"] as const;
export const TASK_SOURCES = ["ai", "fallback", "mock"] as const;
export const WIN_KINDS = ["step", "task", "focus", "routine", "manual"] as const;
const BOOLEAN = [0, 1] as const;

const oneOf = (column: AnySQLiteColumn, values: ReadonlyArray<string | number>): SQL =>
  sql`${column} in (${sql.raw(values.map((value) => (typeof value === "string" ? `'${value}'` : String(value))).join(", "))})`;

/*
 * A parent task has parent_id NULL and position 0; its steps have
 * parent_id = parent.id and position 1..n. The composite FK keeps a step in the
 * same user partition as its parent.
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    parentId: integer("parent_id"),
    title: text().notNull(),
    position: integer().notNull().default(0),
    status: text({ enum: TASK_STATUSES }).notNull().default("open"),
    source: text({ enum: TASK_SOURCES }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (t) => [
    unique().on(t.userId, t.id),
    foreignKey({ columns: [t.userId, t.parentId], foreignColumns: [t.userId, t.id] }).onDelete("cascade"),
    check("tasks_status", oneOf(t.status, TASK_STATUSES)),
    check("tasks_source", sql`${t.source} is null or ${oneOf(t.source, TASK_SOURCES)}`),
    check(
      "tasks_position",
      sql`(${t.parentId} is null and ${t.position} = 0) or (${t.parentId} is not null and ${t.position} >= 1)`,
    ),
    check("tasks_source_on_parent_only", sql`${t.parentId} is null or ${t.source} is null`),
    check("tasks_done_has_completed_at", sql`(${t.status} = 'done') = (${t.completedAt} is not null)`),
    index("tasks_user_parent_status").on(t.userId, t.parentId, t.status, t.position),
    index("tasks_user_active")
      .on(t.userId, t.status, sql`${t.updatedAt} desc`)
      .where(sql`${t.parentId} is null`),
  ],
);

export const dump = sqliteTable(
  "dump",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    text: text().notNull(),
    createdAt: integer("created_at").notNull(),
    archivedAt: integer("archived_at"),
  },
  (t) => [index("dump_user_created").on(t.userId, sql`${t.createdAt} desc`)],
);

export const wins = sqliteTable(
  "wins",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    kind: text({ enum: WIN_KINDS }).notNull(),
    text: text().notNull(),
    refId: integer("ref_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("wins_kind", oneOf(t.kind, WIN_KINDS)), index("wins_user_created").on(t.userId, sql`${t.createdAt} desc`)],
);

export const parked = sqliteTable(
  "parked",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    note: text().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("parked_user_created").on(t.userId, sql`${t.createdAt} desc`)],
);

export const focus = sqliteTable(
  "focus",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    label: text(),
    plannedMinutes: integer("planned_minutes"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (t) => [
    check("focus_planned_minutes", sql`${t.plannedMinutes} is null or ${t.plannedMinutes} between 1 and 240`),
    check("focus_ended_after_started", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
    uniqueIndex("focus_one_open")
      .on(t.userId)
      .where(sql`${t.endedAt} is null`),
  ],
);

export const routines = sqliteTable(
  "routines",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    timeOfDay: text("time_of_day"),
    lastDoneOn: text("last_done_on"),
    createdAt: integer("created_at").notNull(),
    archivedAt: integer("archived_at"),
  },
  (t) => [
    check(
      "routines_time_of_day",
      sql`${t.timeOfDay} is null or ${t.timeOfDay} glob '[01][0-9]:[0-5][0-9]' or ${t.timeOfDay} glob '2[0-3]:[0-5][0-9]'`,
    ),
    check("routines_last_done_on", sql`${t.lastDoneOn} is null or ${t.lastDoneOn} glob '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'`),
    index("routines_user")
      .on(t.userId)
      .where(sql`${t.archivedAt} is null`),
  ],
);

export const dopamine = sqliteTable(
  "dopamine",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    idea: text().notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("dopamine_is_default", oneOf(t.isDefault, BOOLEAN)), index("dopamine_user_used").on(t.userId, t.lastUsedAt)],
);

export const aiCalls = sqliteTable(
  "ai_calls",
  {
    id: integer().primaryKey(),
    userId: text("user_id").notNull(),
    model: text().notNull(),
    attempt: integer().notNull(),
    success: integer({ mode: "boolean" }).notNull(),
    errorClass: text("error_class"),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("ai_calls_success", oneOf(t.success, BOOLEAN)), index("ai_calls_user_created").on(t.userId, sql`${t.createdAt} desc`)],
);
