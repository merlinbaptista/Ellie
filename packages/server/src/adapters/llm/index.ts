import type { Logger } from "pino";
import type { DriverDecision } from "../../config/drivers.js";
import type { Env } from "../../config/env.js";
import type { LlmAdapter } from "./types.js";
import { MockLlm } from "./mock.js";
import { BedrockLlm } from "./bedrock.js";

export function createLlm(decision: DriverDecision, env: Env, logger: Logger): LlmAdapter {
  if (decision.implementation === "bedrock" && env.BEDROCK_MODEL_ID) return new BedrockLlm(env, logger);
  return new MockLlm();
}
