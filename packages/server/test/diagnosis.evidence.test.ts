import { describe, expect, it } from "vitest";
import { toLocalDate, warrantyStatus } from "@ellie/schema";
import { buildEvidence } from "../src/diagnosis/evidence.js";
import { recomputeItem } from "../src/domain/predictions.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";

describe("diagnosis evidence", () => {
  it("builds stable overdue, prior symptom, resolution and warranty evidence for the seeded purifier", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const household = (await ctx.repositories.households.get("demo-blr"))!;
    const pack = ctx.regions.get("IN");
    const item = (await ctx.repositories.items.list("demo-blr")).find((candidate) => candidate.catalogKey === "ro_purifier")!;
    const events = await ctx.repositories.events.list("demo-blr", item.itemId);
    const predictions = await recomputeItem(ctx, "demo-blr", item.itemId, { schedule: false });
    const today = toLocalDate(ctx.clock.now().toISOString(), household.timeZone!);
    const evidence = buildEvidence({
      item,
      catalog: pack.catalog.ro_purifier,
      symptomKey: "beeping",
      events: events.filter((event) => event.localDate !== today),
      resolutions: await ctx.repositories.resolutions.list("demo-blr", item.itemId),
      predictions: [predictions.main, ...predictions.components].filter((prediction) => prediction.status !== "unknown"),
      warranty: warrantyStatus(item, today),
      answers: {},
      todayLocal: today,
      pack,
    });
    const overdue = evidence.find((itemEvidence) => itemEvidence.evidenceId === "ev_overdue_sediment_filter");
    expect(overdue?.text).toContain("about 3 months overdue");
    expect(overdue?.causeKeys).toContain("filter_overdue");
    expect(evidence.some((itemEvidence) => itemEvidence.evidenceId === "ev_symptom_evt_seed-blr-ro-beep" && itemEvidence.text.includes("14 March"))).toBe(true);
    expect(evidence.find((itemEvidence) => itemEvidence.evidenceId === "ev_res_res_seed-blr-ro-01")?.causeKeys).toContain("membrane_clogged");
    expect(evidence.find((itemEvidence) => itemEvidence.evidenceId === "ev_warranty")?.text).toContain("20 December");
  });
});
