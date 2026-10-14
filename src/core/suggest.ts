import { localMoment } from "./clock.js";
import { echoText } from "./reply.js";
import { duration } from "./timewords.js";
import { resolveUserId } from "./user.js";
import { nextBreak } from "../repos/dopamine.js";
import { openFocus } from "../repos/focus.js";
import { dueRoutine } from "../repos/routines.js";
import { currentStepTitle } from "../repos/tasks.js";
import type { SpeakParts } from "./reply.js";
import type { AppContext } from "../context.js";

export const MAX_LABEL_CHARS = 40;

/*
 * The one "what should I do" ranking, shared by what_now and pick_for_me.
 * First hit wins: a running focus session, a due routine, the next tiny step,
 * then a short break, so there is always exactly one thing to say.
 */
export function whatNow(ctx: AppContext): SpeakParts {
  const userId = resolveUserId();
  const now = ctx.clock.now();
  const session = openFocus(ctx.db, userId);
  if (session !== undefined) {
    const elapsed = duration(now - session.startedAt);
    return session.label === null
      ? { template: `Keep going, you're ${elapsed} in.` }
      : { template: `Keep going, you're ${elapsed} into {label}.`, echo: { label: echoText(session.label, MAX_LABEL_CHARS) } };
  }
  const routine = dueRoutine(ctx.db, userId, localMoment(now, ctx.config.timeZone));
  if (routine !== undefined) {
    return { template: "It's time for {name}.", echo: { name: echoText(routine.name, MAX_LABEL_CHARS) } };
  }
  const step = currentStepTitle(ctx.db, userId);
  if (step !== undefined) return { template: "Next tiny step: {step}.", echo: { step } };
  return { template: "Take a short break: {idea}.", echo: { idea: nextBreak(ctx.db, userId, now) } };
}
