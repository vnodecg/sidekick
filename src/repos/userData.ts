import { eq } from "drizzle-orm";
import { tx } from "../db/connection.js";
import { aiCalls, dopamine, dump, focus, parked, routines, tasks, wins } from "../db/schema.js";
import type { Db } from "../db/connection.js";

const USER_TABLES = [tasks, dump, wins, parked, focus, routines, dopamine, aiCalls] as const;

export function deleteAllData(db: Db, userId: string): void {
  tx(db, (t) => {
    for (const table of USER_TABLES) t.delete(table).where(eq(table.userId, userId)).run();
  });
}
