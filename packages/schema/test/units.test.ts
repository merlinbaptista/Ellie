import { describe, expect, it } from "vitest";
import { convertTemp, convertVolume, convertWeight, formatMoney, formatQuantity, newId, newSortableId, fillTemplate, speechList } from "../src/index.js";

describe("unit and formatting helpers", () => {
  it("converts volume, temperature, and weight", () => {
    expect(convertVolume(10, "gal", "L")).toBeCloseTo(37.854, 3);
    expect(convertVolume(10, "L", "L")).toBe(10);
    expect(convertTemp(100, "F", "C")).toBeCloseTo(37.78, 2);
    expect(convertTemp(0, "C", "F")).toBe(32);
    expect(convertTemp(22, "C", "C")).toBe(22);
    expect(convertWeight(1, "lb", "kg")).toBeCloseTo(0.45359237, 7);
    expect(convertWeight(1, "kg", "lb")).toBeCloseTo(2.20462, 4);
    expect(convertWeight(1, "kg", "kg")).toBe(1);
  });

  it("formats money and quantities for locale", () => {
    expect(formatMoney({ amount: 1250, currency: "INR" }, "en-IN")).toContain("₹1,250");
    expect(formatMoney({ amount: 45, currency: "USD" }, "en-US")).toContain("$");
    expect(formatMoney({ amount: 80, currency: "GBP" }, "en-GB")).toContain("£");
    expect(formatQuantity(10, "gal", "en-US")).toBe("10 gal");
  });

  it("creates browser-safe IDs and fills speech/URL templates", () => {
    const id = newId("evt");
    expect(id).toMatch(/^evt_[a-z0-9]{20}$/);
    expect(newSortableId("itm", new Date("2026-10-16T00:00:00.000Z"))).toMatch(/^itm_[a-z0-9]{9}-[a-z0-9]{10}$/);
    expect(fillTemplate("Hello {name}", { name: "Headsup" })).toBe("Hello Headsup");
    expect(fillTemplate("https://example.com/?q={query}", { query: "gas cylinder" })).toBe("https://example.com/?q=gas%20cylinder");
    expect(fillTemplate("{missing}", {})).toBe("{missing}");
    expect(speechList([])).toBe("");
    expect(speechList(["one"])).toBe("one");
    expect(speechList(["one", "two"])).toBe("one and two");
    expect(speechList(["one", "two", "three"])).toBe("one, two and three");
  });
});
