import type { Item } from "@ellie/schema";
import type { Clock } from "../lib/clock.js";
import type { StorageAdapter } from "../adapters/storage/types.js";
import { householdPk, itemPrefix, itemSk } from "./keys.js";

export class ItemRepository {
  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock) {}
  async get(householdId: string, itemId: string): Promise<Item | null> {
    const row = await this.storage.get(householdPk(householdId), itemSk(itemId));
    return row ? row.data as unknown as Item : null;
  }
  async put(item: Item): Promise<Item> {
    const previous = await this.get(item.householdId, item.itemId);
    const now = this.clock.now().toISOString();
    const value = { ...previous, ...item, createdAt: previous?.createdAt ?? item.createdAt ?? now, updatedAt: now } as Item;
    await this.storage.put({ pk: householdPk(item.householdId), sk: itemSk(item.itemId), type: "item", data: value });
    return value;
  }
  async list(householdId: string): Promise<Item[]> {
    const rows = await this.storage.query(householdPk(householdId), { skPrefix: itemPrefix() });
    return rows.map((row) => row.data as unknown as Item);
  }
}
