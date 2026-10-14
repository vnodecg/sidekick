import { desc, eq } from "drizzle-orm";
import { parked } from "../db/schema.js";
import type { Db, Reader } from "../db/connection.js";

export type ParkedSpot = {
  note: string;
  createdAt: number;
};

export type NewSpot = {
  userId: string;
  note: string;
  now: number;
};

export function addParked(db: Db, spot: NewSpot): void {
  db.insert(parked).values({ userId: spot.userId, note: spot.note, createdAt: spot.now }).run();
}

export function lastParked(db: Db, userId: string): ParkedSpot | undefined {
  return db
    .select({ note: parked.note, createdAt: parked.createdAt })
    .from(parked)
    .where(eq(parked.userId, userId))
    .orderBy(desc(parked.createdAt), desc(parked.id))
    .limit(1)
    .get();
}

export function clearParked(db: Reader, userId: string): void {
  db.delete(parked).where(eq(parked.userId, userId)).run();
}
