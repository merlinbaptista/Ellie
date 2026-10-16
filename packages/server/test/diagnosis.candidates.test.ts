import { describe, expect, it } from "vitest";
import { createBuiltInRegistry } from "@ellie/schema";
import { buildCandidates } from "../src/diagnosis/candidates.js";
import { createTestContext } from "./helpers.js";
import { seedDemo } from "../src/seed/seed.js";
import { recomputeItem } from "../src/domain/predictions.js";
import { buildEvidence } from "../src/diagnosis/evidence.js";
import { toLocalDate, warrantyStatus } from "@ellie/schema";

describe("diagnosis candidate scoring", () => {
  it("ranks the overdue filter first in Journey 2 and keeps pack order for ties", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const household = (await ctx.repositories.households.get("demo-blr"))!;
    const pack = ctx.regions.get("IN");
    const item = (await ctx.repositories.items.list("demo-blr")).find((candidate) => candidate.catalogKey === "ro_purifier")!;
    const events = await ctx.repositories.events.list("demo-blr", item.itemId);
    const predictions = await recomputeItem(ctx, "demo-blr", item.itemId, { schedule: false });
    const evidence = buildEvidence({ item, catalog: pack.catalog.ro_purifier, symptomKey: "beeping", events: events.filter((event) => event.eventId !== "evt_current"), resolutions: await ctx.repositories.resolutions.list("demo-blr", item.itemId), predictions: [predictions.main, ...predictions.components], warranty: warrantyStatus(item, toLocalDate(ctx.clock.now().toISOString(), household.timeZone!)), answers: {}, todayLocal: "2026-10-16", pack });
    const symptom = pack.catalog.ro_purifier!.symptoms.find((entry) => entry.key === "beeping")!;
    const candidates = buildCandidates(symptom, pack.catalog.ro_purifier, evidence);
    expect(candidates[0]?.causeKey).toBe("filter_overdue");
    expect(candidates[0]?.score).toBeGreaterThan(0.7);
    expect(candidates[1]?.causeKey).toBe("tank_full_sensor");
    const tied = buildCandidates({ ...symptom, likelyCauses: symptom.likelyCauses.slice(0, 2) }, pack.catalog.ro_purifier, []);
    expect(tied[0]?.causeKey).toBe("filter_overdue");
  });

  it("uses item-overdue evidence for non-component filter causes", () => {
    const pack = createBuiltInRegistry().get("US");
    const symptom = pack.catalog.hvac_filter!.symptoms[0]!;
    const candidates = buildCandidates(symptom, pack.catalog.hvac_filter, [{ evidenceId: "ev_overdue_item", kind: "item_overdue", text: "HVAC filter is overdue", weight: 0.35, causeKeys: ["hvac_filter_overdue"] }]);
    expect(candidates[0]?.causeKey).toBe("hvac_filter_overdue");
    expect(candidates[0]?.score).toBeCloseTo(0.7, 2);
  });
});
