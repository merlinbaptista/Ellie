import { describe, expect, it } from "vitest";
import { createBuiltInRegistry, addDays, diffDays, formatLocalDate, isInSeason, localDateToUtc, parseRelativeDate, toLocalDate } from "../src/index.js";

const india = createBuiltInRegistry().get("IN");
const us = createBuiltInRegistry().get("US");
describe("local date helpers", () => {
  it("converts instants and local dates across time zones and DST", () => {
    expect(toLocalDate("2026-10-15T20:00:00Z", "Asia/Kolkata")).toBe("2026-10-16");
    expect(localDateToUtc("2026-11-20", "Asia/Kolkata")).toBe("2026-11-20T03:30:00.000Z");
    expect(localDateToUtc("2026-03-08", "America/Chicago")).toBe("2026-03-08T14:00:00.000Z");
    expect(localDateToUtc("2026-11-01", "America/Chicago")).toBe("2026-11-01T15:00:00.000Z");
    expect(() => localDateToUtc("2026-02-30", "UTC")).toThrow();
    expect(() => localDateToUtc("2026-01-01", "UTC", 25)).toThrow();
  });

  it("does calendar arithmetic and parses relative phrases", () => {
    expect(addDays("2026-10-16", -1)).toBe("2026-10-15");
    expect(diffDays("2026-10-16", "2026-10-20")).toBe(4);
    expect(parseRelativeDate("about five weeks ago", "2026-10-16")).toEqual({ localDate: "2026-09-11", approximate: true });
    expect(parseRelativeDate("yesterday", "2026-10-16")?.localDate).toBe("2026-10-15");
    expect(parseRelativeDate("3 days ago", "2026-10-16")?.localDate).toBe("2026-10-13");
    expect(parseRelativeDate("a couple of weeks ago", "2026-10-16")?.localDate).toBe("2026-10-02");
    expect(parseRelativeDate("last week", "2026-10-16")?.localDate).toBe("2026-10-09");
    expect(parseRelativeDate("last month", "2026-10-16")?.localDate).toBe("2026-09-16");
    expect(parseRelativeDate("last December", "2026-10-16")?.localDate).toBe("2025-12-01");
    expect(parseRelativeDate("in March", "2026-10-16")?.localDate).toBe("2026-03-01");
    expect(parseRelativeDate("this morning", "2026-10-16")?.localDate).toBe("2026-10-16");
    expect(parseRelativeDate("two days back", "2026-10-16")?.localDate).toBe("2026-10-14");
    expect(parseRelativeDate("14 March", "2026-10-16")?.localDate).toBe("2026-03-14");
    expect(parseRelativeDate("March 14", "2026-10-16")?.localDate).toBe("2026-03-14");
    expect(parseRelativeDate("14/03", "2026-10-16", { dateOrder: "DMY" })?.localDate).toBe("2026-03-14");
    expect(parseRelativeDate("3/14", "2026-10-16", { dateOrder: "MDY" })?.localDate).toBe("2026-03-14");
    expect(parseRelativeDate("till December next year", "2026-10-16", { allowFuture: true })?.localDate).toBe("2027-12-01");
    expect(parseRelativeDate("2027-01-01", "2026-10-16")).toBeNull();
    expect(parseRelativeDate("today", "2026-10-16")?.approximate).toBe(false);
    expect(parseRelativeDate("2026-10-01", "2026-10-16")?.localDate).toBe("2026-10-01");
    expect(parseRelativeDate("sometime", "2026-10-16")).toBeNull();
  });

  it("formats local dates and handles seasons crossing calendar years", () => {
    expect(formatLocalDate("2026-11-20", india)).toBe("Friday, 20 November");
    expect(formatLocalDate("2026-11-20", us)).toBe("Friday, November 20");
    expect(formatLocalDate("2026-11-20", us, "short")).toContain("11/20");
    expect(isInSeason("2026-01-01", { startMonth: 11, endMonth: 3 })).toBe(true);
    expect(isInSeason("2026-07-01", { startMonth: 11, endMonth: 3 })).toBe(false);
    expect(isInSeason("2026-04-01", { startMonth: 3, endMonth: 6 })).toBe(true);
  });
});
