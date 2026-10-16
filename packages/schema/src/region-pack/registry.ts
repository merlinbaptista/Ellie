import { matchCatalog, type CatalogMatch } from "../catalog/match.js";
import { mergePacks } from "./merge.js";
import { RegionPack, type RegionPack as RegionPackType } from "./schema.js";
import { BUILTIN_REGION_PACKS } from "./builtins.js";

export type ResolvedRegionPack = RegionPackType & { resolvedFrom: string[] };
export interface RegionRegistry {
  list(): Array<{ packId: string; name: string; version: string; countries: string[] }>;
  get(packId: string): ResolvedRegionPack;
  forCountry(country: string): ResolvedRegionPack;
  matchItem(text: string, packId: string): CatalogMatch[];
  vocabulary(packId: string, canonical: string): string;
  unverifiedFacts(packId: string): Array<{ path: string; note: string }>;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
function allSources(value: unknown, path = ""): Array<{ path: string; note: string }> {
  if (Array.isArray(value)) return value.flatMap((child, index) => allSources(child, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const facts = "verified" in record && record.verified === false && typeof record.note === "string" && record.note.trim()
    ? [{ path: path || "sources", note: record.note }]
    : [];
  return [...facts, ...Object.entries(record).filter(([key]) => key !== "sources").flatMap(([key, child]) => allSources(child, path ? `${path}.${key}` : key))];
}
export function createRegionRegistry(inputPacks: unknown[]): RegionRegistry {
  const parsed: RegionPackType[] = [];
  const errors: string[] = [];
  for (const [index, raw] of inputPacks.entries()) {
    const result = RegionPack.safeParse(raw);
    if (!result.success) errors.push(...result.error.issues.map((issue) => `${String((raw as { packId?: unknown })?.packId ?? index)}.${issue.path.join(".")}: ${issue.message}`));
    else parsed.push(result.data);
  }
  const byId = new Map<string, RegionPackType>();
  for (const pack of parsed) {
    if (byId.has(pack.packId)) errors.push(`${pack.packId}: duplicate packId`);
    byId.set(pack.packId, pack);
  }
  const base = byId.get("DEFAULT");
  if (!base) errors.push("DEFAULT: required base region pack is missing");
  if (errors.length) throw new Error(`Invalid region packs:\n${errors.join("\n")}`);
  const defaultPack = base!;
  const cache = new Map<string, ResolvedRegionPack>();
  const get = (packId: string): ResolvedRegionPack => {
    const normalized = packId.toUpperCase();
    const cached = cache.get(normalized);
    if (cached) return cached;
    const source = byId.get(normalized);
    if (!source) throw new Error(`Unknown region pack: ${packId}`);
    let merged: RegionPackType;
    let resolvedFrom: string[];
    if (normalized === "DEFAULT") {
      merged = RegionPack.parse(defaultPack);
      resolvedFrom = ["DEFAULT"];
    } else {
      if (source.extends && source.extends !== "DEFAULT") throw new Error(`${normalized}: unsupported parent ${source.extends}`);
      merged = mergePacks(defaultPack, source);
      resolvedFrom = ["DEFAULT", normalized];
    }
    const result = deepFreeze({ ...merged, resolvedFrom }) as ResolvedRegionPack;
    cache.set(normalized, result);
    return result;
  };
  for (const pack of parsed) {
    try { get(pack.packId); } catch (error) { errors.push(`${pack.packId}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (errors.length) throw new Error(`Invalid resolved region packs:\n${errors.join("\n")}`);
  return {
    list: () => parsed.map(({ packId, name, version, countries }) => ({ packId, name, version, countries: [...countries] })),
    get,
    forCountry(country) {
      const normalized = country.toUpperCase();
      const match = parsed.find((pack) => pack.packId !== "DEFAULT" && pack.countries.includes(normalized as never));
      return get(match?.packId ?? "DEFAULT");
    },
    matchItem(text, packId) { return matchCatalog(text, get(packId)); },
    vocabulary(packId, canonical) { return get(packId).vocabulary[canonical] ?? canonical; },
    unverifiedFacts(packId) { return allSources(get(packId)); },
  };
}
export function createBuiltInRegistry(): RegionRegistry {
  return createRegionRegistry(BUILTIN_REGION_PACKS);
}
