import { describe, expect, it } from "vitest";
import { addHousehold, createTestContext } from "./helpers.js";
import { recordConsent, canSend, consentHistory } from "../src/privacy/consent.js";
import { sendToPhone } from "../src/domain/sendToPhone.js";
import { seedDemo } from "../src/seed/seed.js";

describe("privacy consent", () => {
  it("records and orders consent, then withdrawal immediately blocks a phone send", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    await recordConsent(ctx, { householdId: "demo-blr", purpose: "phone_messages", action: "withdrawn", source: "voice", channel: "+919000000001" });
    expect(await canSend(ctx, "demo-blr", "phone_messages")).toBe(false);
    const history = await consentHistory(ctx, "demo-blr");
    expect(history.at(-1)?.action).toBe("withdrawn");
    expect(JSON.stringify(history)).not.toContain("+919000000001");
    const result = await sendToPhone(ctx, { householdId: "demo-blr", contentType: "summary" });
    expect(result.followUp).toBeUndefined();
    expect(result.speech).toContain("withdrew consent");
  });

  it("requires confirmation before recording a grant", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_consent-home");
    expect(await canSend(ctx, "hh_consent-home", "phone_messages")).toBe(false);
  });
});
