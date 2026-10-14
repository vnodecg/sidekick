import { wins } from "../db/schema.js";
import type { Tx } from "../db/connection.js";

export type WinRow = typeof wins.$inferInsert;

export function insertWin(tx: Tx, row: WinRow): void {
  tx.insert(wins).values(row).run();
}
