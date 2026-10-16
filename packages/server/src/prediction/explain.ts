import type { Prediction } from "@ellie/schema";
import { intervalToPhrase } from "../domain/speech.js";

function pluralize(name: string): string {
  const words = name.split(" ");
  const last = words.pop() ?? name;
  const plural = last.endsWith("y") ? `${last.slice(0, -1)}ies` : `${last}s`;
  return [...words, plural].join(" ");
}
export function predictionExplanation(input: {
  basis: Prediction["basis"];
  intervalDays: number;
  sampleSize: number;
  displayName: string;
  countryName: string;
  componentName?: string;
}): string {
  if (input.basis === "household_average") return `based on your last ${input.sampleSize + 1} ${pluralize(input.displayName)}`;
  if (input.basis === "single_interval") return "based on your last two changes";
  if (input.basis === "component_default") return `${input.componentName ?? input.displayName} usually lasts ${intervalToPhrase(input.intervalDays)}`;
  if (input.basis === "user_override") return `you told me every ${intervalToPhrase(input.intervalDays)}`;
  return `usually ${intervalToPhrase(input.intervalDays)} in ${input.countryName} — I'll learn your pattern`;
}
