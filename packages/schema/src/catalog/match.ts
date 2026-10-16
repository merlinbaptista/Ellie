import type { EventType } from "../enums.js";
import type { CatalogEntry, RegionPack } from "../region-pack/schema.js";

export interface CatalogMatch { catalogKey: string; displayName: string; score: number; matchedAlias: string }
function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function scoreAlias(text: string, alias: string): number {
  const normalizedText = normalize(text);
  const normalizedAlias = normalize(alias);
  if (!normalizedAlias) return 0;
  if (` ${normalizedText} `.includes(` ${normalizedAlias} `)) return 1;
  if (normalizedAlias.length >= 4 && normalizedText.split(" ").some((token) => token.startsWith(normalizedAlias))) return 0.6;
  if (normalizedAlias.split(" ").some((token) => token.length >= 4 && normalizedText.split(" ").some((part) => part.startsWith(token)))) return 0.6;
  if (normalizedAlias.split(" ").some((token) => token.length >= 3 && normalizedText.split(" ").includes(token))) return 0.8;
  return 0;
}
export function matchCatalog(text: string, pack: Pick<RegionPack, "catalog">): CatalogMatch[] {
  const found: CatalogMatch[] = [];
  for (const [catalogKey, entry] of Object.entries(pack.catalog)) {
    const options = entry.aliases.map((alias) => ({ alias, score: scoreAlias(text, alias) })).filter((hit) => hit.score >= 0.6).sort((a, b) => b.score - a.score || b.alias.length - a.alias.length);
    const best = options[0];
    if (best) found.push({ catalogKey, displayName: entry.displayName, score: best.score, matchedAlias: best.alias });
  }
  return found.sort((a, b) => b.score - a.score || b.matchedAlias.length - a.matchedAlias.length);
}
export function splitAndMatch(text: string, pack: Pick<RegionPack, "catalog">): Array<{ fragment: string; matches: CatalogMatch[] }> {
  return text.split(/\s+(?:and|also|then)\s+|,\s*/i).map((fragment) => fragment.trim()).filter(Boolean).map((fragment) => ({ fragment, matches: matchCatalog(fragment, pack) }));
}
export function matchSymptom(text: string, entry: CatalogEntry): { key: string; score: number; matchedAlias: string } | null {
  const found = entry.symptoms.flatMap((symptom) => symptom.aliases.map((alias) => ({ key: symptom.key, alias, score: scoreAlias(text, alias) }))).filter((candidate) => candidate.score >= 0.6).sort((a, b) => b.score - a.score || b.alias.length - a.alias.length);
  const best = found[0];
  return best ? { key: best.key, score: best.score, matchedAlias: best.alias } : null;
}
export function detectEventType(fragment: string): EventType | null {
  const text = normalize(fragment);
  if (/\b(changed|replaced|new|refilled|swapped)\b/.test(text)) return "changed";
  if (/\b(serviced|cleaned|maintained|flushed)\b/.test(text)) return "serviced";
  if (/\b(booked|ordered)\b/.test(text)) return "booked";
  if (/\b(came|delivered|arrived)\b/.test(text)) return "delivered";
  if (/\b(beeping|chirping|leaking|not working|broken|smell|no water|not cooling)\b/.test(text)) return "symptom";
  return null;
}
