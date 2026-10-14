/**
 * @typedef {{ hasActiveTask: boolean, pendingDelete: boolean }} RouterState
 * @typedef {{ tool: string, args: Record<string, unknown>, pattern: string }} Route
 */

const MAX_OPTIONS = 10;
const BARE_CHOICE_MAX_WORDS = 8;
const FALLBACK_TASK_MIN_WORDS = 4;

const ENERGY_WORDS = {
  low: "low",
  tired: "low",
  exhausted: "low",
  drained: "low",
  medium: "medium",
  high: "high",
  wired: "high",
};

const clean = (utterance) =>
  utterance
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?,;:\s]+$/, "");

const withText = (key, text) => (text === "" ? {} : { [key]: text });

const stripLead = (text) => text.replace(/^(?:with|on|to|about)\s+/i, "").trim();

const splitOptions = (text) =>
  text
    .split(/,|\bor\b/i)
    .map((option) => option.trim())
    .filter((option) => option !== "");

const withOptions = (text) => {
  const options = splitOptions(text.replace(/^(?:between|from)\s+/i, ""));
  return options.length >= 2 ? { options: options.slice(0, MAX_OPTIONS) } : {};
};

const MINUTES = /(?:^|\s)(?:for\s+)?(\d+)\s*min(?:ute)?s?\b/i;

const minutesOf = (text) => {
  const found = MINUTES.exec(text);
  return found === null ? {} : { minutes: Number(found[1]) };
};

const energyOf = (text) => {
  const word = /\b(low|medium|high|tired|wired|exhausted|drained)\b/i.exec(text);
  return { energy: ENERGY_WORDS[word === null ? "medium" : word[1].toLowerCase()] };
};

const wordCount = (text) => text.split(" ").length;

/*
 * First match wins, so order carries meaning: narrow phrases ("i'm done working")
 * sit above broad ones ("done"), and the task openers sit below everything that
 * can contain "need to" or "break". Table: docs/specs/PROTOCOL.md section 6.
 */
const RULES = [
  { id: "confirm-delete", tool: "delete_my_data", pattern: /^(?:yes|yeah|yep|confirm|do it)\b/i, when: (state) => state.pendingDelete, args: () => ({ confirm: true }) },
  { id: "delete-data", tool: "delete_my_data", pattern: /\b(?:delete|erase|wipe)\b.*\b(?:data|everything)\b/i },
  { id: "fresh-start", tool: "gentle_reset", pattern: /\b(?:fresh start|bad day|start over|i'?m behind|feel behind)\b/i },
  { id: "stuck", tool: "im_stuck", pattern: /\b(?:stuck|frozen|can'?t move)\b/i },
  { id: "end-focus", tool: "end_focus", pattern: /\b(?:i'?m done working|stop the timer|stop (?:the )?focus|end (?:the )?focus)\b/i },
  {
    id: "start-focus",
    tool: "start_focus",
    pattern: /^(?:start(?:ing)?|begin)\s+(?:a\s+)?(?:focus|timer|work(?:ing)?\s+on\b)\s*(.*)$/i,
    args: (match) => ({ ...withText("label", stripLead(match[1].replace(MINUTES, ""))), ...minutesOf(match[1]) }),
  },
  { id: "time-check", tool: "time_check", pattern: /\b(?:how long|time check|how much time)\b/i },
  { id: "where-was-i", tool: "where_was_i", pattern: /\bwhere (?:was i|did i leave off)\b/i },
  {
    id: "park",
    tool: "park_my_place",
    pattern: /^(?:park(?: my place)?|i'?ll be right back|brb)\b[\s,:-]*(.*)$/i,
    args: (match) => withText("note", match[1]),
  },
  { id: "read-dump", tool: "sort_dump", pattern: /\b(?:what did i save|read my (?:brain )?dump|my brain dump|read my notes)\b/i },
  {
    id: "brain-dump",
    tool: "brain_dump",
    pattern: /^(?:remember(?: to)?|note(?: that| to)?|brain dump|dump)\b[\s,:-]*(.*)$/i,
    args: (match) => withText("thought", match[1]),
  },
  { id: "my-wins", tool: "my_wins", pattern: /\b(?:my wins|what have i (?:done|accomplished)|what did i do)\b/i },
  {
    id: "log-win",
    tool: "log_win",
    pattern: /^(?:i did(?! it\b)|i just|log (?:a )?win)\b[\s,:-]*(.*)$/i,
    args: (match) => withText("text", match[1]),
  },
  { id: "next-step", tool: "next_step", pattern: /\b(?:what'?s next|next step|what next|what do i do next)\b/i },
  {
    id: "complete-step",
    tool: "complete_step",
    pattern: /^(?:(?:i'?m )?(?:all )?(?:done|finished)(?: with (?:that|this|it|the step))?|(?:i )?did it|next)$/i,
    when: (state) => state.hasActiveTask,
  },
  { id: "dopamine", tool: "dopamine_menu", pattern: /\b(?:(?:need|want|take|give me) a (?:little |quick )?break|dopamine)\b|^break$/i },
  {
    id: "energy",
    tool: "match_energy",
    pattern: /\b(?:low|medium|high) energy\b|\benergy (?:is |level is )?(?:low|medium|high)\b|^i'?m (?:so |really |very )?(?:tired|exhausted|drained|wired)\b/i,
    args: (_match, text) => energyOf(text),
  },
  {
    id: "pick",
    tool: "pick_for_me",
    pattern: /\b(?:pick for me|choose for me|decide for me|you (?:choose|pick|decide))\b[\s,:-]*(.*)$/i,
    args: (match) => withOptions(match[1]),
  },
  { id: "what-now", tool: "what_now", pattern: /\b(?:what now|what should i do|what do i do now)\b/i },
  {
    id: "task-opener",
    tool: "break_down_task",
    pattern: /^(?:i can'?t start|i cannot start|i need to|i have to|i(?:'ve| have) got to|i gotta|help me|i want to|i should|i must)\b[\s,:-]*(.*)$/i,
    args: (match) => withText("task", stripLead(match[1])),
  },
  {
    id: "bare-choice",
    tool: "pick_for_me",
    pattern: /^[^,]+? or .+$/i,
    when: (_state, text) => wordCount(text) <= BARE_CHOICE_MAX_WORDS,
    args: (_match, text) => withOptions(text),
  },
];

/**
 * Maps one utterance to one MCP tool call. Pure and deterministic: no LLM, no I/O.
 * @param {string} utterance
 * @param {RouterState} state
 * @returns {Route}
 */
export function route(utterance, state) {
  const text = clean(utterance);
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match !== null && (rule.when ?? (() => true))(state, text)) {
      return { tool: rule.tool, args: (rule.args ?? (() => ({})))(match, text), pattern: rule.id };
    }
  }
  if (!state.hasActiveTask && wordCount(text) >= FALLBACK_TASK_MIN_WORDS) {
    return { tool: "break_down_task", args: { task: text }, pattern: "fallback-task" };
  }
  return { tool: "what_now", args: {}, pattern: "fallback" };
}
