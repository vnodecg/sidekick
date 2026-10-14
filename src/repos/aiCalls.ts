import { aiCalls } from "../db/schema.js";
import type { ErrClass } from "../ai/types.js";
import type { Db } from "../db/connection.js";

export type AiCallRow = {
  userId: string;
  model: string;
  attempt: number;
  errorClass: ErrClass | null;
  latencyMs: number;
  createdAt: number;
};

export function recordAiCall(db: Db, row: AiCallRow): void {
  db.insert(aiCalls).values({ ...row, success: row.errorClass === null }).run();
}
