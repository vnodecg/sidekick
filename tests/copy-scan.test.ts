import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { CORE_BANNED_WORDS, EXTENDED_BANNED_WORDS } from "../src/core/lexicon.js";

const SRC = new URL("../src/", import.meta.url);

/*
 * Files whose string literals can reach the user's ears. lexicon.ts is left out
 * because it holds the banned list itself; the AI prompt is covered by its own tests.
 */
const SPOKEN_SOURCES = [
  "tools",
  "repos",
  "web/public",
  "core/reply.ts",
  "core/safety.ts",
  "core/spoken.ts",
  "core/suggest.ts",
  "core/timewords.ts",
  "core/unblockers.ts",
  "ai/fallback.ts",
  "ai/mock.ts",
];

const BANNED = [...CORE_BANNED_WORDS, ...EXTENDED_BANNED_WORDS].map((word) => word.replace(/\s+/g, "\\s+"));
const VOICE_GUIDE = ["simply", "you should", "you need to", "just(?! now)"];
const RULES = new RegExp(`\\b(?:${[...BANNED, ...VOICE_GUIDE].join("|")})\\b`, "i");

function sourceFiles(entry: string): Array<URL> {
  const url = new URL(entry, SRC);
  if (entry.endsWith(".ts")) return [url];
  return readdirSync(url)
    .filter((file) => /\.(?:ts|js)$/.test(file))
    .map((file) => new URL(`${entry}/${file}`, SRC));
}

/*
 * `description:` values and `.describe()` arguments talk to the model, not the
 * user, and legitimately quote the words a user might say ("feels behind").
 */
function isForModel(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text === "description";
  return ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "describe";
}

function spokenStrings(file: URL): Array<string> {
  const source = ts.createSourceFile(fileURLToPath(file), readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  const found: Array<string> = [];
  const visit = (node: ts.Node): void => {
    const isText = ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    if (isText && !isForModel(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("copy scan of spoken strings (TC-062)", () => {
  const strings = SPOKEN_SOURCES.flatMap(sourceFiles).flatMap(spokenStrings);

  it("reads a meaningful amount of copy", () => {
    assert.ok(strings.length > 100, String(strings.length));
    assert.ok(strings.includes("Fresh start. Nothing is held against you. Want to pick one tiny thing?"));
  });

  it("uses no banned word or discouraged phrase (SAFETY-COPY §2, §5)", () => {
    const offenders = strings.filter((text) => RULES.test(text));
    assert.deepStrictEqual(offenders, []);
  });
});
