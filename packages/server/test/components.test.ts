import { describe, expect, it } from "vitest";
import { matchComponent } from "@ellie/schema";
import { logEvent } from "../src/domain/events.js";
import { computePrediction } from "../src/prediction/engine.js";
import { addHousehold, createTestContext } from "./helpers.js";

describe("component-level maintenance", () => {
  it("matches purifier filter aliases with stable first-component tie breaking", async () => {
    const ctx = await createTestContext();
    const pack = ctx.regions.get("IN");
    expect(matchComponent("purifier filter", pack.catalog.ro_purifier!)?.key).toBe("sediment_filter");
    expect(matchComponent("membrane", pack.catalog.ro_purifier!)?.key).toBe("ro_membrane");
    await addHousehold(ctx, "demo-component", "IN");
    const result = await logEvent({ householdId: "demo-component", item: "purifier", type: "changed", component: "filter" }, ctx);
    expect(result.event?.component).toBe("sediment_filter");
    const itemEvents = await ctx.repositories.events.list("demo-component", result.item.itemId);
    const item = result.item;
    const prediction = computePrediction({ householdId: "demo-component", item, catalog: pack.catalog.ro_purifier, events: itemEvents, component: { key: "sediment_filter", displayName: "sediment filter", defaultIntervalDays: 180 }, pack, timeZone: "Asia/Kolkata", todayLocal: "2026-10-16", computedAt: ctx.clock.now().toISOString() });
    expect(prediction.component).toBe("sediment_filter");
    expect(prediction.status).toBe("ok");
  });
});
