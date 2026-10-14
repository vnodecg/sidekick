import { echoText } from "./reply.js";

const MAX_ITEM_CHARS = 60;
const MAX_LIST_WORDS = 30;
const NOTHING_READABLE = "a few things";

export type SpokenList = {
  template: string;
  echo: Record<string, string>;
};

const wordsIn = (text: string): number => text.split(/\s+/).length;

/*
 * One spoken sentence has a hard word limit, so a list keeps whole items until
 * the word budget is spent (always at least one) and counts the rest as "and N more".
 * Each item gets its own echo slot so it is sanitised like any other echoed text.
 */
export function spokenList(items: ReadonlyArray<string>, total = items.length): SpokenList {
  const kept: Array<string> = [];
  let words = 0;
  for (const item of items.map((raw) => echoText(raw, MAX_ITEM_CHARS)).filter((text) => text !== "")) {
    words += wordsIn(item);
    if (kept.length > 0 && words > MAX_LIST_WORDS) break;
    kept.push(item);
  }
  if (kept.length === 0) return { template: NOTHING_READABLE, echo: {} };
  const slots = kept.map((_item, index) => `{i${String(index)}}`).join(", ");
  const hidden = total - kept.length;
  return {
    template: hidden > 0 ? `${slots} and ${String(hidden)} more` : slots.replace(/, (\{i\d+\})$/, " and $1"),
    echo: Object.fromEntries(kept.map((item, index) => [`i${String(index)}`, item])),
  };
}
