import { z } from "zod";
import { READ_ONLY, WRITES } from "../core/annotations.js";
import { localMoment } from "../core/clock.js";
import { freeText, takeText } from "../core/input.js";
import { resolveUserId } from "../core/user.js";
import { addRoutine, dueRoutine, findRoutine, markRoutineDone } from "../repos/routines.js";
import type { AppContext } from "../context.js";
import type { RegisterableModule } from "../registry/types.js";
import type { RoutineRow } from "../repos/routines.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const TIME_OF_DAY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const NOTHING_WAITING = "Nothing is waiting right now.";

function dueNow(ctx: AppContext): RoutineRow | undefined {
  return dueRoutine(ctx.db, resolveUserId(), localMoment(ctx.clock.now(), ctx.config.timeZone));
}

function registerAddRoutine(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "add_routine",
    {
      description: "Use when the user wants a daily reminder anchor, like taking out the bins or stretching.",
      inputSchema: {
        name: freeText.describe("The routine, in the user's own words"),
        time_of_day: z.string().regex(TIME_OF_DAY).optional().describe("Local time as HH:MM, 24-hour"),
      },
      annotations: WRITES,
    },
    ({ name, time_of_day: timeOfDay }) => {
      const text = takeText(ctx.speak, name, "What should be on your daily list?");
      if (typeof text !== "string") return text;
      addRoutine(ctx.db, { userId: resolveUserId(), name: text, timeOfDay: timeOfDay ?? null, now: ctx.clock.now() });
      return ctx.speak({ template: "Okay, {name} is on your daily list.", echo: { name: text } });
    },
  );
}

function registerRoutineCheck(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "routine_check",
    {
      description: "Use when the user asks which daily routines are coming up or what's due.",
      inputSchema: {},
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    () => {
      const routine = dueNow(ctx);
      if (routine === undefined) return ctx.speak({ template: NOTHING_WAITING });
      return ctx.speak({ template: "It's time for {name}.", echo: { name: routine.name } });
    },
  );
}

function registerRoutineDone(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "routine_done",
    {
      description: "Use when the user says they finished a daily routine.",
      inputSchema: { name: freeText.describe("Which routine; leave out for the one that is due") },
      annotations: WRITES,
    },
    ({ name }) => {
      const wanted = (name ?? "").trim();
      const routine = wanted === "" ? dueNow(ctx) : findRoutine(ctx.db, resolveUserId(), wanted);
      if (routine === undefined) {
        return ctx.speak({ template: wanted === "" ? NOTHING_WAITING : "I don't have a routine called that." });
      }
      const now = ctx.clock.now();
      markRoutineDone(ctx.db, routine, { today: localMoment(now, ctx.config.timeZone).today, now });
      return ctx.speak({ template: "Done. {name} is checked off for today.", echo: { name: routine.name } });
    },
  );
}

const routinesModule: RegisterableModule = {
  type: "tool",
  name: "routines",
  description: "Routines: add_routine, routine_check, routine_done",
  register(server, ctx) {
    registerAddRoutine(server, ctx);
    registerRoutineCheck(server, ctx);
    registerRoutineDone(server, ctx);
  },
};

export default routinesModule;
