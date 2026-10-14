import assert from "node:assert";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

const MOCK = { SIDEKICK_MOCK_AI: "1" };

describe("loadConfig", () => {
  it("applies defaults in mock mode", () => {
    const config = loadConfig(MOCK);
    assert.strictEqual(config.transport, "stdio");
    assert.strictEqual(config.port, 3000);
    assert.strictEqual(config.host, "127.0.0.1");
    assert.strictEqual(config.dbPath, "./data/sidekick.db");
    assert.strictEqual(config.aiTimeoutMs, 2500);
    assert.strictEqual(config.aiBudgetMs, 4500);
    assert.strictEqual(config.mockAi, true);
    assert.strictEqual(config.strictReplies, false);
    assert.deepStrictEqual(config.allowedOrigins, []);
    assert.strictEqual(config.authToken, undefined);
    assert.match(config.version, /^\d+\.\d+\.\d+/);
  });

  it("turns on strict replies only for NODE_ENV=test", () => {
    assert.strictEqual(loadConfig({ ...MOCK, NODE_ENV: "test" }).strictReplies, true);
    assert.strictEqual(loadConfig({ ...MOCK, NODE_ENV: "production" }).strictReplies, false);
  });

  it("reads overrides and splits the origin list", () => {
    const config = loadConfig({
      ...MOCK,
      STARTER_TRANSPORT: "http",
      PORT: "4100",
      SIDEKICK_TZ: "Asia/Kolkata",
      SIDEKICK_ALLOWED_ORIGINS: "https://a.example, https://b.example,",
    });
    assert.strictEqual(config.transport, "http");
    assert.strictEqual(config.port, 4100);
    assert.strictEqual(config.timeZone, "Asia/Kolkata");
    assert.deepStrictEqual(config.allowedOrigins, ["https://a.example", "https://b.example"]);
  });

  it("requires AWS settings unless mock AI is on", () => {
    assert.throws(() => loadConfig({}), /AWS_REGION: required unless SIDEKICK_MOCK_AI=1.*SIDEKICK_BEDROCK_MODEL_ID: required/);
    const config = loadConfig({ AWS_REGION: "us-east-1", SIDEKICK_BEDROCK_MODEL_ID: "model-x" });
    assert.strictEqual(config.mockAi, false);
    assert.strictEqual(config.bedrockModelId, "model-x");
  });

  it("rejects invalid values with a readable message", () => {
    assert.throws(() => loadConfig({ ...MOCK, PORT: "99999" }), /Invalid configuration.*PORT/);
    assert.throws(() => loadConfig({ ...MOCK, PORT: "abc" }), /PORT/);
    assert.throws(() => loadConfig({ ...MOCK, STARTER_TRANSPORT: "carrier-pigeon" }), /STARTER_TRANSPORT/);
    assert.throws(() => loadConfig({ ...MOCK, SIDEKICK_TZ: "Mars/Olympus" }), /SIDEKICK_TZ.*IANA/);
    assert.throws(() => loadConfig({ ...MOCK, SIDEKICK_MOCK_AI: "yes" }), /SIDEKICK_MOCK_AI/);
  });

  it("requires a token when the HTTP host is not loopback unless explicitly opened (NF10)", () => {
    const http = { ...MOCK, STARTER_TRANSPORT: "http" };
    assert.throws(() => loadConfig({ ...http, SIDEKICK_HOST: "0.0.0.0" }), /SIDEKICK_AUTH_TOKEN: required when SIDEKICK_HOST is not loopback/);
    assert.strictEqual(loadConfig({ ...http, SIDEKICK_HOST: "0.0.0.0", SIDEKICK_AUTH_TOKEN: "t" }).authToken, "t");
    assert.strictEqual(loadConfig({ ...http, SIDEKICK_HOST: "0.0.0.0", SIDEKICK_ALLOW_OPEN_BIND: "1" }).host, "0.0.0.0");
    for (const host of ["127.0.0.1", "localhost", "::1"]) assert.strictEqual(loadConfig({ ...http, SIDEKICK_HOST: host }).host, host);
    assert.strictEqual(loadConfig({ ...MOCK, SIDEKICK_HOST: "0.0.0.0" }).host, "0.0.0.0");
  });
});
