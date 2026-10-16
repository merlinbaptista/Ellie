import type { HomeEvent } from "@ellie/schema";
import type { StorageAdapter } from "../adapters/storage/types.js";
import { eventPrefix, eventSk, householdPk } from "./keys.js";

export class EventRepository {
  constructor(private readonly storage: StorageAdapter) {}
  async put(event: HomeEvent): Promise<HomeEvent> {
    const sk = eventSk(event.itemId, event.timestamp, event.eventId);
    const result = await this.storage.put({ pk: householdPk(event.householdId), sk, type: "event", data: event });
    return result.data as unknown as HomeEvent;
  }
  async list(householdId: string, itemId?: string, descending = false): Promise<HomeEvent[]> {
    const rows = await this.storage.query(householdPk(householdId), { skPrefix: eventPrefix(itemId), descending });
    return rows.map((row) => row.data as unknown as HomeEvent);
  }
}
