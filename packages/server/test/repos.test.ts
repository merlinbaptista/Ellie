import { describe, expect, it } from "vitest";
import { createTestContext, addHousehold } from "./helpers.js";
import { eventSk, normalizePhrase } from "../src/data/keys.js";
import { HomeEvent, newId } from "@ellie/schema";

describe("memory repositories and keys", () => {
  it("normalizes household aliases and creates deterministic single-table keys", () => {
    expect(normalizePhrase("The Gas's")).toBe("gas");
    expect(normalizePhrase("our water filters")).toBe("water filter");
    expect(eventSk("itm_a", "2026-01-01T00:00:00.000Z", "evt_a")).toBe("EVENT#itm_a#2026-01-01T00:00:00.000Z#evt_a");
  });

  it("stores event sort keys lexically by timestamp", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "demo-repo");
    const make = (eventId: string, timestamp: string) => HomeEvent.parse({ schemaVersion: 1, eventId, householdId: "demo-repo", itemId: "itm_test-1", type: "changed", timestamp, localDate: timestamp.slice(0, 10), recordedAt: timestamp, source: "voice" });
    await ctx.repositories.events.put(make("evt_event-02", "2026-03-01T00:00:00.000Z"));
    await ctx.repositories.events.put(make("evt_event-01", "2026-02-01T00:00:00.000Z"));
    expect((await ctx.repositories.events.list("demo-repo", "itm_test-1")).map((event) => event.eventId)).toEqual(["evt_event-01", "evt_event-02"]);
    expect(newId("evt")).toMatch(/^evt_[a-z0-9]{20}$/);
  });
});
