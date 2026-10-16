import { afterEach, describe, expect, it } from "vitest";
import { MockLlm, clearMockHandlers, registerMockHandler } from "../src/adapters/llm/mock.js";
import { validateLlmDiagnosis, rankDiagnosis } from "../src/diagnosis/llmRanker.js";
import { createTestContext } from "./helpers.js";
import type { Candidate, Evidence } from "@ellie/schema";

const candidates: Candidate[] = [
  { causeKey: "filter_overdue", description: "The sediment filter is overdue", diy: true, score: 0.8, evidenceIds: ["ev_overdue_sediment_filter"] },
  { causeKey: "sensor", description: "The tank sensor needs a reset", diy: true, score: 0.3, evidenceIds: ["ev_warranty"] },
];
const evidence: Evidence[] = [
  { evidenceId: "ev_overdue_sediment_filter", kind: "component_overdue", text: "Sediment filter is about 3 months overdue", weight: 0.45, causeKeys: ["filter_overdue"] },
  { evidenceId: "ev_warranty", kind: "warranty", text: "Warranty valid until 20 December 2026", weight: 0, causeKeys: [] },
];
afterEach(() => { clearMockHandlers(); MockLlm.testDelayMs = undefined; });

describe("diagnosis LLM constraints", () => {
  it("rejects invented causes and uncited dates, appends omitted valid candidates", () => {
    expect(() => validateLlmDiagnosis(JSON.stringify({ ranking: ["alien_interference"], explanation: "Unknown cause", citations: ["ev_warranty"] }), candidates, evidence)).toThrow(/invented_candidate/);
    expect(() => validateLlmDiagnosis(JSON.stringify({ ranking: ["filter_overdue"], explanation: "Warranty ends 5 January", citations: ["ev_warranty"] }), candidates, evidence)).toThrow(/uncited_fact/);
    const accepted = validateLlmDiagnosis(JSON.stringify({ ranking: ["filter_overdue"], explanation: "The filter is overdue by 3 months.", citations: ["ev_overdue_sediment_filter"] }), candidates, evidence);
    expect(accepted.ranking).toEqual(["filter_overdue", "sensor"]);
  });

  it("never includes household or contact details in the diagnosis prompt", async () => {
    const ctx = await createTestContext();
    let submittedPrompt = "";
    await registerMockHandler(() => true, (request) => {
      submittedPrompt = request.messages.at(-1)?.content ?? "";
      return JSON.stringify({ ranking: ["filter_overdue"], explanation: "The filter is overdue by 3 months.", citations: ["ev_overdue_sediment_filter"] });
    });
    const result = await rankDiagnosis({ ctx, householdId: "hh_private-1", item: "water purifier", symptomKey: "beeping", language: "en-IN", candidates, evidence });
    expect(result.source).toBe("llm");
    expect(submittedPrompt).not.toContain("hh_private-1");
    expect(submittedPrompt).not.toMatch(/@|\+?\d{7,}|en-IN/);
  });

  it("returns a deterministic answer within the voice deadline and refines in background on timeout", async () => {
    const ctx = await createTestContext();
    ctx.env.LLM_VOICE_TIMEOUT_MS = 20;
    ctx.env.LLM_BACKGROUND_TIMEOUT_MS = 2000;
    MockLlm.testDelayMs = 80;
    await registerMockHandler(() => true, () => JSON.stringify({ ranking: ["filter_overdue"], explanation: "The filter is overdue by 3 months.", citations: ["ev_overdue_sediment_filter"] }));
    const refined: string[] = [];
    const start = performance.now();
    const result = await rankDiagnosis({ ctx, householdId: "hh_timeout-1", item: "water purifier", symptomKey: "beeping", language: "en-IN", candidates, evidence, onBackgroundResult: (value) => { refined.push(value.explanation); } });
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.source).toBe("deterministic");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(refined.length).toBe(1);
  });
});
