import { describe, expect, it } from "vitest";
import { HomeEvent } from "@ellie/schema";
import { intervalStats, getTimeline } from "../src/domain/history.js";
import { addHousehold, createTestContext } from "./helpers.js";

function event(id: string, date: string, approximate = false) {
  return HomeEvent.parse({ schemaVersion: 1, eventId: id, householdId: "demo-history", itemId: "itm_history-1", type: "changed", timestamp: `${date}T03:00:00.000Z`, localDate: date, recordedAt: `${date}T03:00:00.000Z`, source: "voice", dateIsApproximate: approximate });
}

describe("history and interval statistics", () => {
  it("ignores same-day duplicates and short noisy intervals", () => {
    const stats = intervalStats([event("evt_one-1", "2026-01-01"), event("evt_two-2", "2026-01-01"), event("evt_three-3", "2026-01-03"), event("evt_four-4", "2026-02-10", true)], "changed", "2026-02-12");
    expect(stats.sampleSize).toBe(1);
    expect(stats.averageDays).toBe(38);
    expect(stats.approximateCount).toBe(1);
    expect(stats.daysSinceLast).toBe(2);
  });

  it("loads timeline by period and item with local time-zone dates", async () => {
    const ctx = await createTestContext("2026-03-08T15:00:00.000Z");
    await addHousehold(ctx, "demo-history", "US");
    const logged = await ctx.repositories.items.put({ schemaVersion: 1, itemId: "itm_history-1", householdId: "demo-history", catalogKey: "propane_tank", kind: "supply", name: "propane tank", active: true, createdAt: ctx.clock.now().toISOString(), updatedAt: ctx.clock.now().toISOString() });
    expect(logged.name).toBe("propane tank");
    await ctx.repositories.events.put(event("evt_event-01", "2026-03-01"));
    const timeline = await getTimeline("demo-history", { itemId: "itm_history-1", period: "30d" }, ctx);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.when).toBe("7 days ago");
  });
});
