import { describe, expect, it } from "vitest";
import { addHousehold, createTestContext } from "./helpers.js";
import { logEvent } from "../src/domain/events.js";

describe("event logging", () => {
  it("asks for previous history once, then saves the recalled and current events", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_journey-1", "IN");
    const first = await logEvent({ householdId: "hh_journey-1", item: "gas", type: "changed" }, ctx);
    expect(first.followUp?.field).toBe("previousWhen");
    expect(first.followUp?.defaultValue).toBe("about 6 weeks ago");
    const second = await logEvent({ householdId: "hh_journey-1", item: "gas", type: "changed", previousWhen: "about five weeks ago" }, ctx);
    expect(second.previousEvent?.dateIsApproximate).toBe(true);
    expect((await ctx.repositories.events.list("hh_journey-1", second.item.itemId)).length).toBe(2);
    expect((await logEvent({ householdId: "hh_journey-1", item: "gas", type: "changed" }, ctx)).followUp).toBeUndefined();
  });

  it("rejects future dates, deduplicates retries, and links a delivery to a booking", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_events-1", "IN");
    await expect(logEvent({ householdId: "hh_events-1", item: "gas", type: "changed", when: "2027-01-01" }, ctx)).rejects.toThrow(/future/i);
    const booked = await logEvent({ householdId: "hh_events-1", item: "gas", type: "booked", providerKey: "indane" }, ctx);
    expect(booked.event?.booking?.channel).toBe("whatsapp");
    const delivered = await logEvent({ householdId: "hh_events-1", item: "gas", type: "delivered" }, ctx);
    expect(delivered.event?.relatedEventId).toBe(booked.event?.eventId);
    const first = await logEvent({ householdId: "hh_events-1", item: "garden hose", type: "note", notes: "stored outside" }, ctx);
    const retry = await logEvent({ householdId: "hh_events-1", item: "garden hose", type: "note", notes: "stored outside" }, ctx);
    expect(retry.deduped).toBe(true);
    expect(first.event?.eventId).toBe(retry.event?.eventId);
    ctx.clock.set("2026-10-16T03:03:00.000Z");
    expect((await logEvent({ householdId: "hh_events-1", item: "garden hose", type: "note", notes: "stored outside" }, ctx)).deduped).toBe(false);
  });

  it("stores costs in household currency and emits only safety-stop guidance for gas symptoms", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_events-safety", "IN");
    const cost = await logEvent({ householdId: "hh_events-safety", item: "air conditioner", type: "cost", cost: 1250 }, ctx);
    expect(cost.event?.cost?.currency).toBe("INR");
    const safety = await logEvent({ householdId: "hh_events-safety", item: "gas", type: "symptom", symptom: "smell of gas" }, ctx);
    expect(safety.safety?.emergencyNumber).toBe("1906");
    expect(safety.safety?.message).toContain("1906");
    expect(safety.followUp).toBeUndefined();
  });
});
