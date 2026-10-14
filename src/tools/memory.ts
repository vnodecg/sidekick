import { READ_ONLY, WRITES } from "../core/annotations.js";
import { freeText, takeText } from "../core/input.js";
import { spokenList } from "../core/spoken.js";
import { ago } from "../core/timewords.js";
import { resolveUserId } from "../core/user.js";
import { addDump, recentDump } from "../repos/dump.js";
import { addParked, lastParked } from "../repos/parked.js";
import { currentStepTitle } from "../repos/tasks.js";
import type { AppContext } from "../context.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const DUMP_READ_LIMIT = 5;
const upperFirst = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function registerBrainDump(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "brain_dump",
    {
      description:
        "Use when the user says a stray thought, idea or reminder they want out of their head. Save it and ask nothing back.",
      inputSchema: { thought: freeText.describe("The thought, in the user's own words") },
      annotations: WRITES,
    },
    ({ thought }) => {
      const text = takeText(ctx.speak, thought, "Go ahead, I'm listening.");
      if (typeof text !== "string") return text;
      addDump(ctx.db, { userId: resolveUserId(), text, now: ctx.clock.now() });
      return ctx.speak({ template: "Got it. It's saved, so you can let it go." });
    },
  );
}

function registerSortDump(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "sort_dump",
    {
      description: "Use only when the user asks to hear their saved thoughts or brain dump.",
      inputSchema: {},
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    () => {
      const { items, total } = recentDump(ctx.db, resolveUserId(), DUMP_READ_LIMIT);
      if (total === 0) return ctx.speak({ template: "Nothing saved yet." });
      const { template, echo } = spokenList(items, total);
      return ctx.speak({ template: `You saved: ${template}.`, echo });
    },
  );
}

function registerParkMyPlace(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "park_my_place",
    {
      description:
        "Use when the user is about to be interrupted or switch away and wants to remember where they were.",
      inputSchema: { note: freeText.describe("Where they are right now") },
      annotations: WRITES,
    },
    ({ note }) => {
      const userId = resolveUserId();
      const given = (note ?? "").trim();
      const text = takeText(ctx.speak, given === "" ? currentStepTitle(ctx.db, userId) : given, "Where are you right now?");
      if (typeof text !== "string") return text;
      addParked(ctx.db, { userId, note: text, now: ctx.clock.now() });
      return ctx.speak({ template: "Parked. I'll remember where you were." });
    },
  );
}

function registerWhereWasI(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "where_was_i",
    {
      description: "Use when the user asks where they were, what they were doing, or returns after a break.",
      inputSchema: {},
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    () => {
      const userId = resolveUserId();
      const spot = lastParked(ctx.db, userId);
      if (spot === undefined) return ctx.speak({ template: "I don't have a spot saved yet." });
      const when = upperFirst(ago(spot.createdAt, ctx.clock.now()));
      const step = currentStepTitle(ctx.db, userId);
      if (step === undefined || step === spot.note) {
        return ctx.speak({ template: `${when}, you were here: {note}.`, echo: { note: spot.note } });
      }
      return ctx.speak({ template: `${when}, you were here: {note}. Next tiny step: {step}.`, echo: { note: spot.note, step } });
    },
  );
}

const memoryModule: RegisterableModule = {
  type: "tool",
  name: "memory",
  description: "Memory: brain_dump, sort_dump, park_my_place, where_was_i",
  register(server, ctx) {
    registerBrainDump(server, ctx);
    registerSortDump(server, ctx);
    registerParkMyPlace(server, ctx);
    registerWhereWasI(server, ctx);
  },
};

export default memoryModule;
