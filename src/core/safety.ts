import { CRISIS_PHRASES, CRISIS_TEXT } from "./lexicon.js";
import type { Speak } from "./reply.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CRISIS_PATTERN = new RegExp(`\\b(?:${CRISIS_PHRASES.map(normalise).join("|")})\\b`);

export function screen(text: string): boolean {
  return CRISIS_PATTERN.test(normalise(text));
}

export function crisisReply(speak: Speak): CallToolResult {
  return speak({ template: CRISIS_TEXT });
}
