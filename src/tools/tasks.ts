import { z } from "zod";
import { breakDown } from "../ai/breakdown.js";
import { READ_ONLY } from "../core/annotations.js";
import { crisisReply, screen } from "../core/safety.js";
import { UNBLOCKERS } from "../core/unblockers.js";
import { resolveUserId } from "../core/user.js";
import { completeStep, createTask, currentStepTitle } from "../repos/tasks.js";
import type { AppContext } from "../context.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const MAX_TASK_CHARS = 500;
const NOTHING_WAITING = "Nothing is waiting right now. Want to start something?";
const NEXT_STEP = "Next tiny step: {step}.";

const TASK_OPEN = { taskOpen: true } as const;
const TASK_CLOSED = { taskOpen: false } as const;

function nextStep(ctx: AppContext): CallToolResult {
  const step = currentStepTitle(ctx.db, resolveUserId());
  if (step === undefined) return ctx.speak({ template: NOTHING_WAITING, meta: TASK_CLOSED });
  return ctx.speak({ template: NEXT_STEP, echo: { step }, meta: TASK_OPEN });
}

function registerBreakDown(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "break_down_task",
    {
      description:
        "Use when the user says they need to do something big, can't start, or feels stuck on a task. Takes the task in the user's own words and returns only the first tiny step.",
      inputSchema: { task: z.string().max(MAX_TASK_CHARS).optional().describe("The task, in the user's own words") },
    },
    async ({ task }) => {
      const title = (task ?? "").trim();
      if (title === "") return ctx.speak({ template: "What do you need to get started on?" });
      if (screen(title)) return crisisReply(ctx.speak);
      const { steps, source, latencyMs } = await breakDown(ctx, title);
      const taskId = createTask(ctx.db, { userId: resolveUserId(), title, steps, source, now: ctx.clock.now() });
      return ctx.speak({
        template: "Okay. First tiny step: {step}.",
        echo: { step: steps[0] },
        meta: { taskId, source, latencyMs, stepCount: steps.length, ...TASK_OPEN },
      });
    },
  );
}

function registerNextStep(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "next_step",
    {
      description: "Use when the user asks what to do next, or says they're ready for the next step.",
      inputSchema: {},
      annotations: { ...READ_ONLY, idempotentHint: true },
    },
    () => nextStep(ctx),
  );
}

function registerCompleteStep(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "complete_step",
    {
      description: "Use when the user says they did it, they're done, or they finished the step.",
      inputSchema: {},
      annotations: { destructiveHint: false },
    },
    () => {
      const done = completeStep(ctx.db, resolveUserId(), ctx.clock.now());
      if (done.kind === "none") return ctx.speak({ template: NOTHING_WAITING, meta: TASK_CLOSED });
      if (done.kind === "next") {
        return ctx.speak({ template: `Nice. ${NEXT_STEP}`, echo: { step: done.step }, meta: TASK_OPEN });
      }
      return ctx.speak({ template: "Nice. That was the last step, so the whole thing is done.", meta: TASK_CLOSED });
    },
  );
}

function registerImStuck(server: McpServer, ctx: AppContext): void {
  let rotation = 0;
  server.registerTool(
    "im_stuck",
    {
      description:
        "Use when the user says they are stuck or frozen right now, even on a tiny step. Returns one tiny unblocking action.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => {
      const unblocker = UNBLOCKERS[rotation % UNBLOCKERS.length] ?? UNBLOCKERS[0];
      rotation += 1;
      const step = currentStepTitle(ctx.db, resolveUserId());
      if (step === undefined) return ctx.speak({ template: unblocker });
      return ctx.speak({ template: `${unblocker} Then: {step}.`, echo: { step } });
    },
  );
}

const tasksModule: RegisterableModule = {
  type: "tool",
  name: "tasks",
  description: "Task initiation: break_down_task, next_step, complete_step, im_stuck",
  register(server, ctx) {
    registerBreakDown(server, ctx);
    registerNextStep(server, ctx);
    registerCompleteStep(server, ctx);
    registerImStuck(server, ctx);
  },
};

export default tasksModule;
