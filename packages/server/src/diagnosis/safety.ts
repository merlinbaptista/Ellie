import { fillTemplate, matchSymptom } from "@ellie/schema";
import type { CatalogEntry, ResolvedRegionPack, SafetyCategory } from "@ellie/schema";

export interface SafetyHit { category: SafetyCategory; emergencyNumber: string; message: string; symptomKey?: string }
const keywordRules: Array<{ category: SafetyCategory; patterns: RegExp }> = [
  { category: "gas", patterns: /smell(?:s|ing)?\s+(?:of\s+)?gas|gas\s+(?:smell|leak)|hissing\s+cylinder|rotten\s+egg/i },
  { category: "electrical", patterns: /burning\s+smell|sparks?|smoke\s+from|electric\s+shock|plug\s+melting|socket\s+hot/i },
  { category: "water_near_power", patterns: /water\s+near\s+(?:a\s+)?(?:socket|plug|switch|wiring)|leaking\s+onto\s+(?:a\s+)?socket|wet\s+socket/i },
  { category: "fire", patterns: /\bfire\b|\bflames?\b|on\s+fire/i },
  { category: "carbon_monoxide", patterns: /\bco\s+alarm\b|carbon\s+monoxide/i },
];

export function checkSafety(text: string, entry: CatalogEntry | undefined, pack: ResolvedRegionPack): SafetyHit | null {
  if (entry) {
    const matched = matchSymptom(text, entry);
    const symptom = matched ? entry.symptoms.find((candidate) => candidate.key === matched.key) : undefined;
    if (symptom?.safety) return makeHit(symptom.safety, pack, symptom.key);
  }
  for (const rule of keywordRules) if (rule.patterns.test(text)) return makeHit(rule.category, pack);
  return null;
}

function makeHit(category: SafetyCategory, pack: ResolvedRegionPack, symptomKey?: string): SafetyHit {
  const emergencyNumber = pack.safety.numbers[category] ?? pack.safety.generalEmergency;
  return {
    category,
    emergencyNumber,
    message: fillTemplate(pack.safety.stopMessages[category] ?? `Leave the area and call {number}.`, { number: emergencyNumber }),
    ...(symptomKey ? { symptomKey } : {}),
  };
}
