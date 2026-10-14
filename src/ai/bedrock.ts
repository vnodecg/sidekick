import { SUBMIT_TOOL, SYSTEM_PROMPT, userTurn } from "./prompt.js";
import type { AiClient } from "./types.js";
import type { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";

const MAX_TOKENS = 300;
const TEMPERATURE = 0.3;
const TOOL_CHOICE_ERROR = /toolChoice/i;

export type BedrockOptions = {
  region: string;
  modelId: string;
};

const SUBMIT_SCHEMA = {
  type: "object",
  properties: { steps: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } } },
  required: ["steps"],
};

function buildInput(options: BedrockOptions, task: string, forceTool: boolean): ConverseCommandInput {
  return {
    modelId: options.modelId,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [{ role: "user", content: [{ text: userTurn(task) }] }],
    inferenceConfig: { maxTokens: MAX_TOKENS, temperature: TEMPERATURE },
    toolConfig: {
      tools: [{ toolSpec: { name: SUBMIT_TOOL, description: "Submit the tiny steps for the task.", inputSchema: { json: SUBMIT_SCHEMA } } }],
      ...(forceTool ? { toolChoice: { tool: { name: SUBMIT_TOOL } } } : {}),
    },
  };
}

function extractPayload(output: ConverseCommandOutput): unknown {
  const blocks = output.output?.message?.content ?? [];
  const toolUse = blocks.find((block) => block.toolUse !== undefined)?.toolUse;
  if (toolUse !== undefined) return toolUse.input;
  return blocks.find((block) => block.text !== undefined)?.text;
}

/*
 * The AWS SDK is imported on first use so mock mode never loads it. Retries are
 * off (maxAttempts 1) so the budget in breakdown.ts is the only retry policy.
 */
export function createBedrockClient(options: BedrockOptions): AiClient {
  let sdk: Promise<{ client: BedrockRuntimeClient; converseCommand: typeof ConverseCommand }> | undefined;
  let forceTool = true;

  const load = (): NonNullable<typeof sdk> => {
    sdk ??= import("@aws-sdk/client-bedrock-runtime").then((mod) => ({
      client: new mod.BedrockRuntimeClient({ region: options.region, maxAttempts: 1 }),
      converseCommand: mod.ConverseCommand,
    }));
    return sdk;
  };

  const converse = async (task: string, signal: AbortSignal): Promise<ConverseCommandOutput> => {
    const { client, converseCommand } = await load();
    return client.send(new converseCommand(buildInput(options, task, forceTool)), { abortSignal: signal });
  };

  return {
    kind: "ai",
    model: options.modelId,
    async breakDown(task, signal) {
      try {
        return extractPayload(await converse(task, signal));
      } catch (error) {
        if (!forceTool || !(error instanceof Error) || error.name !== "ValidationException" || !TOOL_CHOICE_ERROR.test(error.message)) {
          throw error;
        }
        forceTool = false;
        return extractPayload(await converse(task, signal));
      }
    },
  };
}
