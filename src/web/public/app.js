import { createMcpClient } from "./mcp-client.js";
import { route } from "./router.js";

const SLOW_REPLY_MS = 2000;
const SPEECH_RATE = 0.95;
const FAULT = "Sorry, I couldn't do that just now. Try me again in a moment.";
const UNREACHABLE = "I can't reach Sidekick right now.";
const SOURCE_LABELS = { ai: "bedrock", fallback: "fallback", mock: "mock" };
const FOCUS_ENDERS = new Set(["end_focus", "gentle_reset", "delete_my_data"]);

const $ = (id) => document.getElementById(id);
const hero = $("hero");
const mic = $("mic");
const mute = $("mute");
const typed = $("typed");
const input = $("utterance");
const note = $("speech-note");
const drawer = $("drawer");
const rows = $("trace-rows");
const clock = $("focus-clock");
const clockTime = $("focus-time");

const params = new URLSearchParams(location.search);
const debug = params.get("debug") === "1";
const client = createMcpClient();
const state = { hasActiveTask: false, pendingDelete: false };
const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

let muted = false;
let listening = false;
let busy = false;
let focusStartedAt;
let pendingPattern;
let recognition;

const setPressed = (button, pressed) => {
  button.setAttribute("aria-pressed", String(pressed));
};

const setState = (value) => {
  document.body.dataset.state = value;
};

const show = (text) => {
  hero.textContent = text;
  hero.classList.remove("fresh");
  void hero.offsetWidth;
  hero.classList.add("fresh");
};

const hasSynthesis = "speechSynthesis" in window;

const speak = (text) => {
  if (muted || !hasSynthesis) {
    setState("idle");
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = SPEECH_RATE;
  utterance.onend = () => setState("idle");
  utterance.onerror = () => setState("idle");
  setState("speaking");
  speechSynthesis.speak(utterance);
};

const pad = (value) => String(value).padStart(2, "0");

const tickClock = () => {
  if (focusStartedAt === undefined) {
    clock.hidden = true;
    return;
  }
  const seconds = Math.floor((Date.now() - focusStartedAt) / 1000);
  clockTime.textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  clock.hidden = false;
};

setInterval(tickClock, 1000);

const textOf = (result) => result.content.find((block) => block.type === "text")?.text ?? FAULT;

const followUp = (tool, args, result) => {
  const meta = result._meta ?? {};
  if (typeof meta.taskOpen === "boolean") state.hasActiveTask = meta.taskOpen;
  state.pendingDelete = tool === "delete_my_data" && args.confirm !== true;
  if (tool === "start_focus") focusStartedAt ??= Date.now();
  if (FOCUS_ENDERS.has(tool)) focusStartedAt = undefined;
  if (tool === "gentle_reset" || tool === "delete_my_data") state.hasActiveTask = false;
  tickClock();
};

const cell = (parent, text) => {
  const td = document.createElement("td");
  td.textContent = text;
  parent.append(td);
  return td;
};

const sourceChip = (source) => {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = SOURCE_LABELS[source] ?? source;
  return chip;
};

const addTraceRow = ({ method, tool, status, ms, request, response }, matched) => {
  const tr = document.createElement("tr");
  const call = cell(tr, "");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const label = tool === undefined ? method : `${method} ${tool}`;
  summary.textContent = debug && matched !== undefined && tool !== undefined ? `${label} (matched ${matched})` : label;
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify({ request, response }, null, 2);
  details.append(summary, pre);
  call.append(details);
  cell(tr, String(status));
  cell(tr, ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
  const source = response?.result?._meta?.source;
  const sourceCell = cell(tr, "");
  if (source !== undefined) sourceCell.append(sourceChip(source));
  rows.prepend(tr);
};

client.trace.addEventListener("trace", (event) => {
  addTraceRow(event.detail, pendingPattern);
});

const handle = async (utterance) => {
  const spoken = utterance.trim();
  if (spoken === "" || busy) return;
  busy = true;
  setState("thinking");
  const slow = setTimeout(() => {
    document.body.dataset.slow = "";
  }, SLOW_REPLY_MS);
  const { tool, args, pattern } = route(spoken, state);
  pendingPattern = pattern;
  let reply;
  try {
    const result = await client.callTool(tool, args);
    reply = result.isError === true ? FAULT : textOf(result);
    if (result.isError !== true) followUp(tool, args, result);
  } catch (error) {
    reply = error.status === 0 ? UNREACHABLE : FAULT;
  } finally {
    clearTimeout(slow);
    delete document.body.dataset.slow;
    pendingPattern = undefined;
    busy = false;
  }
  show(reply);
  speak(reply);
};

const stopListening = () => {
  listening = false;
  setPressed(mic, false);
  if (document.body.dataset.state === "listening") setState("idle");
};

const setupRecognition = () => {
  recognition = new SpeechRecognition();
  recognition.lang = navigator.language;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    void handle(event.results[0][0].transcript);
  };
  recognition.onend = stopListening;
  recognition.onerror = stopListening;
};

mic.addEventListener("click", () => {
  if (recognition === undefined) {
    input.focus();
    return;
  }
  if (listening) {
    recognition.stop();
    return;
  }
  if (hasSynthesis) speechSynthesis.cancel();
  listening = true;
  setPressed(mic, true);
  setState("listening");
  recognition.start();
});

mute.addEventListener("click", () => {
  muted = !muted;
  setPressed(mute, muted);
  mute.textContent = muted ? "Unmute" : "Mute";
  if (muted && hasSynthesis) speechSynthesis.cancel();
});

typed.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value;
  input.value = "";
  void handle(value);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== input) {
    event.preventDefault();
    input.focus();
  }
});

if (SpeechRecognition === undefined) {
  note.textContent = "Speech input isn't available in this browser, so type here instead.";
  mic.hidden = true;
  input.focus();
} else {
  setupRecognition();
}

drawer.open = debug;
void client.connect().catch(() => undefined);
