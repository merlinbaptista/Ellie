import { describe, expect, it } from "vitest";
import { createBuiltInRegistry } from "@ellie/schema";
import { buildCandidates } from "../src/diagnosis/candidates.js";
import { pickQuestion } from "../src/diagnosis/questions.js";

describe("diagnosis question selection", () => {
  it("asks the question that can change the leading cause and stops when confident", () => {
    const purifier = createBuiltInRegistry().get("IN").catalog.ro_purifier!;
    const symptom = purifier.symptoms.find((entry) => entry.key === "beeping")!;
    const candidates = buildCandidates(symptom, purifier, [{ evidenceId: "ev_no_history", kind: "no_history", text: "No history for this item yet", weight: 0, causeKeys: [] }]);
    expect(pickQuestion(symptom, candidates, {}, [], "itm_question-1", 0)?.id).toBe("tank_full_light");
    const confident = candidates.map((candidate, index) => ({ ...candidate, score: index === 0 ? 0.82 : 0.3 }));
    expect(pickQuestion(symptom, confident, {}, [], "itm_question-1", 0)).toBeNull();
    expect(pickQuestion(symptom, candidates, {}, ["itm_question-1:diag:tank_full_light", "itm_question-1:diag:water_flowing"], "itm_question-1", 0)).toBeNull();
    expect(pickQuestion(symptom, candidates, {}, [], "itm_question-1", 2)).toBeNull();
  });
});
