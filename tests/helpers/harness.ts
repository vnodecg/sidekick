import { makeContext } from "./context.js";
import { connectModules } from "./tool-client.js";
import type { TestContext } from "./context.js";
import type { ToolClient } from "./tool-client.js";
import type { RegisterableModule } from "../../src/registry/types.js";

export type Harness = {
  start: (env?: Record<string, string>) => Promise<{ tool: ToolClient; made: TestContext }>;
  stop: () => Promise<void>;
};

export function toolHarness(modules: Array<RegisterableModule>): Harness {
  let open: ToolClient | undefined;
  return {
    start: async (env) => {
      const made = makeContext(env);
      open = await connectModules(modules, made.ctx);
      return { tool: open, made };
    },
    stop: async () => {
      await open?.close();
      open = undefined;
    },
  };
}
