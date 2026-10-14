#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { loadConfig } from "./config.js";
import { createContext } from "./context.js";
import { systemClock } from "./core/clock.js";
import { createLog, failure, stderrSink } from "./core/log.js";
import { boot } from "./server/boot.js";

const log = createLog(stderrSink, systemClock);

async function main(): Promise<void> {
  loadDotenv({ quiet: true });
  await boot(createContext(loadConfig(process.env), systemClock, log));
}

main().catch((error: unknown) => {
  log(failure("fatal", error));
  process.exit(1);
});
