import { describe, expect, it } from "vitest";
import { logResolution } from "../src/domain/resolutions.js";
import { addHousehold, createTestContext } from "./helpers.js";
import { seedDemo } from "../src/seed/seed.js";

describe("resolution logging", () => {
  it("logs a component replacement, recomputes its prediction, and deduplicates", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const first = await logResolution(ctx, { householdId: "demo-blr", item: "purifier", diagnosisId: "dgn_missing-1", causeKey: "filter_overdue", component: "sediment_filter", cause: "Filter overdue", fix: "replaced the sediment filter", byWhom: "self" });
    expect(first.resolution.component).toBe("sediment_filter");
    const events = await ctx.repositories.events.list("demo-blr", first.resolution.itemId);
    expect(events.some((event) => event.type === "changed" && event.component === "sediment_filter")).toBe(true);
    const next = first.prediction?.components.find((prediction) => prediction.component === "sediment_filter");
    expect(next?.nextDueLocal).toBe("2027-04-14");
    const second = await logResolution(ctx, { householdId: "demo-blr", item: "purifier", diagnosisId: "dgn_missing-1", causeKey: "filter_overdue", component: "sediment_filter", cause: "Filter overdue", fix: "replaced the sediment filter", byWhom: "self" });
    expect(second.resolution.resolutionId).toBe(first.resolution.resolutionId);
  });

  it("resolves explicit diagnosis cause metadata and saves costs in household currency", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_resolution-1", "IN");
    const result = await logResolution(ctx, { householdId: "hh_resolution-1", item: "purifier", cause: "unknown", fix: "technician replaced membrane", byWhom: "technician", cost: 2400 });
    expect(result.resolution.cost?.currency).toBe("INR");
    expect(result.resolution.byWhom).toBe("technician");
  });
});
