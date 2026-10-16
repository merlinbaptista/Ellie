import { describe, expect, it } from "vitest";
import { diagnose } from "../src/domain/diagnose.js";
import { sendToPhone } from "../src/domain/sendToPhone.js";
import { addHousehold, createTestContext } from "./helpers.js";
import { seedDemo } from "../src/seed/seed.js";

describe("send_to_phone domain", () => {
  it("never sends without stored consent and resumes through setup_household", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_no_consent-1", "IN");
    const before = await ctx.notifier.listOutbox?.("hh_no_consent-1");
    const result = await sendToPhone(ctx, { householdId: "hh_no_consent-1", contentType: "summary" });
    expect(result.followUp?.field).toBe("phone");
    expect(result.followUp?.retry.tool).toBe("setup_household");
    expect(await ctx.notifier.listOutbox?.("hh_no_consent-1")).toEqual(before);
  });

  it("sends a signed link, records a note, and deduplicates repeat sends", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const first = await sendToPhone(ctx, { householdId: "demo-blr", item: "gas", contentType: "booking" });
    expect(first.data?.shortUrl).toContain("/l/");
    expect(first.data?.status).toBe("sent");
    expect(first.speech).toContain("ending 0001");
    expect(first.speech).toContain("WhatsApp");
    const second = await sendToPhone(ctx, { householdId: "demo-blr", item: "gas", contentType: "booking" });
    expect(second.speech).toContain("just sent");
    const notes = (await ctx.repositories.events.list("demo-blr", "itm_seed-blr-lpg")).filter((event) => event.type === "note");
    expect(notes).toHaveLength(1);
    const outbox = await ctx.notifier.listOutbox?.("demo-blr");
    expect(outbox?.[0]?.body).not.toContain("eyJ");
  });

  it("sends a diagnosis fix view by diagnosis ID", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const diagnosis = await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping" });
    if (diagnosis.followUp) {
      await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping", diagnosisId: diagnosis.diagnosis.diagnosisId, answer: "not sure" });
    }
    const saved = (await ctx.repositories.diagnoses.list("demo-blr")).find((entry) => entry.itemId === diagnosis.item.itemId && entry.status === "diagnosed")!;
    const result = await sendToPhone(ctx, { householdId: "demo-blr", item: "purifier", contentType: "fix", diagnosisId: saved.diagnosisId });
    expect(result.data?.shortUrl).toContain("/l/");
    expect(result.data?.status).toBe("sent");
  });
});
