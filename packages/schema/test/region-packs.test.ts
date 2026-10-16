import { describe, expect, it } from "vitest";
import { BUILTIN_REGION_PACKS, RegionPack, createBuiltInRegistry } from "../src/index.js";

function checkSources(value: unknown, path = "root"): void {
  if (Array.isArray(value)) return value.forEach((child, index) => checkSources(child, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.verified === false) expect(typeof record.note === "string" && record.note.trim().length > 0, path).toBe(true);
  Object.entries(record).forEach(([key, child]) => checkSources(child, `${path}.${key}`));
}

describe("built-in region packs", () => {
  it("parses all packs and carries the specified IN and US data", () => {
    const packs = BUILTIN_REGION_PACKS.map((pack) => RegionPack.parse(pack));
    expect(packs).toHaveLength(4);
    const india = packs.find((pack) => pack.packId === "IN")!;
    expect(india.catalog.lpg_cylinder?.recurring?.minDaysBetweenBookings).toBe(25);
    expect(india.safety.numbers.gas).toBe("1906");
    expect(india.providers.indane?.channel).toBe("whatsapp");
    expect(india.providers.indane?.messageTemplate).toBe("REFILL");
    const us = packs.find((pack) => pack.packId === "US")!;
    expect(us.units).toMatchObject({ volume: "gal", temp: "F" });
    expect(us.providers.filter_shop?.channel).toBe("shopping_link");
  });

  it("requires all safe stop templates and provenance for every unverified source", () => {
    const registry = createBuiltInRegistry();
    for (const pack of BUILTIN_REGION_PACKS.map((value) => RegionPack.parse(value))) {
      expect(Object.keys(pack.safety.stopMessages)).toHaveLength(5);
      expect(Object.values(pack.safety.stopMessages).every((message) => message.includes("{number}"))).toBe(true);
      checkSources(pack);
      for (const entry of Object.values(pack.catalog)) {
        for (const symptom of entry.symptoms) {
          if (symptom.safety) expect(symptom.likelyCauses.every((cause) => !cause.diy)).toBe(true);
        }
      }
      expect(registry.get(pack.packId).resolvedFrom[0]).toBe("DEFAULT");
    }
    const invalid = structuredClone(BUILTIN_REGION_PACKS[0]) as { safety: { stopMessages: Record<string, string> } };
    invalid.safety.stopMessages.unknown = "Call {number}";
    expect(RegionPack.safeParse(invalid).success).toBe(false);
  });
});
