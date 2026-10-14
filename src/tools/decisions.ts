import { z } from "zod";
import { WRITES } from "../core/annotations.js";
import { echoText } from "../core/reply.js";
import { crisisReply, screen } from "../core/safety.js";
import { MAX_LABEL_CHARS, whatNow } from "../core/suggest.js";
import { resolveUserId } from "../core/user.js";
import { nextBreak } from "../repos/dopamine.js";
import { currentStepTitle } from "../repos/tasks.js";
import type { AppContext } from "../context.js";
import type { SpeakParts } from "../core/reply.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MAX_OPTION_CHARS = 280;
const ENERGIES = ["low", "medium", "high"] as const;

type Energy = (typeof ENERGIES)[number];

/*
 * These tools stamp the break-idea rotation, so none claims readOnlyHint.
 * Low energy gets a rest idea. Medium and high get the next tiny step; with no
 * step, high energy is pointed at starting something and medium falls back to
 * the general "what now" ranking.
 */
function suggestFor(ctx: AppContext, energy: Energy): SpeakParts {
  const userId = resolveUserId();
  const lead = `With ${energy} energy,`;
  if (energy === "low") {
    return { template: `${lead} try this: {idea}.`, echo: { idea: nextBreak(ctx.db, userId, ctx.clock.now()) } };
  }
  const step = currentStepTitle(ctx.db, userId);
  if (step !== undefined) return { template: `${lead} try this: {step}.`, echo: { step } };
  if (energy === "high") return { template: `${lead} pick something that's been waiting and tell me what it is.` };
  return whatNow(ctx);
}

function registerPickForMe(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "pick_for_me",
    {
      description: "Use when the user can't decide and wants Sidekick to choose for them.",
      inputSchema: {
        options: z.array(z.string().trim().min(1).max(MAX_OPTION_CHARS)).min(MIN_OPTIONS).max(MAX_OPTIONS).optional().describe("The choices to pick from"),
      },
      annotations: WRITES,
    },
    ({ options }) => {
      if (options === undefined) return ctx.speak(whatNow(ctx));
      if (options.some((option) => screen(option))) return crisisReply(ctx.speak);
      const chosen = options[Math.floor(ctx.random() * options.length)] ?? "";
      return ctx.speak({ template: "Go with {option}.", echo: { option: echoText(chosen, MAX_LABEL_CHARS) } });
    },
  );
}

function registerMatchEnergy(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "match_energy",
    {
      description:
        "Use when the user says how much energy they have, like low, medium or high, and wants one thing to do.",
      inputSchema: { energy: z.enum(ENERGIES).describe("How much energy they have right now") },
      annotations: WRITES,
    },
    ({ energy }) => ctx.speak(suggestFor(ctx, energy)),
  );
}

function registerWhatNow(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "what_now",
    {
      description: "Use when the user asks what they should do right now, or doesn't know what to do.",
      inputSchema: {},
      annotations: WRITES,
    },
    () => ctx.speak(whatNow(ctx)),
  );
}

const decisionsModule: RegisterableModule = {
  type: "tool",
  name: "decisions",
  description: "Decisions: pick_for_me, match_energy, what_now",
  register(server, ctx) {
    registerPickForMe(server, ctx);
    registerMatchEnergy(server, ctx);
    registerWhatNow(server, ctx);
  },
};

export default decisionsModule;
