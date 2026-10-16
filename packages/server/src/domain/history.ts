import { addDays, diffDays, toLocalDate, type HomeEvent, type EventType } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { relativePhrase } from "./speech.js";

export interface IntervalStats {
  action: EventType;
  sampleSize: number;
  intervalsDays: number[];
  averageDays: number | null;
  medianDays: number | null;
  lastLocalDate: string | null;
  daysSinceLast: number | null;
  approximateCount: number;
}
export interface TimelineEntry extends HomeEvent {
  itemName: string;
  icon?: string;
  when: string;
}
export interface TimelineOptions { itemId?: string; period?: "30d" | "90d" | "1y" | "all"; types?: EventType[] }

export function intervalStats(events: HomeEvent[], action: EventType, todayLocal: string): IntervalStats {
  const selected = events.filter((event) => event.type === action).sort((a, b) => a.localDate.localeCompare(b.localDate));
  const unique: HomeEvent[] = [];
  for (const event of selected) {
    if (unique.at(-1)?.localDate === event.localDate) continue;
    unique.push(event);
  }
  const intervals: Array<{ days: number; approximate: boolean }> = [];
  for (let index = 1; index < unique.length; index++) {
    const previous = unique[index - 1]!;
    const current = unique[index]!;
    const days = diffDays(previous.localDate, current.localDate);
    if (days < 3) continue;
    intervals.push({ days, approximate: previous.dateIsApproximate || current.dateIsApproximate });
  }
  const values = intervals.map((interval) => interval.days);
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length ? sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2 : null;
  const lastLocalDate = unique.at(-1)?.localDate ?? null;
  return {
    action,
    sampleSize: values.length,
    intervalsDays: values,
    averageDays: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null,
    medianDays: median,
    lastLocalDate,
    daysSinceLast: lastLocalDate ? diffDays(lastLocalDate, todayLocal) : null,
    approximateCount: intervals.filter((interval) => interval.approximate).length,
  };
}

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
