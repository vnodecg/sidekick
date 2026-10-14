import { readFileSync } from "node:fs";
import { z } from "zod";

const DEFAULT_PORT = 3000;
const DEFAULT_AI_TIMEOUT_MS = 2500;
const DEFAULT_AI_BUDGET_MS = 4500;

const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const positiveInt = (fallback: number): z.ZodDefault<z.ZodNumber> =>
  z.coerce.number().int().positive().default(fallback);

const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    STARTER_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
    PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
    SIDEKICK_HOST: z.string().min(1).default("127.0.0.1"),
    SIDEKICK_DB_PATH: z.string().min(1).default("./data/sidekick.db"),
    SIDEKICK_TZ: z.string().refine(isTimeZone, "must be an IANA time zone such as Europe/London").default(systemTimeZone),
    SIDEKICK_MOCK_AI: z.enum(["1"]).optional(),
    AWS_REGION: z.string().min(1).optional(),
    SIDEKICK_BEDROCK_MODEL_ID: z.string().min(1).optional(),
    SIDEKICK_AI_TIMEOUT_MS: positiveInt(DEFAULT_AI_TIMEOUT_MS),
    SIDEKICK_AI_BUDGET_MS: positiveInt(DEFAULT_AI_BUDGET_MS),
    SIDEKICK_ALLOWED_ORIGINS: z.string().default(""),
    SIDEKICK_AUTH_TOKEN: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.SIDEKICK_MOCK_AI !== undefined) return;
    for (const key of ["AWS_REGION", "SIDEKICK_BEDROCK_MODEL_ID"] as const) {
      if (env[key] === undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: "required unless SIDEKICK_MOCK_AI=1" });
      }
    }
  });

export type Config = {
  transport: "stdio" | "http";
  port: number;
  host: string;
  dbPath: string;
  timeZone: string;
  mockAi: boolean;
  strictReplies: boolean;
  awsRegion: string | undefined;
  bedrockModelId: string | undefined;
  aiTimeoutMs: number;
  aiBudgetMs: number;
  allowedOrigins: Array<string>;
  authToken: string | undefined;
  version: string;
};

const packageSchema = z.object({ version: z.string().min(1) });

function readVersion(): string {
  const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  return packageSchema.parse(JSON.parse(raw)).version;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration. ${problems.join("; ")}`);
  }
  const values = parsed.data;
  return {
    transport: values.STARTER_TRANSPORT,
    port: values.PORT,
    host: values.SIDEKICK_HOST,
    dbPath: values.SIDEKICK_DB_PATH,
    timeZone: values.SIDEKICK_TZ,
    mockAi: values.SIDEKICK_MOCK_AI !== undefined,
    strictReplies: values.NODE_ENV === "test",
    awsRegion: values.AWS_REGION,
    bedrockModelId: values.SIDEKICK_BEDROCK_MODEL_ID,
    aiTimeoutMs: values.SIDEKICK_AI_TIMEOUT_MS,
    aiBudgetMs: values.SIDEKICK_AI_BUDGET_MS,
    allowedOrigins: values.SIDEKICK_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter((origin) => origin !== ""),
    authToken: values.SIDEKICK_AUTH_TOKEN,
    version: readVersion(),
  };
}
