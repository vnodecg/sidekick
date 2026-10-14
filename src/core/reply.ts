import { CORE_BANNED_WORDS, EXTENDED_BANNED_WORDS } from "./lexicon.js";
import type { Log } from "./log.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const MAX_SENTENCES = 3;
const MAX_WORDS_PER_SENTENCE = 40;
const DEFAULT_ECHO_CHARS = 100;
const SAFE_REPLY = "Okay. I've got that.";
const SLOT = /\{(\w+)\}/g;
const MARKUP_CHARS = String.raw`[*#_\`>[\]()|{}]`;
const URL_SOURCE = String.raw`(?:https?://|www\.)\S*`;
const EMOJI_SOURCE = String.raw`\p{Extended_Pictographic}`;
const FORBIDDEN_MARKUP = new RegExp(String.raw`${MARKUP_CHARS}|^\s*(?:-|\d+\.)\s|[\n\r]|${URL_SOURCE}`, "i");
const EMOJI = new RegExp(EMOJI_SOURCE, "u");
const BANNED_PATTERN = new RegExp(
  `\\b(?:${[...CORE_BANNED_WORDS, ...EXTENDED_BANNED_WORDS].map((word) => word.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "i",
);

export type ReplyRule = "empty" | "sentences" | "markup" | "emoji" | "sentence-length" | "questions" | "banned-word";

export type SpeakParts = {
  template: string;
  echo?: Record<string, string>;
  meta?: Record<string, unknown>;
};

export type Speak = (parts: SpeakParts) => CallToolResult;

export type SpeakOptions = {
  strict: boolean;
  log: Log;
};

export function echoText(raw: string, maxChars = DEFAULT_ECHO_CHARS): string {
  const cleaned = raw
    .replace(new RegExp(URL_SOURCE, "gi"), "a link")
    .replace(new RegExp(EMOJI_SOURCE, "gu"), "")
    .replace(new RegExp(MARKUP_CHARS, "g"), " ")
    .replace(/\.{3}|…|[.!?]/g, ",")
    .replace(/\s+/g, " ")
    .replace(/(?:\s*,)+/g, ",")
    .replace(/^[\s,-]+|[\s,]+$/g, "");
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,]+$/, "");
}

function sentencesOf(text: string): Array<string> {
  return text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence !== "");
}

export function findViolation(text: string): ReplyRule | undefined {
  const sentences = sentencesOf(text);
  if (text.trim() === "") return "empty";
  if (sentences.length > MAX_SENTENCES) return "sentences";
  if (FORBIDDEN_MARKUP.test(text)) return "markup";
  if (EMOJI.test(text)) return "emoji";
  if (sentences.some((sentence) => sentence.split(/\s+/).length > MAX_WORDS_PER_SENTENCE)) return "sentence-length";
  if (text.split("?").length > 2) return "questions";
  return undefined;
}

export function hasBannedWord(text: string): boolean {
  return BANNED_PATTERN.test(text.replace(/[’]/g, "'"));
}

function render(template: string, echo: Record<string, string>): string {
  return template.replace(SLOT, (_match, key: string) => {
    const value = echo[key];
    if (value === undefined) throw new Error(`Missing echo slot: ${key}`);
    return echoText(value);
  });
}

/*
 * Strict mode (tests) throws so a bad template fails the build. Otherwise the
 * user hears a safe sentence and the broken rule is logged, never the text.
 */
export function createSpeak({ strict, log }: SpeakOptions): Speak {
  const checkedText = (parts: SpeakParts): string => {
    const text = render(parts.template, parts.echo ?? {});
    const violation = hasBannedWord(parts.template.replace(SLOT, " ")) ? "banned-word" : findViolation(text);
    if (violation === undefined) return text;
    if (strict) throw new Error(`Reply violates ${violation}`);
    log({ event: "reply_violation", ok: false, errClass: violation });
    return SAFE_REPLY;
  };

  return (parts) => {
    const result: CallToolResult = { content: [{ type: "text", text: checkedText(parts) }] };
    if (parts.meta !== undefined) result._meta = parts.meta;
    return result;
  };
}
