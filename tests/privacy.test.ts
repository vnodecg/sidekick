import assert from "node:assert";
import { createServer } from "node:http2";
import { after, before, describe, it } from "node:test";
import { namedError } from "./helpers/ai.js";
import { argSets, startAllTools } from "./helpers/all-tools.js";
import { createBedrockClient } from "../src/ai/bedrock.js";
import { SYSTEM_PROMPT } from "../src/ai/prompt.js";
import { aiCalls } from "../src/db/schema.js";
import type { ToolSpec } from "./helpers/all-tools.js";
import type { Http2Server } from "node:http2";

const SECRET = "zxqvmarmalade";
const NON_CONTENT_COLUMNS = ["id", "user_id", "model", "attempt", "success", "error_class", "latency_ms", "created_at"];
const CONVERSE_REPLY = {
  output: { message: { role: "assistant", content: [{ toolUse: { toolUseId: "t1", name: "submit_steps", input: { steps: ["Stand up.", "Pick up one cup.", "Carry it over."] } } }] } },
  stopReason: "tool_use",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  metrics: { latencyMs: 1 },
};

const AWS_STUB_ENV = { AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_EC2_METADATA_DISABLED: "true" };

let specs: Array<ToolSpec> = [];

before(async () => {
  const tool = await startAllTools();
  specs = tool.specs;
  await tool.close();
});

describe("logs hold no user content (TC-066)", () => {
  it("stays clean across every tool, hostile and invalid input and a failing model", async () => {
    const tool = await startAllTools();
    const { ctx, lines } = tool.made;
    ctx.ai = {
      kind: "ai",
      model: "spy",
      breakDown: (task) => Promise.reject(namedError("ValidationException", `rejected: ${task}`)),
    };
    for (const spec of specs) {
      for (const args of argSets(spec, SECRET)) await tool.call(spec.name, args);
      for (const args of argSets(spec, `${SECRET} ${"x".repeat(600)}`)) await tool.call(spec.name, args);
    }
    await tool.call("break_down_task", { task: SECRET });
    assert.ok(lines.length > 0, "the run logged nothing, so the check proves nothing");
    assert.deepStrictEqual(lines.filter((line) => line.includes(SECRET)), []);
    await tool.close();
  });
});

describe("ai_calls holds no text (TC-068)", () => {
  it("has only metadata columns and no cell echoes the task", async () => {
    const tool = await startAllTools();
    await tool.call("break_down_task", { task: SECRET });
    tool.made.ctx.ai = { kind: "ai", model: "spy", breakDown: () => Promise.reject(namedError("ThrottlingException", SECRET)) };
    await tool.call("break_down_task", { task: `${SECRET} again` });
    const { db } = tool.made.ctx;
    const columns = db.$client.prepare("pragma table_info(ai_calls)").all().map((column) => String(column.name));
    assert.deepStrictEqual(columns, NON_CONTENT_COLUMNS);
    const rows = db.select().from(aiCalls).all();
    assert.ok(rows.length >= 3);
    assert.ok(!JSON.stringify(rows).includes(SECRET));
    await tool.close();
  });
});

/*
 * The real Bedrock client talks to a local HTTP/2 stand-in through the AWS SDK's
 * own endpoint override, so the bytes inspected are the bytes that would leave.
 */
describe("Bedrock request body (TC-067)", () => {
  const bodies: Array<string> = [];
  let stub: Http2Server | undefined;

  before(async () => {
    stub = createServer((req, res) => {
      const chunks: Array<Buffer> = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        bodies.push(Buffer.concat(chunks).toString("utf8"));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(CONVERSE_REPLY));
      });
    });
    await new Promise<void>((resolve) => stub?.listen(0, "127.0.0.1", resolve));
    const address = stub.address();
    assert.ok(address !== null && typeof address === "object");
    Object.assign(process.env, AWS_STUB_ENV, { AWS_ENDPOINT_URL_BEDROCK_RUNTIME: `http://127.0.0.1:${String(address.port)}` });
  });

  after(async () => {
    for (const key of [...Object.keys(AWS_STUB_ENV), "AWS_ENDPOINT_URL_BEDROCK_RUNTIME"]) Reflect.deleteProperty(process.env, key);
    await new Promise<void>((resolve) => stub?.close(() => {
      resolve();
    }));
  });

  it("contains the system prompt and the task and nothing else", async () => {
    const tool = await startAllTools();
    tool.made.ctx.ai = createBedrockClient({ region: "us-east-1", modelId: "test-model" });
    await tool.call("log_win", { text: "private win" });
    await tool.call("brain_dump", { thought: "private thought" });
    await tool.call("park_my_place", { note: "private place" });
    const reply = await tool.call("break_down_task", { task: SECRET });
    assert.strictEqual(reply.meta?.source, "ai");

    assert.strictEqual(bodies.length, 1);
    const body = JSON.parse(bodies[0] ?? "") as Record<string, unknown>;
    assert.deepStrictEqual(Object.keys(body).sort(), ["inferenceConfig", "messages", "system", "toolConfig"]);
    assert.deepStrictEqual(body.system, [{ text: SYSTEM_PROMPT }]);
    assert.deepStrictEqual(body.messages, [{ role: "user", content: [{ text: `<task>${SECRET}</task>` }] }]);
    for (const other of ["private win", "private thought", "private place", "default"]) {
      assert.ok(!(bodies[0] ?? "").includes(other), other);
    }
    await tool.close();
  });
});
