import { describe, expect, it } from "vitest";
import { Household, missingHouseholdFields } from "../src/household.js";
import { Item, warrantyStatus } from "../src/item.js";
import { HomeEvent } from "../src/event.js";
import { Prediction } from "../src/prediction.js";
import { Resolution } from "../src/resolution.js";

const at = "2026-10-16T03:00:00.000Z";
const household = { schemaVersion: 1, householdId: "demo-blr", country: "IN", timeZone: "Asia/Kolkata", language: "en-IN", units: { volume: "L", temp: "C", weight: "kg", currency: "INR" }, regionPackId: "IN", regionPackVersion: "2026.10", askedFields: [], createdAt: at, updatedAt: at };
const event = { schemaVersion: 1, eventId: "evt_abc-123", householdId: "demo-blr", itemId: "itm_abc-123", timestamp: at, localDate: "2026-10-16", recordedAt: at, source: "voice" };

describe("persisted entities", () => {
  it("rejects full addresses, requires contact details, and identifies missing setup fields", () => {
    expect(Household.safeParse({ ...household, region: "12 MG Road, Bengaluru" }).success).toBe(false);
    expect(Household.safeParse({ ...household, region: "Bengaluru" }).success).toBe(true);
    expect(Household.safeParse({ ...household, region: "560034" }).success).toBe(true);
    expect(Household.safeParse({ ...household, contact: { consentGivenAt: at, consentSource: "voice" } }).success).toBe(false);
    expect(Household.safeParse({ ...household, contact: { phone: "+919876543210", consentGivenAt: at, consentSource: "voice" } }).success).toBe(true);
    expect(missingHouseholdFields({ householdId: "demo-blr" })).toEqual(["country", "timeZone", "language"]);
    expect(missingHouseholdFields({ ...household })).toEqual([]);
    expect(Household.safeParse({ ...household, extra: true }).success).toBe(false);
  });

  it("validates item warranty ranges and reports warranty status", () => {
    const base = { schemaVersion: 1, itemId: "itm_abc-123", householdId: "demo-blr", catalogKey: "lpg_cylinder", kind: "supply", name: "Cylinder", purchaseDate: "2026-01-01", warrantyUntil: "2026-12-31", createdAt: at, updatedAt: at };
    expect(Item.safeParse(base).success).toBe(true);
    expect(Item.safeParse({ ...base, warrantyUntil: "2025-12-31" }).success).toBe(false);
    expect(Item.parse({ ...base, warrantyUntil: undefined }).active).toBe(true);
    expect(warrantyStatus({ purchaseDate: base.purchaseDate, warrantyUntil: base.warrantyUntil }, "2026-10-16")).toEqual({ status: "valid", daysLeft: 76 });
    expect(warrantyStatus({ purchaseDate: base.purchaseDate, warrantyUntil: base.warrantyUntil }, "2027-01-01").status).toBe("expired");
    expect(warrantyStatus({ purchaseDate: base.purchaseDate }, "2026-10-16")).toEqual({ status: "unknown" });
  });

  it("enforces event-specific fields and parses prediction/resolution records", () => {
    expect(HomeEvent.safeParse({ ...event, type: "symptom" }).success).toBe(false);
    expect(HomeEvent.safeParse({ ...event, type: "symptom", symptom: { key: "beeping" } }).success).toBe(true);
    expect(HomeEvent.safeParse({ ...event, type: "changed", component: "sediment_filter" }).success).toBe(true);
    expect(HomeEvent.safeParse({ ...event, type: "cost", component: "sediment_filter", cost: { amount: 5, currency: "INR" } }).success).toBe(false);
    expect(HomeEvent.safeParse({ ...event, type: "cost" }).success).toBe(false);
    expect(HomeEvent.safeParse({ ...event, type: "cost", cost: { amount: 25, currency: "INR" } }).success).toBe(true);
    expect(HomeEvent.safeParse({ ...event, type: "booked" }).success).toBe(false);
    const prediction = { schemaVersion: 1, householdId: "demo-blr", itemId: "itm_abc-123", nextDueLocal: "2026-11-25", nextDueUtc: at, remindOnLocal: "2026-11-20", bookingOpensLocal: "2026-10-03", lastEventLocal: "2026-10-16", daysUntilDue: 40, status: "ok", explanation: "usually 40 days", basis: "region_default", intervalDays: 40, sampleSize: 0, rulesApplied: [], confidence: "low", computedAt: at };
    expect(Prediction.safeParse(prediction).success).toBe(true);
    expect(Resolution.safeParse({ schemaVersion: 1, resolutionId: "res_abc-123", householdId: "demo-blr", itemId: "itm_abc-123", symptomKey: "beeping", cause: "sensor", fix: "reset", confirmedBy: "voice", localDate: "2026-10-16", supportingEventIds: ["evt_abc-123"], createdAt: at }).success).toBe(true);
  });
});
