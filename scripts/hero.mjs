#!/usr/bin/env node

/**
 * Hero flow over real Streamable HTTP: task -> first step -> done -> next step -> wins.
 * Usage: npm run hero            (mock AI, no AWS needed)
 *        npm run hero -- --bedrock   (real Bedrock; reads AWS settings from the shell or .env)
 *
 * The server runs on a free port with an in-memory database from a scratch
 * directory, so your .env and your real data are never touched. Exits 1 if any
 * reply is wrong, or if --bedrock was asked for and the model's answer was not used.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENTRY = fileURLToPath(new URL("../build/index.js", import.meta.url));
const ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));
const STARTUP_MS = 10_000;
const bedrock = process.argv.includes("--bedrock");

const STEPS = [
  { tool: "break_down_task", args: { task: "I need to clean the kitchen" }, expect: /^Okay\. First tiny step: / },
  { tool: "complete_step", args: {}, expect: /^Nice\. Next tiny step: / },
  { tool: "next_step", args: {}, expect: /^Next tiny step: / },
  { tool: "my_wins", args: {}, expect: /^Today you: / },
];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function serverEnv(port) {
  if (bedrock && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const env = {
    ...process.env,
    STARTER_TRANSPORT: "http",
    PORT: String(port),
    SIDEKICK_HOST: "127.0.0.1",
    SIDEKICK_DB_PATH: ":memory:",
  };
  if (bedrock) delete env.SIDEKICK_MOCK_AI;
  else env.SIDEKICK_MOCK_AI = "1";
  return env;
}

function startServer(port, cwd) {
  const child = spawn("node", [ENTRY], { cwd, env: serverEnv(port) });
  let stderr = "";
  const listening = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start: ${stderr}`)), STARTUP_MS);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes('"event":"listening"')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${stderr}`));
    });
  });
  return { child, listening };
}

async function run(port) {
  const client = new Client({ name: "hero", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  const problems = [];
  try {
    for (const { tool, args, expect } of STEPS) {
      const result = await client.callTool({ name: tool, arguments: args });
      const text = result.content[0]?.text ?? "";
      const source = result._meta?.source;
      const note = source === undefined ? "" : `  [source: ${source}, ${result._meta.latencyMs} ms]`;
      console.log(`${tool.padEnd(16)} ${text}${note}`);
      if (result.isError === true || !expect.test(text)) problems.push(`${tool}: unexpected reply`);
      if (tool === "break_down_task" && bedrock && source !== "ai") {
        problems.push(`break_down_task: expected source "ai" from Bedrock but got "${source}"`);
      }
    }
  } finally {
    await client.close();
  }
  return problems;
}

async function main() {
  if (!existsSync(ENTRY)) throw new Error("build/index.js is missing. Run `npm run build` first.");
  const started = performance.now();
  const scratch = mkdtempSync(join(tmpdir(), "sidekick-hero-"));
  const port = await freePort();
  const server = startServer(port, scratch);
  let problems = [];
  try {
    await server.listening;
    problems = await run(port);
  } finally {
    server.child.removeAllListeners("exit");
    server.child.kill();
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`\n${bedrock ? "bedrock" : "mock"} mode, ${((performance.now() - started) / 1000).toFixed(1)} s`);
  if (problems.length > 0) throw new Error(problems.join("; "));
}

main().catch((error) => {
  console.error(`hero flow failed: ${error.message}`);
  process.exit(1);
});
