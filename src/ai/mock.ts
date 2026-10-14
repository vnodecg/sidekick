import type { AiClient } from "./types.js";

const MOCK_STEPS = [
  "Stand up and walk to the spot.",
  "Pick up one thing.",
  "Put it where it belongs.",
  "Pick up the next thing.",
  "Take one slow breath.",
];

export function createMockClient(): AiClient {
  return {
    kind: "mock",
    model: "mock",
    breakDown: () => Promise.resolve({ steps: [...MOCK_STEPS] }),
  };
}
