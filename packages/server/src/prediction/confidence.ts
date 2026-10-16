import type { Confidence } from "@ellie/schema";
import { coefficientOfVariation } from "./intervals.js";

export interface ConfidenceInput {
  basis: "household_average" | "single_interval" | "component_default" | "region_default" | "user_override";
  intervals: number[];
  approximateCount: number;
}
export function predictionConfidence(input: ConfidenceInput): Confidence {
  if (input.basis === "user_override") return "high";
  if (input.basis === "household_average") {
    const approximateRatio = input.intervals.length ? input.approximateCount / input.intervals.length : 0;
    return input.intervals.length >= 3 && coefficientOfVariation(input.intervals) <= 0.15 && approximateRatio < 0.5 ? "high" : "medium";
  }
  if (input.basis === "single_interval") return input.approximateCount ? "low" : "medium";
  return "low";
}
