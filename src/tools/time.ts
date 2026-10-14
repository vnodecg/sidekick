import { z } from "zod";
import { READ_ONLY, WRITES } from "../core/annotations.js";
import { freeText } from "../core/input.js";
import { echoText } from "../core/reply.js";
import { crisisReply, screen } from "../core/safety.js";
import { MAX_LABEL_CHARS } from "../core/suggest.js";
import { duration } from "../core/timewords.js";
import { resolveUserId } from "../core/user.js";
import { endFocus, openFocus, startFocus } from "../repos/focus.js";
import { activeTask } from "../repos/tasks.js";
import type { AppContext } from "../context.js";
import type { RegisterableModule } from "../registry/types.js";
import type { FocusRow } from "../repos/focus.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const SECONDS_PER_MINUTE = 60;
const FIVE_MINUTES = 300;
const MAX_FOCUS_MINUTES = 240;
const MIN_WARNING_MINUTES = 5;
const MAX_WARNING_MINUTES = 180;
const WRAP_UP_AT = 2;
const HEADS_UP_AT = [10, 5] as const;
const NO_SESSION = "No focus session is running";

const boundedMinutes = (min: number, max: number): z.ZodOptional<z.ZodNumber> =>
  z.number().int().min(min).max(max).optional();

function stagePhrase(session: FocusRow, elapsed: number): string {
  const planned = session.plannedMinutes;
  if (planned === null) return "";
  const total = planned * SECONDS_PER_MINUTE;
  if (elapsed >= total) return ` You've passed your ${String(planned)} minutes, no rush.`;
  if (elapsed < total / 2) return "";
  return total - elapsed <= FIVE_MINUTES ? " About five minutes left." : " That's about halfway.";
}

function registerStartFocus(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "start_focus",
    {
      description: "Use when the user says they are starting to work on something now, or wants a focus timer.",
      inputSchema: {
        label: freeText.describe("What they are working on"),
        minutes: boundedMinutes(1, MAX_FOCUS_MINUTES).describe("Planned length in minutes"),
      },
      annotations: WRITES,
    },
    ({ label, minutes: planned }) => {
      const userId = resolveUserId();
      const now = ctx.clock.now();
      const named = (label ?? "").trim();
      if (screen(named)) return crisisReply(ctx.speak);
      const running = openFocus(ctx.db, userId);
      if (running !== undefined) {
        return ctx.speak({ template: `You're already going, ${duration(now - running.startedAt)} in.` });
      }
      const resolved = named === "" ? (activeTask(ctx.db, userId)?.title ?? null) : named;
      startFocus(ctx.db, { userId, label: resolved, plannedMinutes: planned ?? null, now });
      const note = planned === undefined ? "" : ` I'll note ${String(planned)} minutes.`;
      return ctx.speak({ template: `Okay, focus time started.${note}` });
    },
  );
}

function registerTimeCheck(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "time_check",
    {
      description: "Use when the user asks how long they've been working, or how much time has passed.",
      inputSchema: {},
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    () => {
      const session = openFocus(ctx.db, resolveUserId());
      if (session === undefined) return ctx.speak({ template: `${NO_SESSION}. Want to start one?` });
      const elapsed = ctx.clock.now() - session.startedAt;
      return ctx.speak({ template: `You've been at it for ${duration(elapsed)}.${stagePhrase(session, elapsed)}` });
    },
  );
}

function registerEndFocus(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "end_focus",
    {
      description: "Use when the user says they are done working or wants to stop the timer.",
      inputSchema: {},
      annotations: WRITES,
    },
    () => {
      const now = ctx.clock.now();
      const ended = endFocus(ctx.db, resolveUserId(), now);
      if (ended === undefined) return ctx.speak({ template: `${NO_SESSION}.` });
      return ctx.speak({ template: `Good work. You focused for ${duration(now - ended.startedAt)}.` });
    },
  );
}

function headsUpPoints(total: number): Array<number> {
  const candidates = new Set([Math.floor(total / 2), ...HEADS_UP_AT]);
  return [...candidates].filter((point) => point < total && point > WRAP_UP_AT).sort((a, b) => b - a);
}

const spokenPoints = (points: Array<number>): string => points.join(", ").replace(/, (\d+)$/, " and $1");

function registerTransitionWarning(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "transition_warning",
    {
      description:
        "Use when the user wants a heads-up before switching to something else, like leaving the house or a meeting.",
      inputSchema: {
        minutes: boundedMinutes(MIN_WARNING_MINUTES, MAX_WARNING_MINUTES).describe("Minutes until the switch"),
        label: freeText.describe("What they are switching to"),
      },
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    ({ minutes: total, label }) => {
      if (total === undefined) return ctx.speak({ template: "How many minutes until the switch?" });
      const named = (label ?? "").trim();
      if (screen(named)) return crisisReply(ctx.speak);
      const points = headsUpPoints(total);
      const schedule = [...points, WRAP_UP_AT].map((atMinutes) => ({ atMinutes }));
      const lead = `Okay. I'll count down to {target} in ${String(total)} minutes`;
      const heads = points.length === 0 ? "" : `: heads-up at ${spokenPoints(points)} minutes left`;
      return ctx.speak({
        template: `${lead}${heads}, and wrap up at ${String(WRAP_UP_AT)}.`,
        echo: { target: named === "" ? "the switch" : echoText(named, MAX_LABEL_CHARS) },
        meta: { schedule },
      });
    },
  );
}

const timeModule: RegisterableModule = {
  type: "tool",
  name: "time",
  description: "Time: start_focus, time_check, end_focus, transition_warning",
  register(server, ctx) {
    registerStartFocus(server, ctx);
    registerTimeCheck(server, ctx);
    registerEndFocus(server, ctx);
    registerTransitionWarning(server, ctx);
  },
};

export default timeModule;
