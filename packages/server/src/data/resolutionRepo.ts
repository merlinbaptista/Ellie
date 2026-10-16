import type { Resolution } from "@ellie/schema";
import type { StorageAdapter } from "../adapters/storage/types.js";
import { householdPk, resolutionPrefix, resolutionSk } from "./keys.js";

export class ResolutionRepository {
  constructor(private readonly storage: StorageAdapter) {}
  async put(resolution: Resolution): Promise<Resolution> {
    const row = await this.storage.put({
      pk: householdPk(resolution.householdId),
      sk: resolutionSk(resolution.itemId, resolution.localDate, resolution.resolutionId),
      type: "resolution",
      data: resolution as unknown as Record<string, unknown>,
    });
    return row.data as unknown as Resolution;
  }
  async list(householdId: string, itemId?: string): Promise<Resolution[]> {
    const rows = await this.storage.query(householdPk(householdId), { skPrefix: resolutionPrefix(itemId), descending: true });
    return rows.map((row) => row.data as unknown as Resolution);
  }
}