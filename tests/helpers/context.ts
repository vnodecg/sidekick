import { loadConfig } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { createLog } from "../../src/core/log.js";
import type { AppContext } from "../../src/context.js";
import type { Clock } from "../../src/core/clock.js";

export const TEST_START = 1_800_000_000;

export type TestContext = {
  ctx: AppContext;
  lines: Array<string>;
  tick: (seconds: number) => void;
};

export function makeContext(env: Record<string, string> = {}): TestContext {
  let now = TEST_START;
  const clock: Clock = { now: () => now };
  const lines: Array<string> = [];
  const config = loadConfig({ SIDEKICK_MOCK_AI: "1", SIDEKICK_DB_PATH: ":memory:", NODE_ENV: "test", ...env });
  const ctx = createContext(config, clock, createLog((line) => lines.push(line), clock));
  return {
    ctx,
    lines,
    tick: (seconds) => {
      now += seconds;
    },
  };
}
