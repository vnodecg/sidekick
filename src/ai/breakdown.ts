import { classifyError } from "./errors.js";
import { fallbackSteps } from "./fallback.js";
import { validate } from "./validate.js";
import { resolveUserId } from "../core/user.js";
import { recordAiCall } from "../repos/aiCalls.js";
import type { AppContext } from "../context.js";
import type { BreakdownSource, ErrClass, Steps } from "./types.js";

const MAX_ATTEMPTS = 2;
const MIN_RETRY_MS = 1000;

export type BreakdownResult = {
  steps: Steps;
  source: BreakdownSource;
  latencyMs: number;
};

type Attempt = { steps: Steps; errClass?: undefined } | { steps?: undefined; errClass: ErrClass };

async function attempt(ctx: AppContext, task: string, budgetMs: number): Promise<Attempt> {
  const signal = AbortSignal.timeout(Math.max(1, Math.floor(Math.min(ctx.config.aiTimeoutMs, budgetMs))));
  try {
    const checked = validate(await ctx.ai.breakDown(task, signal));
    return checked.ok ? { steps: checked.steps } : { errClass: checked.errClass };
  } catch (error) {
    return { errClass: classifyError(error) };
  }
}

/*
 * Never throws: every failure ends in the fixed fallback so the caller always has
 * steps to save. Only metadata is recorded; the task text never reaches ai_calls or the log.
 */
export async function breakDown(ctx: AppContext, task: string): Promise<BreakdownResult> {
  const started = performance.now();
  const deadline = started + ctx.config.aiBudgetMs;
  const finish = (steps: Steps, source: BreakdownSource): BreakdownResult => ({
    steps,
    source,
    latencyMs: Math.round(performance.now() - started),
  });

  for (let number = 1; number <= MAX_ATTEMPTS; number += 1) {
    const remaining = deadline - performance.now();
    if (number > 1 && remaining < MIN_RETRY_MS) break;
    const attemptStarted = performance.now();
    const outcome = await attempt(ctx, task, remaining);
    const latencyMs = Math.round(performance.now() - attemptStarted);
    const errClass = outcome.errClass ?? null;
    recordAiCall(ctx.db, {
      userId: resolveUserId(),
      model: ctx.ai.model,
      attempt: number,
      errorClass: errClass,
      latencyMs,
      createdAt: ctx.clock.now(),
    });
    ctx.log({ event: "ai_call", ok: errClass === null, ms: latencyMs, ...(errClass === null ? {} : { errClass }) });
    if (outcome.steps !== undefined) return finish(outcome.steps, ctx.ai.kind);
  }
  return finish(fallbackSteps(), "fallback");
}
