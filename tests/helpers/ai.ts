import type { AiClient } from "../../src/ai/types.js";

export type FakeReply = unknown;

export function fakeClient(replies: Array<FakeReply>): AiClient & { calls: Array<string> } {
  const calls: Array<string> = [];
  return {
    kind: "ai",
    model: "fake-model",
    calls,
    breakDown: (task, signal) => {
      calls.push(task);
      const reply = replies[Math.min(calls.length, replies.length) - 1];
      if (reply instanceof Error) return Promise.reject(reply);
      if (reply === "hang") {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve(reply);
    },
  };
}

export function namedError(name: string, message = "boom"): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export const GOOD_STEPS = { steps: ["Stand up.", "Pick up one cup.", "Carry it to the sink."] };
