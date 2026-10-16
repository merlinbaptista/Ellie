import { RegionPack, type RegionPack as RegionPackType } from "./schema.js";

type JsonRecord = Record<string, unknown>;
function mergeByKey(base: JsonRecord, child: JsonRecord): JsonRecord {
  const merged: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(child)) {
    const original = merged[key];
    if (key === "catalog" && isRecord(original) && isRecord(value)) {
      const catalog: JsonRecord = { ...original };
      for (const [catalogKey, entry] of Object.entries(value)) {
        const previous = catalog[catalogKey];
        if (isRecord(previous) && isRecord(entry)) {
          const aliases = [...new Set([...(Array.isArray(previous.aliases) ? previous.aliases : []), ...(Array.isArray(entry.aliases) ? entry.aliases : [])])];
          const symptoms = mergeArrayByKey(previous.symptoms, entry.symptoms, "key");
          catalog[catalogKey] = { ...previous, ...entry, aliases, recurring: { ...asRecord(previous.recurring), ...asRecord(entry.recurring) }, components: entry.components ?? previous.components, symptoms };
        } else catalog[catalogKey] = entry;
      }
      merged[key] = catalog;
    } else if (["providers", "vocabulary"].includes(key) && isRecord(original) && isRecord(value)) {
      merged[key] = { ...original, ...value };
    } else if (key === "safety" && isRecord(original) && isRecord(value)) {
      merged[key] = { ...original, ...value, numbers: { ...asRecord(original.numbers), ...asRecord(value.numbers) }, stopMessages: { ...asRecord(original.stopMessages), ...asRecord(value.stopMessages) } };
    } else if (key === "sources" && Array.isArray(original) && Array.isArray(value)) {
      merged[key] = [...original, ...value];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function asRecord(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function mergeArrayByKey(base: unknown, child: unknown, key: string): unknown[] {
  const values = new Map<string, unknown>();
  for (const entry of [...(Array.isArray(base) ? base : []), ...(Array.isArray(child) ? child : [])]) {
    if (isRecord(entry) && typeof entry[key] === "string") {
      const previous = values.get(entry[key] as string);
      values.set(entry[key] as string, previous && isRecord(previous) ? { ...previous, ...entry } : entry);
    }
  }
  return [...values.values()];
}
export function mergePacks(base: RegionPackType, child: RegionPackType): RegionPackType {
  return RegionPack.parse(mergeByKey(base as unknown as JsonRecord, child as unknown as JsonRecord));
}
