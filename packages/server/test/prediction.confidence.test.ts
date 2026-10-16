import { describe, expect, it } from "vitest";
import { predictionConfidence } from "../src/prediction/confidence.js";

describe("prediction confidence", () => {
  it("applies confidence tiers and the approximate-date threshold", () => {
    expect(predictionConfidence({ basis: "user_override", intervals: [], approximateCount: 0 })).toBe("high");
    expect(predictionConfidence({ basis: "household_average", intervals: [38, 39, 37], approximateCount: 0 })).toBe("high");
    expect(predictionConfidence({ basis: "household_average", intervals: [30, 50, 70], approximateCount: 0 })).toBe("medium");
    expect(predictionConfidence({ basis: "household_average", intervals: [38, 39, 37], approximateCount: 2 })).toBe("medium");
    expect(predictionConfidence({ basis: "single_interval", intervals: [35], approximateCount: 0 })).toBe("medium");
    expect(predictionConfidence({ basis: "single_interval", intervals: [35], approximateCount: 1 })).toBe("low");
    expect(predictionConfidence({ basis: "component_default", intervals: [], approximateCount: 0 })).toBe("low");
    expect(predictionConfidence({ basis: "region_default", intervals: [], approximateCount: 0 })).toBe("low");
  });
});
