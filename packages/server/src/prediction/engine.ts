import { Prediction, localDateToUtc, type HomeEvent, type Item, type Prediction as PredictionRecord, type RegionPack } from "@ellie/schema";
import type { ResolvedRegionPack } from "@ellie/schema";
import { predictionConfidence } from "./confidence.js";
import { predictionExplanation } from "./explain.js";
import { estimateWeightedIntervals, intervalStats } from "./intervals.js";
import { applyPredictionRules } from "./rules.js";
import { predictionStatus } from "./status.js";

export interface PredictionInput {
  householdId: string;
  item: Item;
  component?: { key: string; displayName: string; defaultIntervalDays: number };
  catalog?: RegionPack["catalog"][string];
  events: HomeEvent[];
  pack: ResolvedRegionPack;
  timeZone: string;
  todayLocal: string;
  computedAt: string;
  windowDays?: number;
}

function selectAction(input: PredictionInput): HomeEvent["type"] {
  if (input.catalog?.recurring) return input.catalog.recurring.action;
  const counts = new Map<string, number>();
  for (const event of input.events) if (["changed", "serviced"].includes(event.type)) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] as HomeEvent["type"] ?? "changed";
}

function actionEventsFor(input: PredictionInput, action: HomeEvent["type"]): HomeEvent[] {
  if (!input.component) return input.events.filter((event) => event.type === action && !event.component);
  return input.events.filter((event) => event.component === input.component!.key && (event.type === action || event.type === "changed"));
}

export function computePrediction(input: PredictionInput): PredictionRecord {
  const action = selectAction(input);
  const actionEvents = actionEventsFor(input, action);
  const mostRecent = [...actionEvents].sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
  const defaultInterval = input.item.intervalOverrideDays ?? input.component?.defaultIntervalDays ?? input.catalog?.recurring?.defaultIntervalDays;
  const stats = intervalStats(actionEvents, action, input.todayLocal);
  const estimates = estimateWeightedIntervals(actionEvents, action, input.component?.key);
  const customEventCount = actionEvents.length;
  const unknown = !mostRecent || (!input.catalog && customEventCount < 2 && !input.item.intervalOverrideDays);

  if (unknown || !defaultInterval && estimates.estimate === null && !input.component) {
    return Prediction.parse({
      schemaVersion: 1,
      householdId: input.householdId,
      itemId: input.item.itemId,
      ...(input.component ? { component: input.component.key } : {}),
      nextDueLocal: null,
      nextDueUtc: null,
      remindOnLocal: null,
      lastEventLocal: mostRecent?.localDate ?? null,
      daysUntilDue: 0,
      status: "unknown",
      explanation: "I'll learn its rhythm after the next one",
      basis: "region_default",
      intervalDays: 0,
      sampleSize: estimates.intervalsDays.length,
      rulesApplied: [],
      confidence: "low",
      computedAt: input.computedAt,
    });
  }

  let basis: PredictionRecord["basis"];
  let intervalDays: number;
  const sampleSize = estimates.intervalsDays.length;
  if (input.item.intervalOverrideDays) {
    basis = "user_override";
    intervalDays = input.item.intervalOverrideDays;
  } else if (sampleSize >= 2 && estimates.estimate !== null) {
    basis = "household_average";
    intervalDays = estimates.estimate;
  } else if (sampleSize === 1) {
    basis = "single_interval";
    intervalDays = estimates.intervalsDays[0]!;
  } else if (input.component && actionEvents.length > 0) {
    basis = "component_default";
    intervalDays = input.component.defaultIntervalDays;
  } else if (actionEvents.length > 0 && defaultInterval) {
    basis = "region_default";
    intervalDays = defaultInterval;
  } else if (input.component) {
    basis = "component_default";
    intervalDays = input.component.defaultIntervalDays;
  } else {
    return Prediction.parse({
      schemaVersion: 1, householdId: input.householdId, itemId: input.item.itemId,
      nextDueLocal: null, nextDueUtc: null, remindOnLocal: null, lastEventLocal: mostRecent?.localDate ?? null,
      daysUntilDue: 0, status: "unknown", explanation: "I'll learn its rhythm after the next one",
      basis: "region_default", intervalDays: 0, sampleSize, rulesApplied: [], confidence: "low", computedAt: input.computedAt,
    });
  }

  const rulesApplied = [] as ReturnType<typeof applyPredictionRules>["rulesApplied"];
  if (defaultInterval && basis !== "user_override") {
    const clamped = Math.max(Math.round(defaultInterval * 0.25), Math.min(Math.round(defaultInterval * 4), intervalDays));
    if (clamped !== intervalDays) {
      rulesApplied.push({ ruleId: "clamp_interval", description: "A history interval was outside the expected range", shiftedByDays: clamped - intervalDays });
      intervalDays = clamped;
    }
  }
  if (estimates.droppedOutliers) rulesApplied.push({ ruleId: "outlier_drop", description: `${estimates.droppedOutliers} unusual interval${estimates.droppedOutliers === 1 ? " was" : "s were"} excluded`, shiftedByDays: 0 });
  const lastBooked = [...input.events].filter((event) => event.type === "booked").sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
  const dates = applyPredictionRules({
    todayLocal: input.todayLocal,
    lastEventLocal: mostRecent!.localDate,
    intervalDays,
    leadTimeDays: input.component ? 0 : input.catalog?.recurring?.leadTimeDays ?? 0,
    safetyBufferDays: input.component ? 0 : input.catalog?.recurring?.safetyBufferDays ?? 0,
    ...(!input.component && input.catalog?.recurring?.minDaysBetweenBookings ? { minDaysBetweenBookings: input.catalog.recurring.minDaysBetweenBookings } : {}),
    ...(lastBooked ? { lastBookedLocal: lastBooked.localDate } : {}),
    ...(!input.component && input.catalog?.recurring?.preferredMonths ? { preferredMonths: input.catalog.recurring.preferredMonths } : {}),
    ...(input.component ? { component: true } : {}),
  });
  rulesApplied.push(...dates.rulesApplied);
  const { status, daysUntilDue } = predictionStatus(input.todayLocal, dates.nextDueLocal, dates.remindOnLocal, input.windowDays);
  const approximateCount = stats.approximateCount;
  const confidence = predictionConfidence({ basis, intervals: estimates.intervalsDays, approximateCount });
  const explanation = predictionExplanation({
    basis,
    intervalDays,
    sampleSize,
    displayName: input.catalog?.displayName ?? input.item.name,
    countryName: input.pack.name,
    ...(input.component ? { componentName: input.component.displayName } : {}),
  }).slice(0, 200);
  return Prediction.parse({
    schemaVersion: 1,
    householdId: input.householdId,
    itemId: input.item.itemId,
    ...(input.component ? { component: input.component.key } : {}),
    nextDueLocal: dates.nextDueLocal,
    nextDueUtc: localDateToUtc(dates.nextDueLocal, input.timeZone, 9),
    remindOnLocal: dates.remindOnLocal,
    ...(dates.bookingOpensLocal ? { bookingOpensLocal: dates.bookingOpensLocal } : {}),
    lastEventLocal: mostRecent!.localDate,
    daysUntilDue,
    status,
    explanation,
    basis,
    intervalDays,
    sampleSize,
    rulesApplied,
    confidence,
    computedAt: input.computedAt,
  });
}
