import { describe, expect, it } from "vitest";
import { createBuiltInRegistry, detectEventType, matchCatalog, matchSymptom, splitAndMatch } from "../src/index.js";

const registry = createBuiltInRegistry();
describe("catalog speech matching", () => {
  it("matches regional item aliases and symptoms", () => {
    const india = registry.get("IN");
    for (const phrase of ["gas", "the cylinder's changed", "LPG"]) expect(registry.matchItem(phrase, "IN")[0]?.catalogKey).toBe("lpg_cylinder");
    const purifier = registry.matchItem("purifier is beeping", "IN")[0]!;
    expect(purifier.catalogKey).toBe("ro_purifier");
    expect(matchSymptom("purifier is beeping", india.catalog.ro_purifier!)?.key).toBe("beeping");
    expect(registry.matchItem("nonsense words", "IN")).toEqual([]);
    expect(matchCatalog("", india)).toEqual([]);
    expect(matchSymptom("normal", india.catalog.ro_purifier!)).toBeNull();
  });

  it("splits a multi-intent phrase and identifies event types", () => {
    const matches = splitAndMatch("the cylinder's changed and the purifier is beeping again", registry.get("IN"));
    expect(matches).toHaveLength(2);
    expect(matches[0]?.matches[0]?.catalogKey).toBe("lpg_cylinder");
    expect(matches[1]?.matches[0]?.catalogKey).toBe("ro_purifier");
    expect(detectEventType(matches[0]!.fragment)).toBe("changed");
    expect(detectEventType(matches[1]!.fragment)).toBe("symptom");
    expect(detectEventType("we booked a service")).toBe("booked");
    expect(detectEventType("the package arrived")).toBe("delivered");
    expect(detectEventType("the unit was cleaned")).toBe("serviced");
    expect(detectEventType("hello there")).toBeNull();
  });

  it("matches US catalog wording and resolves best aliases", () => {
    expect(registry.matchItem("propane", "US")[0]?.catalogKey).toBe("propane_tank");
    expect(registry.matchItem("furnace filter", "US")[0]?.catalogKey).toBe("hvac_filter");
    expect(registry.matchItem("smoke alarm", "US")[0]?.catalogKey).toBe("smoke_alarm");
  });
});
