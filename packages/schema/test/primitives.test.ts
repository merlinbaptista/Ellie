import { describe, expect, it } from "vitest";
import { isValidTimeZone, zE164, zHouseholdId, zLocalDate, zTimeZone } from "../src/primitives.js";

describe("schema primitives", () => {
  it("validates phone numbers, IDs, dates, and IANA zones", () => {
    expect(zE164.safeParse("+15551234567").success).toBe(true);
    expect(zE164.safeParse("555-1234").success).toBe(false);
    expect(zHouseholdId.safeParse("demo-blr").success).toBe(true);
    expect(zHouseholdId.safeParse("hh_abc-123").success).toBe(true);
    expect(zHouseholdId.safeParse("home").success).toBe(false);
    expect(zLocalDate.safeParse("2026-10-16").success).toBe(true);
    expect(zLocalDate.safeParse("16/10/2026").success).toBe(false);
    expect(zTimeZone.safeParse("Asia/Kolkata").success).toBe(true);
    expect(zTimeZone.safeParse("Mars/Base").success).toBe(false);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});
