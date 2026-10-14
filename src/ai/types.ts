export const AI_ERROR_CLASSES = [
  "malformed",
  "count",
  "empty",
  "too_long",
  "banned",
  "dupe",
  "markup",
  "timeout",
  "throttled",
  "auth",
  "network",
  "other",
] as const;

export type ErrClass = (typeof AI_ERROR_CLASSES)[number];

export type Steps = [string, ...Array<string>];

export type BreakdownSource = "ai" | "mock" | "fallback";

export type AiClient = {
  kind: "ai" | "mock";
  model: string;
  breakDown: (task: string, signal: AbortSignal) => Promise<unknown>;
};
