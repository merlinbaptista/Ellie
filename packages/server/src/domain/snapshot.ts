import type { HomeEvent, Item, Prediction } from "@ellie/schema";
import type { HouseholdRecord } from "../data/householdRepo.js";
import type { HouseholdAlias } from "../data/aliasRepo.js";
import type { AppContext } from "../context.js";
import { householdPk } from "../data/keys.js";

export interface HouseholdSnapshot {
  profile: HouseholdRecord | null;
  items: Item[];
  eventsByItem: Map<string, HomeEvent[]>;
  predictions: Prediction[];
  aliases: HouseholdAlias[];
}
export async function loadHouseholdSnapshot(householdId: string, ctx: AppContext): Promise<HouseholdSnapshot> {
  const rows = await ctx.storage.query(householdPk(householdId));
  const profileRow = rows.find((row) => row.type === "household");
  const items = rows.filter((row) => row.type === "item").map((row) => row.data as unknown as Item);
  const eventsByItem = new Map<string, HomeEvent[]>();
  for (const row of rows.filter((record) => record.type === "event")) {
    const event = row.data as unknown as HomeEvent;
    const events = eventsByItem.get(event.itemId) ?? [];
    events.push(event);
    eventsByItem.set(event.itemId, events);
  }
  for (const events of eventsByItem.values()) events.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  return {
    profile: profileRow ? profileRow.data as HouseholdRecord : null,
    items,
    eventsByItem,
    predictions: rows.filter((row) => row.type === "prediction").map((row) => row.data as unknown as Prediction),
    aliases: rows.filter((row) => row.type === "alias").map((row) => row.data as unknown as HouseholdAlias),
  };
}
