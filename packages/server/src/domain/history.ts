import { addDays, toLocalDate, type HomeEvent, type EventType } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { relativePhrase } from "./speech.js";
export { intervalStats } from "../prediction/intervals.js";
export type { IntervalStats } from "../prediction/intervals.js";
export interface TimelineEntry extends HomeEvent {
  itemName: string;
  icon?: string;
  when: string;
}
export interface TimelineOptions { itemId?: string; period?: "30d" | "90d" | "1y" | "all"; types?: EventType[] }

export async function getTimeline(householdId: string, options: TimelineOptions, ctx: AppContext): Promise<TimelineEntry[]> {
  const household = await ctx.repositories.households.get(householdId);
  if (!household) return [];
  const pack = ctx.regions.get(household.regionPackId ?? "DEFAULT");
  const today = toLocalDate(ctx.clock.now().toISOString(), household.timeZone ?? pack.locale.defaultTimeZone);
  const periodDays = options.period === "30d" ? 30 : options.period === "90d" ? 90 : options.period === "1y" || !options.period ? 365 : undefined;
  const earliest = periodDays ? addDays(today, -periodDays) : undefined;
  const events = await ctx.repositories.events.list(householdId, options.itemId);
  const items = new Map((await ctx.repositories.items.list(householdId)).map((item) => [item.itemId, item]));
  return events
    .filter((event) => !earliest || event.localDate >= earliest)
    .filter((event) => !options.types?.length || options.types.includes(event.type))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, options.itemId ? 1000 : 50)
    .map((event) => {
      const item = items.get(event.itemId);
      return { ...event, itemName: item?.name ?? "Home item", ...(pack.catalog[item?.catalogKey ?? ""]?.icon ? { icon: pack.catalog[item!.catalogKey]!.icon } : {}), when: relativePhrase(event.localDate, today) };
    });
}
