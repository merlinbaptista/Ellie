import { afterAll, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockLlm } from "../src/adapters/llm/bedrock.js";
import { loadEnv } from "../src/config/env.js";
import { logger } from "../src/lib/logger.js";

const bedrockMock = mockClient(BedrockRuntimeClient);
afterAll(() => bedrockMock.restore());

describe("Bedrock Converse adapter", () => {
  it("maps system/messages, token settings, guardrail, JSON extraction and usage", async () => {
    bedrockMock.reset();
    bedrockMock.on(ConverseCommand).callsFake(async (input) => {
      expect(input.modelId).toBe("provider-profile-id");
      expect(input.system?.[0]?.text).toContain("Return only JSON.");
      expect(input.messages?.[0]?.content?.[0]?.text).toBe("Rank candidates");
      expect(input.guardrailConfig).toEqual({ guardrailIdentifier: "guard", guardrailVersion: "1" });
      return { output: { message: { content: [{ text: "```json\n{\"ok\":true}\n```" }] } }, usage: { inputTokens: 11, outputTokens: 7 } };
    });
    const env = loadEnv({ AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "provider-profile-id", BEDROCK_GUARDRAIL_ID: "guard", BEDROCK_GUARDRAIL_VERSION: "1" });
    const adapter = new BedrockLlm(env, logger);
    const result = await adapter.complete({ system: "diagnosis", messages: [{ role: "user", content: "Rank candidates" }], responseFormat: "json" });
    expect(result.text).toBe('{"ok":true}');
    expect(result.mock).toBe(false);
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
    adapter.close();
  });

  it("maps access denied to a voice-safe external error", async () => {
    bedrockMock.reset();
    bedrockMock.on(ConverseCommand).rejects(Object.assign(new Error("denied"), { name: "AccessDeniedException" }));
    const env = loadEnv({ AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "model" });
    const adapter = new BedrockLlm(env, logger);
    await expect(adapter.complete({ system: "x", messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ speech: "My explanation service is unavailable, so I'll use my household records." });
    adapter.close();
  });

  it("gives up on a slow model after BEDROCK_TIMEOUT_MS and lets the caller fall back deterministically", async () => {
    bedrockMock.reset();
    bedrockMock.on(ConverseCommand).callsFake(() => new Promise(() => undefined));
    const env = loadEnv({ AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "model", BEDROCK_TIMEOUT_MS: "60" });
    const warnings: string[] = [];
    const adapter = new BedrockLlm(env, { ...logger, warn: (_fields: unknown, message?: string) => { warnings.push(message ?? ""); } } as unknown as typeof logger);
    const started = Date.now();
    await expect(adapter.complete({ system: "x", messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({
      message: "Bedrock timed out after 60 ms",
      speech: "My explanation service is unavailable, so I'll use my household records.",
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(warnings).toContain("bedrock.timeout_fallback");
    adapter.close();
  });

  it("applies the same timeout to tool routing", async () => {
    bedrockMock.reset();
    bedrockMock.on(ConverseCommand).callsFake(() => new Promise(() => undefined));
    const env = loadEnv({ AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "model", BEDROCK_TIMEOUT_MS: "60" });
    const adapter = new BedrockLlm(env, logger);
    await expect(adapter.completeWithTools({ system: "x", messages: [{ role: "user", content: "x" }], tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }] })).rejects.toMatchObject({
      speech: "I couldn't route that request safely.",
    });
    adapter.close();
  });

  it("does not time out a fast model", async () => {
    bedrockMock.reset();
    bedrockMock.on(ConverseCommand).resolves({ output: { message: { content: [{ text: "fine" }] } } });
    const env = loadEnv({ AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "model", BEDROCK_TIMEOUT_MS: "500" });
    const adapter = new BedrockLlm(env, logger);
    await expect(adapter.complete({ system: "x", messages: [{ role: "user", content: "x" }] })).resolves.toMatchObject({ text: "fine" });
    adapter.close();
  });
});
