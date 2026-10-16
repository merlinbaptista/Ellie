import { describe, expect, it } from "vitest";
import { addHousehold, createTestContext } from "./helpers.js";
import { Item } from "@ellie/schema";
import { seedDemo } from "../src/seed/seed.js";
import { signPhoneLink } from "../src/links/sign.js";
import { buildPhoneView } from "../src/phone/views.js";
import { renderPhonePage } from "../src/phone/fallbackPage.js";
import { diagnose } from "../src/domain/diagnose.js";

describe("phone views and fallback page", () => {
  it("builds a booking guide with provider instructions and actions", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const signed = signPhoneLink({ householdId: "demo-blr", kind: "booking", ref: "itm_seed-blr-lpg", env: ctx.env });
    const view = await buildPhoneView(ctx, signed.payload);
    expect(view.sections.find((section) => section.heading === "How")?.body).toContain("registered with Indane");
    expect(view.actions.find((action) => action.id === "book")?.url).toBe("https://wa.me/917588888824?text=REFILL");
    expect(view.actions.some((action) => action.id === "booked" && action.method === "post")).toBe(true);
  });

  it("renders escaped content, no-store headers are handled by routes, and forms carry only the token", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_phone-1", "IN");
    const item = Item.parse({ schemaVersion: 1, householdId: "hh_phone-1", itemId: "itm_phone-1", catalogKey: "custom", kind: "custom", name: "<img src=x onerror=alert(1)>", active: true, createdAt: ctx.clock.now().toISOString(), updatedAt: ctx.clock.now().toISOString() });
    await ctx.repositories.items.put(item);
    const signed = signPhoneLink({ householdId: "hh_phone-1", kind: "summary", env: ctx.env });
    const html = renderPhonePage({ kind: "summary", title: "<script>alert(1)</script>", language: "en-IN", sections: [{ heading: "<b>unsafe</b>", ordered: false, tone: "normal" }], actions: [{ id: "fixed", label: "Fixed", method: "post" }], expiresAt: signed.expiresAt, generatedAt: ctx.clock.now().toISOString() }, signed.token);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("name=\"t\"");
  });

  it("includes cited diagnosis history in the fix guide", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const result = await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping again" });
    const signed = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: result.diagnosis.diagnosisId, env: ctx.env });
    const view = await buildPhoneView(ctx, signed.payload);
    const likely = view.sections.find((section) => section.heading === "What's likely wrong")?.body ?? "";
    expect(likely).toContain("overdue");
    expect(likely).toContain("resolved");
  });

  it("keeps a safety phone guide to the stop section and the category emergency number", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_phone-safety", "IN");
    const result = await diagnose(ctx, { householdId: "hh_phone-safety", item: "gas", symptom: "I can smell gas" });
    const signed = signPhoneLink({ householdId: "hh_phone-safety", kind: "fix", ref: result.diagnosis.diagnosisId, env: ctx.env });
    const view = await buildPhoneView(ctx, signed.payload);
    expect(view.sections.map((section) => section.heading)).toEqual(["Safety"]);
    expect(view.actions).toContainEqual({ id: "call", label: "Call emergency services", url: "tel:1906", method: "link" });
  });
});
