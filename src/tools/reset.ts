import { WRITES } from "../core/annotations.js";
import { resolveUserId } from "../core/user.js";
import { freshStart } from "../repos/reset.js";
import type { RegisterableModule } from "../registry/types.js";

const resetModule: RegisterableModule = {
  type: "tool",
  name: "reset",
  description: "Fresh start: gentle_reset",
  register(server, ctx) {
    server.registerTool(
      "gentle_reset",
      {
        description: "Use when the user says they had a bad day, wants a fresh start, or feels behind.",
        inputSchema: {},
        annotations: { ...WRITES, idempotentHint: true },
      },
      () => {
        freshStart(ctx.db, resolveUserId(), ctx.clock.now());
        return ctx.speak({
          template: "Fresh start. Nothing is held against you. Want to pick one tiny thing?",
          meta: { taskOpen: false },
        });
      },
    );
  },
};

export default resetModule;
