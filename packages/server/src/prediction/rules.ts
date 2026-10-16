import { addDays, diffDays } from "@ellie/schema";

export interface AppliedPredictionRule { ruleId: string; description: string; shiftedByDays: number }
export interface PredictionDates { nextDueLocal: string; remindOnLocal: string; bookingOpensLocal?: string; rulesApplied: AppliedPredictionRule[] }
export function applyPredictionRules(input: {
  todayLocal: string;
  lastEventLocal: string;
  intervalDays: number;
  leadTimeDays: number;
  safetyBufferDays: number;
  minDaysBetweenBookings?: number;
  lastBookedLocal?: string;
  preferredMonths?: number[];
  component?: boolean;
}): PredictionDates {
  const rulesApplied: AppliedPredictionRule[] = [];
  let nextDueLocal = addDays(input.lastEventLocal, input.intervalDays);
  let remindOnLocal = addDays(nextDueLocal, -input.leadTimeDays);
  if (input.leadTimeDays) rulesApplied.push({ ruleId: "lead_time", description: `Delivery usually takes ${input.leadTimeDays} days`, shiftedByDays: -input.leadTimeDays });
  remindOnLocal = addDays(remindOnLocal, -input.safetyBufferDays);
  if (input.safetyBufferDays) rulesApplied.push({ ruleId: "safety_buffer", description: `${input.safetyBufferDays} days of buffer`, shiftedByDays: -input.safetyBufferDays });
  let bookingOpensLocal: string | undefined;
  if (input.minDaysBetweenBookings) {
    bookingOpensLocal = addDays(input.lastEventLocal, input.minDaysBetweenBookings);
    if (input.lastBookedLocal) {
      const fromBooking = addDays(input.lastBookedLocal, input.minDaysBetweenBookings);
      if (fromBooking > bookingOpensLocal) bookingOpensLocal = fromBooking;
    }
    if (bookingOpensLocal > remindOnLocal) {
      const prior = remindOnLocal;
      remindOnLocal = bookingOpensLocal;
      rulesApplied.push({ ruleId: "min_booking_gap", description: `Bookings open ${input.minDaysBetweenBookings} days after the last one`, shiftedByDays: diffDays(prior, remindOnLocal) });
    }
  }
  if (!input.component && input.preferredMonths?.length && !input.preferredMonths.includes(Number(nextDueLocal.slice(5, 7)))) {
    const dueYear = Number(nextDueLocal.slice(0, 4));
    const candidates = [dueYear - 1, dueYear, dueYear + 1].flatMap((year) => input.preferredMonths!
      .map((month) => `${year}-${String(month).padStart(2, "0")}-01`))
      .filter((candidate) => candidate >= input.todayLocal && candidate <= nextDueLocal)
      .sort();
    const preferred = candidates.at(-1);
    if (preferred && diffDays(preferred, nextDueLocal) <= 90 && preferred < nextDueLocal) {
      const original = nextDueLocal;
      nextDueLocal = preferred;
      remindOnLocal = addDays(nextDueLocal, -(input.leadTimeDays + input.safetyBufferDays));
      rulesApplied.push({ ruleId: "preferred_months", description: "Service is best before the preferred season", shiftedByDays: -diffDays(nextDueLocal, original) });
    }
  }
  if (remindOnLocal < input.todayLocal) remindOnLocal = input.todayLocal;
  return { nextDueLocal, remindOnLocal, ...(bookingOpensLocal ? { bookingOpensLocal } : {}), rulesApplied };
}
