import type { Household } from "@ellie/schema";
import type { Clock } from "../lib/clock.js";
import type { StorageAdapter } from "../adapters/storage/types.js";
import { householdIndexPk, householdIndexPrefix, householdIndexSk, householdPk, householdProfileSk } from "./keys.js";

export type HouseholdRecord = Partial<Household> & { householdId: string; schemaVersion: 1; askedFields: string[]; createdAt: string; updatedAt: string };
export class HouseholdRepository {
  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock) {}
  async get(id: string): Promise<HouseholdRecord | null> {
    const row = await this.storage.get(householdPk(id), householdProfileSk());
    return row ? row.data as HouseholdRecord : null;
  }
  async put(household: HouseholdRecord): Promise<HouseholdRecord> {
    const now = this.clock.now().toISOString();
    const previous = await this.get(household.householdId);
    const value = { ...previous, ...household, createdAt: previous?.createdAt ?? household.createdAt ?? now, updatedAt: now } as HouseholdRecord;
    await this.storage.put({ pk: householdPk(value.householdId), sk: householdProfileSk(), type: "household", data: value });
    await this.storage.put({
      pk: householdIndexPk(), sk: householdIndexSk(value.householdId), type: "household-index",
      data: { householdId: value.householdId, country: value.country ?? "", timeZone: value.timeZone ?? "", displayName: value.displayName ?? "" },
    });
    return value;
  }
  async list(): Promise<Array<{ householdId: string; country?: string; timeZone?: string; displayName?: string }>> {
    return (await this.storage.query(householdIndexPk(), { skPrefix: householdIndexPrefix() })).map((row) => row.data as { householdId: string; country?: string; timeZone?: string; displayName?: string });
  }
  async count(): Promise<number> { return (await this.list()).length; }
}
