import { closeOpenFocus } from "./focus.js";
import { clearParked } from "./parked.js";
import { archiveOpenTasks } from "./tasks.js";
import { tx } from "../db/connection.js";
import type { Db } from "../db/connection.js";

/*
 * A fresh start archives rather than deletes, and keeps wins and brain-dump items.
 * The open focus session is ended without a win: stopping is not an achievement.
 */
export function freshStart(db: Db, userId: string, now: number): void {
  tx(db, (t) => {
    archiveOpenTasks(t, userId, now);
    closeOpenFocus(t, userId, now);
    clearParked(t, userId);
  });
}
