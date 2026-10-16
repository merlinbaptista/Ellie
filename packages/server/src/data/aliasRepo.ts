import type { StorageAdapter } from "../adapters/storage/types.js";
import { aliasPrefix, aliasSk, householdPk, normalizePhrase } from "./keys.js";

export interface HouseholdAlias { itemId: string; phrase: string; learnedAt: string }
export class AliasRepository {
  constructor(private readonly storage: StorageAdapter) {}
  async get(householdId: string, phrase: string): Promise<HouseholdAlias | null> {
    const row = await this.storage.get(householdPk(householdId), aliasSk(phrase));
    return row ? row.data as unknown as HouseholdAlias : null;
  }
  async put(householdId: string, phrase: string, itemId: string, learnedAt: string): Promise<void> {
    const normalized = normalizePhrase(phrase);
    if (!normalized) return;
    const existing = await this.get(householdId, normalized);
    if (!existing) await this.storage.put({ pk: householdPk(householdId), sk: aliasSk(normalized), type: "alias", data: { itemId, phrase, learnedAt } });
  }
  async list(householdId: string): Promise<HouseholdAlias[]> {
    return (await this.storage.query(householdPk(householdId), { skPrefix: aliasPrefix() })).map((row) => row.data as unknown as HouseholdAlias);
  }
}
