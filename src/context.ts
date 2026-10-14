import { createSpeak } from "./core/reply.js";
import { openDb } from "./db/connection.js";
import type { Config } from "./config.js";
import type { Clock } from "./core/clock.js";
import type { Log } from "./core/log.js";
import type { Speak } from "./core/reply.js";
import type { Db } from "./db/connection.js";

export type AppContext = {
  config: Config;
  clock: Clock;
  log: Log;
  db: Db;
  speak: Speak;
};

/*
 * The single place dependencies are constructed. Everything else receives an
 * AppContext (or the one piece it needs), so tests swap clock, log and database
 * without touching globals.
 */
export function createContext(config: Config, clock: Clock, log: Log): AppContext {
  return {
    config,
    clock,
    log,
    db: openDb(config.dbPath),
    speak: createSpeak({ strict: config.strictReplies, log }),
  };
}
