import { describe, expect, it } from "vitest";
import { diagnose } from "../src/domain/diagnose.js";
import { addHousehold, createTestContext } from "./helpers.js";

describe("diagnosis follow-up flow", () => {
  it("asks once, applies the answer, and logs the symptom only once", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await addHousehold(ctx, "hh_followup-1", "IN");
    const first = await diagnose(ctx, { householdId: "hh_followup-1", item: "purifier", symptom: "beeping" });
    expect(first.diagnosis.status).toBe("needs_answer");
    expect(first.followUp?.field).toBe("answer");
    expect(first.diagnosis.pendingQuestionId).toBe("tank_full_light");
    const second = await diagnose(ctx, { householdId: "hh_followup-1", item: "purifier", symptom: "beeping", diagnosisId: first.diagnosis.diagnosisId, answer: "yes" });
    expect(second.diagnosis.status).toBe("diagnosed");
    expect(second.diagnosis.answers).toEqual({ tank_full_light: "yes" });
    expect(second.diagnosis.candidates[0]?.causeKey).toBe("tank_full_sensor");
    expect(second.followUp).toBeUndefined();
    const symptoms = await ctx.repositories.events.list("hh_followup-1", first.item.itemId);
    expect(symptoms.filter((event) => event.type === "symptom")).toHaveLength(1);
  });
});
