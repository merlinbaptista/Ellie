import type { DriverDecision } from "../../config/drivers.js";
import type { LlmAdapter } from "./types.js";
import { MockLlm } from "./mock.js";

export function createLlm(decision: DriverDecision): LlmAdapter {
  void decision;
  return new MockLlm();
}
