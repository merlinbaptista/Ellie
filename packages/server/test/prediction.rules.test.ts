import { describe, expect, it } from "vitest";
import { applyPredictionRules } from "../src/prediction/rules.js";

describe("prediction regional rules", () => {
  it("applies lead time and safety buffer before the due date", () => {
    const result = applyPredictionRules({ todayLocal: "2026-10-01", lastEventLocal: "2026-10-01", intervalDays: 40, leadTimeDays: 3, safetyBufferDays: 2 });
    expect(result.nextDueLocal).toBe("2026-11-10");
    expect(result.remindOnLocal).toBe("2026-11-05");
    expect(result.rulesApplied.map((rule) => rule.ruleId)).toEqual(["lead_time", "safety_buffer"]);
  });

  it("enforces the LPG minimum gap including a later booking", () => {
    const initial = applyPredictionRules({ todayLocal: "2026-10-01", lastEventLocal: "2026-10-01", intervalDays: 20, leadTimeDays: 0, safetyBufferDays: 0, minDaysBetweenBookings: 25 });
    expect(initial.bookingOpensLocal).toBe("2026-10-26");
    expect(initial.remindOnLocal).toBe("2026-10-26");
    expect(initial.rulesApplied.at(-1)?.ruleId).toBe("min_booking_gap");
    const booked = applyPredictionRules({ todayLocal: "2026-10-01", lastEventLocal: "2026-10-01", lastBookedLocal: "2026-10-10", intervalDays: 40, leadTimeDays: 3, safetyBufferDays: 2, minDaysBetweenBookings: 25 });
    expect(booked.bookingOpensLocal).toBe("2026-11-04");
  });

  it("moves preferred service into a preferred month and clamps reminders out of the past", () => {
    const preferred = applyPredictionRules({ todayLocal: "2026-10-16", lastEventLocal: "2026-04-15", intervalDays: 365, leadTimeDays: 0, safetyBufferDays: 0, preferredMonths: [2, 3] });
    expect(preferred.nextDueLocal).toBe("2027-03-01");
    expect(preferred.rulesApplied.at(-1)?.ruleId).toBe("preferred_months");
    const today = applyPredictionRules({ todayLocal: "2026-10-16", lastEventLocal: "2026-08-01", intervalDays: 40, leadTimeDays: 10, safetyBufferDays: 10 });
    expect(today.remindOnLocal).toBe("2026-10-16");
  });
});
