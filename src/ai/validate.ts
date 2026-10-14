import { MAX_STEPS, MAX_STEP_WORDS, MIN_STEPS } from "./prompt.js";
import { hasBannedWord } from "../core/reply.js";
import type { ErrClass, Steps } from "./types.js";

export type Validation = { ok: true; steps: Steps } | { ok: false; errClass: ErrClass };

const FENCE = /^```[a-z]*\s*|\s*```$/gi;
const LIST_MARKER = /^(?:\d+\s*[.)]|[-*])\s+/;
const SURROUNDING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;
const MARKUP = /[*#_`[\]]/;

type StepRule = (step: string) => boolean;

const STEP_RULES: ReadonlyArray<readonly [ErrClass, StepRule]> = [
  ["empty", (step) => step === ""],
  ["too_long", (step) => step.split(" ").length > MAX_STEP_WORDS],
  ["banned", hasBannedWord],
  ["markup", (step) => MARKUP.test(step)],
];

function parseRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw.trim().replace(FENCE, "")) as unknown;
  } catch {
    return undefined;
  }
}

function readSteps(raw: unknown): Array<string> | undefined {
  const parsed = parseRaw(raw);
  if (typeof parsed !== "object" || parsed === null || !("steps" in parsed)) return undefined;
  const { steps } = parsed;
  if (!Array.isArray(steps)) return undefined;
  const items = steps as Array<unknown>;
  return items.every((item): item is string => typeof item === "string") ? items : undefined;
}

export function normaliseStep(step: string): string {
  return step.trim().replace(/\s+/g, " ").replace(LIST_MARKER, "").replace(SURROUNDING_QUOTES, "").trim();
}

export function validate(raw: unknown): Validation {
  const rawSteps = readSteps(raw);
  if (rawSteps === undefined) return { ok: false, errClass: "malformed" };
  const [first, ...rest] = rawSteps.map(normaliseStep);
  if (first === undefined || rest.length + 1 < MIN_STEPS || rest.length + 1 > MAX_STEPS) {
    return { ok: false, errClass: "count" };
  }
  const steps: Steps = [first, ...rest];
  for (const [errClass, broken] of STEP_RULES) {
    if (steps.some(broken)) return { ok: false, errClass };
  }
  if (steps.some((step, index) => step === steps[index - 1])) return { ok: false, errClass: "dupe" };
  return { ok: true, steps };
}
