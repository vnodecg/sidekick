import { READ_ONLY, WRITES } from "../core/annotations.js";
import { startOfLocalDay } from "../core/clock.js";
import { freeText, takeText } from "../core/input.js";
import { spokenList } from "../core/spoken.js";
import { resolveUserId } from "../core/user.js";
import { insertWin, winsSince } from "../repos/wins.js";
import type { AppContext } from "../context.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const SECONDS_PER_DAY = 86_400;
const WINS_SPOKEN = 3;
const NOTHING_YET = "Nothing logged yet, but we can start with one tiny thing.";

function registerLogWin(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "log_win",
    {
      description: "Use when the user wants to record something they did, even something small.",
      inputSchema: { text: freeText.describe("What they did, in their own words") },
      annotations: WRITES,
    },
    ({ text }) => {
      const win = takeText(ctx.speak, text, "What did you do?");
      if (typeof win !== "string") return win;
      insertWin(ctx.db, { userId: resolveUserId(), kind: "manual", text: win, createdAt: ctx.clock.now() });
      return ctx.speak({ template: "Logged. That counts." });
    },
  );
}

/*
 * Widest window last: today in the user's local time, then the last 24 hours,
 * then the last week. The first window with anything in it is the one spoken.
 */
function winWindows(now: number, timeZone: string): Array<{ lead: string; since: number }> {
  return [
    { lead: "Today you", since: startOfLocalDay(now, timeZone) },
    { lead: "In the last day you", since: now - SECONDS_PER_DAY },
    { lead: "This past week you", since: now - 7 * SECONDS_PER_DAY },
  ];
}

function registerMyWins(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "my_wins",
    {
      description:
        "Use when the user asks what they've done, wants to hear their wins, or feels like they did nothing.",
      inputSchema: {},
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    () => {
      const userId = resolveUserId();
      const now = ctx.clock.now();
      for (const { lead, since } of winWindows(now, ctx.config.timeZone)) {
        const found = winsSince(ctx.db, userId, since);
        if (found.length === 0) continue;
        const { template, echo } = spokenList(found.slice(0, WINS_SPOKEN), found.length);
        return ctx.speak({ template: `${lead}: ${template}.`, echo });
      }
      return ctx.speak({ template: NOTHING_YET });
    },
  );
}

const winsModule: RegisterableModule = {
  type: "tool",
  name: "wins",
  description: "Wins: log_win, my_wins",
  register(server, ctx) {
    registerLogWin(server, ctx);
    registerMyWins(server, ctx);
  },
};

export default winsModule;
