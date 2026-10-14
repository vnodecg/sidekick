import { z } from "zod";
import { resolveUserId } from "../core/user.js";
import { deleteAllData } from "../repos/userData.js";
import type { RegisterableModule } from "../registry/types.js";

const dataModule: RegisterableModule = {
  type: "tool",
  name: "data",
  description: "Data: delete_my_data",
  register(server, ctx) {
    server.registerTool(
      "delete_my_data",
      {
        description: "Use only when the user clearly asks to erase all their Sidekick data.",
        inputSchema: { confirm: z.boolean().optional().describe("True only after the user has said yes") },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      },
      ({ confirm }) => {
        if (confirm !== true) return ctx.speak({ template: "This erases everything I saved for you. Say yes to confirm." });
        deleteAllData(ctx.db, resolveUserId());
        return ctx.speak({ template: "Done. Everything is erased.", meta: { taskOpen: false } });
      },
    );
  },
};

export default dataModule;
