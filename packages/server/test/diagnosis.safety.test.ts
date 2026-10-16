import { describe, expect, it, vi } from "vitest";
import { checkSafety } from "../src/diagnosis/safety.js";
import { diagnose } from "../src/domain/diagnose.js";
import { addHousehold, createTestContext } from "./helpers.js";

describe("diagnosis safety gate", () => {
  it("detects all keyword categories and falls back to the general emergency number", async () => {
    const ctx = await createTestContext();
    const pack = ctx.regions.get("IN");
    const phrases = [
      ["I smell gas", "gas", "1906"],
      ["sparks from the socket", "electrical", "112"],
      ["water near socket", "water_near_power", "112"],
      ["there is a fire", "fire", "101"],
      ["carbon monoxide alarm", "carbon_monoxide", "112"],
    ] as const;
    for (const [phrase, category, number] of phrases) {
      const hit = checkSafety(phrase, undefined, pack);
      expect(hit?.category).toBe(category);
      expect(hit?.emergencyNumber).toBe(number);
      expect(hit?.message).toContain(number);
      if (category === "electrical" || category === "water_near_power") expect(hit?.message.toLowerCase()).toContain("switch off");
    }
  });

  it("short-circuits diagnosis before LLM and logs the safety symptom", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_safety-test", "IN");
    const complete = vi.fn(async () => { throw new Error("LLM must not run for safety"); });
    (ctx as unknown as { llm: { complete: typeof complete } }).llm = { complete };
    const result = await diagnose(ctx, { householdId: "hh_safety-test", item: "gas", symptom: "I can smell gas" });
    expect(result.diagnosis.status).toBe("safety_stop");
    expect(result.safety?.emergencyNumber).toBe("1906");
    expect(result.diagnosis.fixPlan).toBeUndefined();
    expect(complete).not.toHaveBeenCalled();
    expect((await ctx.repositories.events.list("hh_safety-test", result.item.itemId)).some((event) => event.type === "symptom")).toBe(true);
  });

  it("stops an unknown electrical item with the household general number", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_socket-test", "IN");
    const result = await diagnose(ctx, { householdId: "hh_socket-test", item: "socket in kitchen", symptom: "sparks" });
    expect(result.diagnosis.status).toBe("safety_stop");
    expect(result.safety?.emergencyNumber).toBe("112");
  });
});
