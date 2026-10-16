import { describe, expect, it } from "vitest";
import { HomeEvent, Item, addDays, createBuiltInRegistry, localDateToUtc } from "@ellie/schema";
import { computePrediction } from "../src/prediction/engine.js";
import { estimateWeightedIntervals } from "../src/prediction/intervals.js";
import { createTestContext } from "./helpers.js";
import { seedDemo } from "../src/seed/seed.js";

describe("pure prediction engine", () => {
  it("predicts seeded gas and purifier components from history", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const household = (await ctx.repositories.households.get("demo-blr"))!;
    const pack = ctx.regions.get("IN");
    const items = await ctx.repositories.items.list("demo-blr");
    const gas = items.find((item) => item.catalogKey === "lpg_cylinder")!;
    const gasEvents = await ctx.repositories.events.list("demo-blr", gas.itemId);
    const gasPrediction = computePrediction({ householdId: "demo-blr", item: gas, catalog: pack.catalog.lpg_cylinder, events: gasEvents, pack, timeZone: household.timeZone!, todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(gasPrediction.basis).toBe("household_average");
    expect(gasPrediction.intervalDays).toBe(38);
    expect(gasPrediction.nextDueLocal).toBe("2026-10-16");
    expect(gasPrediction.status).toBe("due");
    expect(gasPrediction.confidence).toBe("high");
    expect(gasPrediction.bookingOpensLocal).toBe("2026-10-03");

    const purifier = items.find((item) => item.catalogKey === "ro_purifier")!;
    const purifierEvents = await ctx.repositories.events.list("demo-blr", purifier.itemId);
    const sediment = pack.catalog.ro_purifier!.components.find((part) => part.key === "sediment_filter")!;
    const componentPrediction = computePrediction({ householdId: "demo-blr", item: purifier, component: { key: sediment.key, displayName: sediment.displayName, defaultIntervalDays: sediment.defaultIntervalDays }, catalog: pack.catalog.ro_purifier, events: purifierEvents, pack, timeZone: household.timeZone!, todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(componentPrediction.basis).toBe("component_default");
    expect(componentPrediction.nextDueLocal).toBe("2026-07-18");
    expect(componentPrediction.daysUntilDue).toBe(-90);
    expect(componentPrediction.status).toBe("overdue");
  });

  it("covers region, single-interval, override, component-default, custom-unknown and DST paths", async () => {
    const ctx = await createTestContext("2026-10-16T03:00:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const household = (await ctx.repositories.households.get("demo-tx"))!;
    const pack = ctx.regions.get("US");
    const items = await ctx.repositories.items.list("demo-tx");
    const hvac = items.find((item) => item.catalogKey === "hvac_filter")!;
    const events = await ctx.repositories.events.list("demo-tx", hvac.itemId);
    const prediction = computePrediction({ householdId: "demo-tx", item: hvac, catalog: pack.catalog.hvac_filter, events, pack, timeZone: household.timeZone!, todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(prediction.basis).toBe("single_interval");
    expect(prediction.intervalDays).toBe(91);
    expect(prediction.nextDueLocal).toBe("2026-10-22");

    const override = computePrediction({ householdId: "demo-tx", item: { ...hvac, intervalOverrideDays: 30 }, catalog: pack.catalog.hvac_filter, events, pack, timeZone: household.timeZone!, todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(override.basis).toBe("user_override");
    expect(override.intervalDays).toBe(30);
    const regionDefault = computePrediction({ householdId: "demo-tx", item: hvac, catalog: pack.catalog.hvac_filter, events: events.slice(-1), pack, timeZone: household.timeZone!, todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(regionDefault.basis).toBe("region_default");
    const custom = Item.parse({ schemaVersion: 1, itemId: "itm_custom-one", householdId: "demo-tx", catalogKey: "custom", kind: "custom", name: "garden hose", active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    const unknown = computePrediction({ householdId: "demo-tx", item: custom, events: [], pack, timeZone: "America/Chicago", todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(unknown.status).toBe("unknown");
    const event = (eventId: string, date: string) => HomeEvent.parse({ schemaVersion: 1, eventId, householdId: "demo-tx", itemId: custom.itemId, type: "changed", timestamp: localDateToUtc(date, "America/Chicago"), localDate: date, recordedAt: "2026-10-16T00:00:00.000Z", source: "voice" });
    const learned = computePrediction({ householdId: "demo-tx", item: custom, events: [event("evt_custom-01", "2026-01-01"), event("evt_custom-02", "2026-02-01"), event("evt_custom-03", "2026-03-01")], pack, timeZone: "America/Chicago", todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(learned.basis).toBe("household_average");
    const dst = computePrediction({ householdId: "demo-tx", item: hvac, catalog: pack.catalog.hvac_filter, events: [event("evt_hvac-01", "2026-08-02"), event("evt_hvac-02", "2026-11-01")], pack, timeZone: "America/Chicago", todayLocal: "2026-11-01", computedAt: ctx.clock.now().toISOString() });
    expect(dst.nextDueUtc).toBe(localDateToUtc(dst.nextDueLocal!, "America/Chicago", 9));
    expect(addDays("2026-10-16", 38)).toBe("2026-11-23");
  });

  it("drops outliers, discounts approximate intervals, and clamps implausible history", () => {
    const base = (eventId: string, date: string, approximate = false) => HomeEvent.parse({ schemaVersion: 1, eventId, householdId: "demo-blr", itemId: "itm_estimate", type: "changed", timestamp: `${date}T09:00:00.000Z`, localDate: date, dateIsApproximate: approximate, recordedAt: "2026-10-16T00:00:00.000Z", source: "voice" });
    const outlier = estimateWeightedIntervals([base("evt_est-01", "2026-01-01"), base("evt_est-02", "2026-01-31"), base("evt_est-03", "2026-03-02"), base("evt_est-04", "2026-06-30"), base("evt_est-05", "2026-07-30")], "changed");
    expect(outlier.droppedOutliers).toBe(1);
    const weighted = estimateWeightedIntervals([base("evt_weight-01", "2026-01-01", true), base("evt_weight-02", "2026-01-31"), base("evt_weight-03", "2026-03-02")], "changed");
    expect(weighted.estimate).toBe(30);
    const pack = createBuiltInRegistry().get("US");
    const ctxInput = {
      householdId: "demo-tx",
      item: Item.parse({ schemaVersion: 1, itemId: "itm_clamp-one", householdId: "demo-tx", catalogKey: "hvac_filter", kind: "supply", name: "HVAC filter", active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
      catalog: pack.catalog.hvac_filter,
      events: [base("evt_clamp-01", "2024-01-01"), base("evt_clamp-02", "2026-10-01")],
      pack,
      timeZone: "America/Chicago",
      todayLocal: "2026-10-16",
      computedAt: "2026-10-16T00:00:00.000Z",
    };
    const clamped = computePrediction(ctxInput);
    expect(clamped.intervalDays).toBe(360);
    expect(clamped.rulesApplied.some((rule) => rule.ruleId === "clamp_interval")).toBe(true);
  });
});
