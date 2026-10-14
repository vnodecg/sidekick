import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getAvailablePort } from "./port-utils.js";
import type { ChildProcess } from "node:child_process";

const ENTRY = fileURLToPath(new URL("../../build/index.js", import.meta.url));
const STARTUP_MS = 10_000;

export type BuiltServer = {
  baseUrl: string;
  port: number;
  stderr: () => string;
  exited: Promise<number | null>;
  stop: () => Promise<number | null>;
};

export type BuiltOptions = {
  port?: number;
  dbPath?: string;
  env?: Record<string, string>;
};

function waitForListening(child: ChildProcess, stderr: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server did not start: ${stderr()}`));
    }, STARTUP_MS);
    const settle = (error?: Error): void => {
      clearTimeout(timer);
      if (error === undefined) resolve();
      else reject(error);
    };
    child.stderr?.on("data", () => {
      if (stderr().includes('"event":"listening"')) settle();
    });
    child.once("exit", (code) => {
      settle(new Error(`server exited with ${String(code)} before listening: ${stderr()}`));
    });
  });
}

export async function startBuilt(options: BuiltOptions = {}): Promise<BuiltServer> {
  const port = options.port ?? (await getAvailablePort());
  const child = spawn("node", [ENTRY], {
    cwd: fileURLToPath(new URL("../fixtures", import.meta.url)),
    env: {
      PATH: process.env.PATH,
      STARTER_TRANSPORT: "http",
      PORT: String(port),
      SIDEKICK_MOCK_AI: "1",
      SIDEKICK_DB_PATH: options.dbPath ?? ":memory:",
      NODE_ENV: "test",
      ...options.env,
    },
  });
  let captured = "";
  child.stderr.on("data", (chunk: Buffer) => {
    captured += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", resolve);
  });
  await waitForListening(child, () => captured);
  return {
    baseUrl: `http://127.0.0.1:${String(port)}`,
    port,
    stderr: () => captured,
    exited,
    stop: () => {
      child.kill("SIGTERM");
      return exited;
    },
  };
}
