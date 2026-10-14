import assert from "node:assert";
import { describe, it } from "node:test";
import { CORE_BANNED_WORDS, EXTENDED_BANNED_WORDS } from "../../src/core/lexicon.js";
import { createSpeak, echoText, findViolation, hasBannedWord } from "../../src/core/reply.js";

const HOSTILE = [
  "**bold** and _italic_ and `code`",
  "line one.\nline two! Is it three? Yes. Four.",
  "# heading > quote | pipe [link](http://evil.example) {json}",
  "why is this so late...",
  "!!!",
  "\u{1F600} party \u{1F389}",
  "1. numbered\n- bulleted",
  "x".repeat(500),
  "see https://example.com/a?b=c and www.example.org now",
];

describe("echoText", () => {
  it("strips markdown, urls, emoji and newlines", () => {
    assert.strictEqual(echoText("**bold** `code` \u{1F600}\nnext"), "bold code next");
    assert.strictEqual(echoText("open https://example.com/x now"), "open a link now");
  });

  it("replaces sentence terminators so it cannot add sentences", () => {
    assert.strictEqual(echoText("wait... what? no! ok."), "wait, what, no, ok");
    assert.strictEqual(echoText("!!!"), "");
    assert.strictEqual(echoText("3.5 cups"), "3,5 cups");
  });

  it("drops leading dashes and truncates at a word boundary", () => {
    assert.strictEqual(echoText("- - first"), "first");
    assert.strictEqual(echoText("alpha beta gamma delta", 12), "alpha beta");
    assert.strictEqual(echoText("x".repeat(30), 10), "x".repeat(10));
  });

  it("is idempotent", () => {
    for (const input of HOSTILE) {
      const once = echoText(input);
      assert.strictEqual(echoText(once), once);
    }
  });
});

describe("findViolation", () => {
  it("accepts plain one to three sentence replies", () => {
    for (const text of ["Okay.", "Okay. First tiny step: put one cup in the sink.", "A. B? C!", "Is that right?", "Wait... go on."]) {
      assert.strictEqual(findViolation(text), undefined, text);
    }
  });

  it("reports the first broken rule", () => {
    assert.strictEqual(findViolation(""), "empty");
    assert.strictEqual(findViolation("One. Two. Three. Four."), "sentences");
    assert.strictEqual(findViolation("Use *bold*."), "markup");
    assert.strictEqual(findViolation("Line one.\nLine two."), "markup");
    assert.strictEqual(findViolation("- item"), "markup");
    assert.strictEqual(findViolation("1. item"), "markup");
    assert.strictEqual(findViolation("Go to https://x.example."), "markup");
    assert.strictEqual(findViolation("Nice \u{1F600}."), "emoji");
    assert.strictEqual(findViolation(`${"word ".repeat(41)}end.`), "sentence-length");
    assert.strictEqual(findViolation("Why? How?"), "questions");
  });
});

describe("hasBannedWord", () => {
  it("catches every banned word and phrase, any case", () => {
    for (const word of [...CORE_BANNED_WORDS, ...EXTENDED_BANNED_WORDS]) {
      assert.ok(hasBannedWord(`It is ${word.toUpperCase()} now`), word);
    }
    assert.ok(hasBannedWord("You SHOULDN’T have waited"));
    assert.ok(hasBannedWord("You should  have waited"));
  });

  it("matches whole words only", () => {
    for (const text of ["See you later", "the latest news", "a missile", "behind-the-scenes is fine? no", "Failsafe"]) {
      assert.strictEqual(hasBannedWord(text), text.startsWith("behind"), text);
    }
  });
});

const speak = createSpeak({ strict: true, log: () => undefined });

describe("speak", () => {
  it("fills slots with sanitised echo and returns one text block", () => {
    const result = speak({ template: "Okay. First tiny step: {step}.", echo: { step: "put a cup in the sink!" } });
    assert.deepStrictEqual(result, { content: [{ type: "text", text: "Okay. First tiny step: put a cup in the sink." }] });
  });

  it("passes meta through for the UI", () => {
    const result = speak({ template: "Okay.", meta: { source: "mock" } });
    assert.deepStrictEqual(result._meta, { source: "mock" });
  });

  it("does not censor echoed user words (AC2 applies to templates)", () => {
    const result = speak({ template: "Got it: {note}.", echo: { note: "email Sam, I am late" } });
    assert.strictEqual(result.content[0]?.type === "text" && result.content[0].text, "Got it: email Sam, I am late.");
  });

  it("keeps hostile echo within the AC1 rules (TC-061)", () => {
    for (const input of HOSTILE) {
      const result = speak({ template: "Got it. Saved: {note}.", echo: { note: input } });
      const block = result.content[0];
      assert.ok(block?.type === "text");
      assert.strictEqual(findViolation(block.text), undefined, input);
    }
  });

  it("throws on banned template words, bad structure and missing slots under test", () => {
    assert.throws(() => speak({ template: "You are late." }), /banned-word/);
    assert.throws(() => speak({ template: "One. Two. Three. Four." }), /sentences/);
    assert.throws(() => speak({ template: "Hello {who}." }), /Missing echo slot: who/);
  });

  it("falls back to a safe sentence and logs only the rule outside strict mode", () => {
    const logged: Array<string> = [];
    const lenient = createSpeak({ strict: false, log: (entry) => logged.push(JSON.stringify(entry)) });
    const result = lenient({ template: "You are late." });
    assert.deepStrictEqual(result.content, [{ type: "text", text: "Okay. I've got that." }]);
    assert.deepStrictEqual(logged, ['{"event":"reply_violation","ok":false,"errClass":"banned-word"}']);
  });
});
