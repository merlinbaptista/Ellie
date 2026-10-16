import { diffDays, type EventType, type HomeEvent } from "@ellie/schema";

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
export interface WeightedIntervalEstimate {
  intervalsDays: number[];
  approximateIntervals: boolean[];
  estimate: number | null;
  droppedOutliers: number;
}

export function intervalStats(events: HomeEvent[], action: EventType, todayLocal: string): IntervalStats {
  const selected = events.filter((event) => event.type === action).sort((a, b) => a.localDate.localeCompare(b.localDate));
  const unique: HomeEvent[] = [];
  for (const event of selected) if (unique.at(-1)?.localDate !== event.localDate) unique.push(event);
  const intervals: Array<{ days: number; approximate: boolean }> = [];
  for (let index = 1; index < unique.length; index++) {
    const previous = unique[index - 1]!;
    const current = unique[index]!;
    const days = diffDays(previous.localDate, current.localDate);
    if (days < 3) continue;
    intervals.push({ days, approximate: previous.dateIsApproximate || current.dateIsApproximate });
  }
  const values = intervals.map((interval) => interval.days);
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianDays = sorted.length ? (sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2) : null;
  const lastLocalDate = unique.at(-1)?.localDate ?? null;
  return {
    action,
    sampleSize: values.length,
    intervalsDays: values,
    averageDays: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null,
    medianDays,
    lastLocalDate,
    daysSinceLast: lastLocalDate ? diffDays(lastLocalDate, todayLocal) : null,
    approximateCount: intervals.filter((interval) => interval.approximate).length,
  };
}

export function estimateWeightedIntervals(events: HomeEvent[], action: EventType, component?: string): WeightedIntervalEstimate {
  const selected = events
    .filter((event) => event.type === action || (component !== undefined && event.type === "changed"))
    .filter((event) => component === undefined ? event.component === undefined : event.component === component)
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
  const unique: HomeEvent[] = [];
  for (const event of selected) if (unique.at(-1)?.localDate !== event.localDate) unique.push(event);
  const samples: Array<{ days: number; approximate: boolean }> = [];
  for (let index = 1; index < unique.length; index++) {
    const previous = unique[index - 1]!;
    const current = unique[index]!;
    const days = diffDays(previous.localDate, current.localDate);
    if (days >= 3) samples.push({ days, approximate: previous.dateIsApproximate || current.dateIsApproximate });
  }
  const sorted = samples.map((sample) => sample.days).sort((left, right) => left - right);
  const median = sorted.length ? sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2 : null;
  const filtered = samples.filter((sample) => samples.length < 4 || (sample.days <= median! * 2 && sample.days >= median! * 0.5));
  const droppedOutliers = samples.length - filtered.length;
  let numerator = 0;
  let denominator = 0;
  filtered.forEach((sample, index) => {
    const weight = (index + 1) * (sample.approximate ? 0.5 : 1);
    numerator += sample.days * weight;
    denominator += weight;
  });
  return {
    intervalsDays: filtered.map((sample) => sample.days),
    approximateIntervals: filtered.map((sample) => sample.approximate),
    estimate: denominator ? Math.round(numerator / denominator) : null,
    droppedOutliers,
  };
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}
