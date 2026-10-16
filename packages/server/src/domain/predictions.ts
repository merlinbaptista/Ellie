import { computePrediction, type PredictionInput } from "../prediction/engine.js";
import { toLocalDate } from "@ellie/schema";
import type { Item, Prediction } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { loadHouseholdSnapshot } from "./snapshot.js";
import { schedulePredictionReminder, cancelItemReminder, cancelDeliveryCheck, scheduleDeliveryCheck } from "./reminders.js";

export interface ItemPredictions {
  item: Item;
  main: Prediction | null;
  components: Prediction[];
  mostUrgent: Prediction | null;
}
function urgency(prediction: Prediction): number {
  return ({ overdue: 0, due: 1, due_soon: 2, ok: 3, unknown: 4 })[prediction.status];
}
function mostUrgent(predictions: Prediction[]): Prediction | null {
  return [...predictions].sort((left, right) => urgency(left) - urgency(right) || left.daysUntilDue - right.daysUntilDue)[0] ?? null;
}

export async function recomputeItem(ctx: AppContext, householdId: string, itemId: string, options: { schedule?: boolean } = {}): Promise<ItemPredictions> {
  const snapshot = await loadHouseholdSnapshot(householdId, ctx);
  const item = snapshot.items.find((candidate) => candidate.itemId === itemId);
  if (!item) throw new Error(`Unknown item ${itemId} in household ${householdId}`);
  const household = snapshot.profile;
  const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
  const timeZone = household?.timeZone ?? pack.locale.defaultTimeZone;
  const todayLocal = toLocalDate(ctx.clock.now().toISOString(), timeZone);
  const events = snapshot.eventsByItem.get(itemId) ?? [];
  const catalog = pack.catalog[item.catalogKey];
  const common: Omit<PredictionInput, "component"> = {
    householdId,
    item,
    ...(catalog ? { catalog } : {}),
    events,
    pack,
    timeZone,
    todayLocal,
    computedAt: ctx.clock.now().toISOString(),
  };
  const main = computePrediction(common);
  const components: Prediction[] = [];
  if (catalog) {
    for (const component of catalog.components) {
      if (!events.some((event) => event.component === component.key)) continue;
      const prediction = computePrediction({ ...common, component: { key: component.key, displayName: component.displayName, defaultIntervalDays: component.defaultIntervalDays } });
      components.push(prediction);
    }
  }
  let persisted: Prediction[] = [];
  if (options.schedule !== false) {
    const latestBooking = [...events].filter((event) => event.type === "booked").sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
    const newerThanBooking = latestBooking && events.some((event) =>
      event.timestamp > latestBooking.timestamp && ["changed", "serviced", "delivered"].includes(event.type),
    );
    if (latestBooking && !newerThanBooking) {
      await cancelItemReminder(ctx, householdId, itemId);
      persisted = await Promise.all([main, ...components].map(async (prediction) => {
        const unscheduled = { ...prediction, scheduleId: undefined };
        return ctx.repositories.predictions.put(householdId, unscheduled);
      }));
    } else {
      for (const prediction of [main, ...components]) persisted.push(await schedulePredictionReminder(ctx, prediction, item, household, pack));
    }
    if (events.some((event) => event.type === "changed" || event.type === "delivered")) await cancelDeliveryCheck(ctx, householdId, itemId);
    const booked = [...events].filter((event) => event.type === "booked").sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
    const hasDelivery = booked && events.some((event) => event.type === "delivered" && event.relatedEventId === booked.eventId);
    const changedAfterBooking = booked && events.some((event) => event.type === "changed" && event.localDate >= booked.localDate && event.eventId !== booked.eventId);
    if (booked && !hasDelivery && !changedAfterBooking) await scheduleDeliveryCheck(ctx, householdId, item, booked);
  } else {
    persisted = await Promise.all([main, ...components].map(async (prediction) => {
      const previous = await ctx.repositories.predictions.get(householdId, itemId, prediction.component);
      const isStillScheduled = previous?.scheduleId && previous.lastEventLocal === prediction.lastEventLocal &&
        ["ok", "due_soon"].includes(prediction.status) && prediction.remindOnLocal && prediction.remindOnLocal > todayLocal;
      const value = isStillScheduled ? { ...prediction, scheduleId: previous.scheduleId } : { ...prediction, scheduleId: undefined };
      return ctx.repositories.predictions.put(householdId, value);
    }));
  }
  const savedMain = persisted[0] ?? main;
  const savedComponents = persisted.slice(1);
  return { item, main: savedMain, components: savedComponents, mostUrgent: mostUrgent([savedMain, ...savedComponents]) };
}

export async function recomputeHousehold(ctx: AppContext, householdId: string, options: { schedule?: boolean } = {}): Promise<ItemPredictions[]> {
  const snapshot = await loadHouseholdSnapshot(householdId, ctx);
  const results: ItemPredictions[] = [];
  for (const item of snapshot.items.filter((candidate) => candidate.active)) results.push(await recomputeItem(ctx, householdId, item.itemId, options));
  return results;
}

export async function predictItem(ctx: AppContext, householdId: string, itemId: string): Promise<ItemPredictions> {
  return recomputeItem(ctx, householdId, itemId);
}
