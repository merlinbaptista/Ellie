import { describe, expect, it } from "vitest";
import { ConsentRecord, DataInventory, ForgetReceipt, PrivacyExport } from "../src/privacy.js";

describe("privacy contracts", () => {
  it("validates a masked consent history record", () => {
    expect(ConsentRecord.safeParse({ schemaVersion: 1, householdId: "demo-blr", purpose: "phone_messages", action: "granted", channelMasked: "•••• 0001", source: "voice", at: "2026-10-16T03:00:00.000Z" }).success).toBe(true);
    expect(ConsentRecord.safeParse({ schemaVersion: 1, householdId: "demo-blr", purpose: "invalid", action: "granted", source: "voice", at: "2026-10-16T03:00:00.000Z" }).success).toBe(false);
  });

  it("rejects unmasked contacts in export profile through required record shape", () => {
    const inventory = DataInventory.parse({ householdId: "demo-blr", profile: { country: "IN", timeZone: "Asia/Kolkata", language: "en-IN" }, items: [], counts: { items: 0, events: 0, resolutions: 0, reminders: 0, outbox: 0, diagnoses: 0, links: 0, consentRecords: 0 }, consent: [], sharedWith: [], retention: [], generatedAt: "2026-10-16T03:00:00.000Z" });
    expect(ForgetReceipt.safeParse({ scope: "item", householdId: "demo-blr", itemId: "itm_purifier", deleted: { events: 1 }, externalCleanup: [], at: "2026-10-16T03:00:00.000Z" }).success).toBe(true);
    expect(PrivacyExport.parse({ profile: { contact: { phone: "•••• 0001" } }, items: [], events: [], predictions: [], resolutions: [], consent: [], inventory }).inventory.householdId).toBe("demo-blr");
  });
});
