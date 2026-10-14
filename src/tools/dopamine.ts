import { z } from "zod";
import { WRITES } from "../core/annotations.js";
import { takeText } from "../core/input.js";
import { resolveUserId } from "../core/user.js";
import { addIdea, nextBreak } from "../repos/dopamine.js";
import type { AppContext } from "../context.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MAX_IDEA_CHARS = 60;

function registerDopamineMenu(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "dopamine_menu",
    {
      description: "Use when the user needs a quick, enjoyable break or a little boost.",
      inputSchema: {},
      annotations: WRITES,
    },
    () =>
      ctx.speak({
        template: "Try this for five minutes: {idea}.",
        echo: { idea: nextBreak(ctx.db, resolveUserId(), ctx.clock.now()) },
      }),
  );
}

function registerAddIdea(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "add_dopamine_idea",
    {
      description: "Use when the user wants to add their own idea to their list of quick breaks.",
      inputSchema: { idea: z.string().max(MAX_IDEA_CHARS).optional().describe("A quick break they enjoy") },
      annotations: WRITES,
    },
    ({ idea }) => {
      const text = takeText(ctx.speak, idea, "What would you like to add?");
      if (typeof text !== "string") return text;
      addIdea(ctx.db, { userId: resolveUserId(), idea: text, now: ctx.clock.now() });
      return ctx.speak({ template: "Added to your break ideas." });
    },
  );
}

const dopamineModule: RegisterableModule = {
  type: "tool",
  name: "dopamine",
  description: "Dopamine menu: dopamine_menu, add_dopamine_idea",
  register(server, ctx) {
    registerDopamineMenu(server, ctx);
    registerAddIdea(server, ctx);
  },
};

export default dopamineModule;
