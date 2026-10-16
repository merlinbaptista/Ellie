import { describe, expect, it } from "vitest";
import { BUILTIN_REGION_PACKS, createRegionRegistry, RegionPack } from "../src/index.js";
import { mergePacks } from "../src/region-pack/merge.js";

const packs = BUILTIN_REGION_PACKS.map((pack) => RegionPack.parse(pack));
describe("region-pack inheritance", () => {
  it("inherits default entries and deeply merges regional overrides", () => {
    const registry = createRegionRegistry(packs);
    const india = registry.get("IN");
    expect(india.catalog.smoke_alarm).toBeDefined();
    const us = registry.get("US");
    expect(us.catalog.smoke_alarm?.recurring?.defaultIntervalDays).toBe(180);
    expect(us.catalog.smoke_alarm?.aliases).toContain("smoke detector");
    expect(registry.get("us")).toBe(us);
    expect(Object.isFrozen(us.catalog.smoke_alarm?.aliases)).toBe(true);
  });

  it("reports alias collisions and invalid provider references", () => {
    const base = structuredClone(packs[0]) as unknown as { catalog: Record<string, Record<string, unknown>>; providers: Record<string, unknown> };
    base.catalog.other_alarm = { ...base.catalog.smoke_alarm, aliases: ["smoke alarm"] };
    expect(() => createRegionRegistry([base])).toThrow(/smoke_alarm and other_alarm/);
    const invalid = structuredClone(packs[0]) as unknown as { catalog: Record<string, Record<string, unknown>>; providers: Record<string, unknown> };
    invalid.providers.bad = { name: "Bad", appliesTo: ["missing_item"], channel: "app", source: { note: "test", verified: false } };
    expect(() => createRegionRegistry([invalid])).toThrow(/Unknown catalog key: missing_item/);
  });

  it("selects country packs, falls back to DEFAULT, exposes vocabulary, and aggregates invalid inputs", () => {
    const registry = createRegionRegistry(packs);
    expect(registry.forCountry("gb").packId).toBe("UK");
    expect(registry.forCountry("FR").packId).toBe("DEFAULT");
    expect(registry.vocabulary("IN", "gas_container")).toBe("cylinder");
    expect(registry.vocabulary("US", "missing")).toBe("missing");
    expect(registry.unverifiedFacts("IN").length).toBeGreaterThan(0);
    expect(() => createRegionRegistry([{ packId: "BROKEN" }])).toThrow(/Invalid region packs/);
    expect(() => createRegionRegistry(packs.slice(1))).toThrow(/DEFAULT: required/);
  });

  it("merges field-level recurring overrides and unioned aliases", () => {
    const defaultPack = packs[0]!;
    const child = { ...packs[2]!, catalog: { ...packs[2]!.catalog, smoke_alarm: { ...packs[2]!.catalog.smoke_alarm!, aliases: ["alarm"], recurring: { ...packs[2]!.catalog.smoke_alarm!.recurring!, leadTimeDays: 2 } } } };
    const merged = mergePacks(defaultPack, child);
    expect(merged.catalog.smoke_alarm?.aliases).toContain("smoke alarm");
    expect(merged.catalog.smoke_alarm?.aliases).toContain("alarm");
    expect(merged.catalog.smoke_alarm?.recurring?.defaultIntervalDays).toBe(180);
    expect(merged.catalog.smoke_alarm?.recurring?.leadTimeDays).toBe(2);
  });
});
