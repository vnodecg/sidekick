import { z } from "zod";
import { crisisReply, screen } from "./safety.js";
import type { Speak } from "./reply.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const MAX_TEXT_CHARS = 280;

export const freeText = z.string().max(MAX_TEXT_CHARS).optional();

/*
 * Every free-text tool follows the same three steps: ask when empty, answer a
 * crisis phrase with support (nothing stored), else hand back the trimmed text.
 */
export function takeText(speak: Speak, raw: string | undefined, ask: string): string | CallToolResult {
  const text = (raw ?? "").trim();
  if (text === "") return speak({ template: ask });
  return screen(text) ? crisisReply(speak) : text;
}
