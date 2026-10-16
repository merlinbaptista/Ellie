import { z } from "zod";
import { Confidence } from "./enums.js";
import { zHouseholdId, zIsoUtc, zItemId, zLocalDate } from "./primitives.js";

export const Prediction = z.object({
  schemaVersion: z.literal(1),
  householdId: zHouseholdId,
  itemId: zItemId,
  nextDueLocal: zLocalDate,
  nextDueUtc: zIsoUtc,
  remindOnLocal: zLocalDate,
  basis: z.enum(["household_average", "single_interval", "region_default", "user_override"]),
  intervalDays: z.number().positive(),
  sampleSize: z.number().int().nonnegative(),
  rulesApplied: z.array(z.object({ ruleId: z.string(), description: z.string(), shiftedByDays: z.number().int() }).strict()),
  confidence: Confidence,
  scheduleId: z.string().optional(),
  computedAt: zIsoUtc,
}).strict();
export type Prediction = z.infer<typeof Prediction>;
