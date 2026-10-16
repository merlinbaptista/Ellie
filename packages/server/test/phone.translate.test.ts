import { describe, expect, it, vi } from "vitest";
import { signPhoneLink } from "../src/links/sign.js";
import { translatePhoneView } from "../src/phone/translate.js";
import { diagnose } from "../src/domain/diagnose.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";

describe("phone view translation", () => {
  it("labels mock output honestly and never translates safety text", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const booking = signPhoneLink({ householdId: "demo-blr", kind: "booking", ref: "itm_seed-blr-lpg", env: ctx.env }).payload;
    const untranslated = await translatePhoneView(ctx, booking, "kn");
    expect(untranslated.translated).toEqual({ to: "kn-IN", by: "none", complete: false });
    const diagnosis = await diagnose(ctx, { householdId: "demo-blr", item: "gas", symptom: "I can smell gas" });
    const safety = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: diagnosis.diagnosis.diagnosisId, env: ctx.env }).payload;
    const complete = vi.fn();
    (ctx as unknown as { llm: { name: string; complete: typeof complete } }).llm = { name: "bedrock", complete };
    const safetyView = await translatePhoneView(ctx, safety, "hi");
    expect(safetyView.sections[0]?.tone).toBe("safety");
    expect(complete).not.toHaveBeenCalled();
  });

  it("protects URLs, dates and item names, restores placeholders, and caches successful translations", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const signed = signPhoneLink({ householdId: "demo-blr", kind: "booking", ref: "itm_seed-blr-lpg", env: ctx.env }).payload;
    let callCount = 0;
    let modelInput = "";
    (ctx as unknown as { llm: { name: string; complete: (request: { messages: Array<{ content: string }> }) => Promise<{ text: string; model: string; latencyMs: number; mock: boolean }> } }).llm = {
      name: "bedrock",
      complete: async (request) => {
        callCount++;
        modelInput = request.messages[0]!.content;
        const input = JSON.parse(request.messages[0]!.content) as { fields: Array<{ path: string; text: string }> };
        return { text: JSON.stringify({ fields: input.fields.map((field) => ({ ...field, text: `Traducido ${field.text}` })) }), model: "unit-test", latencyMs: 1, mock: false };
      },
    };
    const first = await translatePhoneView(ctx, signed, "es");
    expect(first.translated).toEqual({ to: "es-ES", by: "llm", complete: true });
    expect(first.actions[0]?.url).toBe("https://wa.me/917588888824?text=REFILL");
    expect(JSON.stringify(first)).toContain("Indane");
    expect(modelInput).not.toContain("Indane");
    expect(modelInput).not.toContain("gas cylinder");
    await translatePhoneView(ctx, signed, "es");
    expect(callCount).toBe(1);
  });

  it("falls back to English if a required placeholder is missing", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const signed = signPhoneLink({ householdId: "demo-blr", kind: "booking", ref: "itm_seed-blr-lpg", env: ctx.env }).payload;
    (ctx as unknown as { llm: { name: string; complete: () => Promise<{ text: string; model: string; latencyMs: number; mock: boolean }> } }).llm = { name: "bedrock", complete: async () => ({ text: JSON.stringify({ fields: [] }), model: "test", latencyMs: 1, mock: false }) };
    const result = await translatePhoneView(ctx, signed, "es");
    expect(result.translated?.by).toBe("none");
    expect(result.title).toBe("Book gas cylinder");
  });
});
