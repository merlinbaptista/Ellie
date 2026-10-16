import { z } from "zod";
import { Confidence } from "./enums.js";
import { zHouseholdId, zIsoUtc, zItemId, zLocalDate } from "./primitives.js";

export const Prediction = z.object({
  schemaVersion: z.literal(1),
  householdId: zHouseholdId,
  itemId: zItemId,
  component: z.string().optional(),
  nextDueLocal: zLocalDate.nullable(),
  nextDueUtc: zIsoUtc.nullable(),
  remindOnLocal: zLocalDate.nullable(),
  bookingOpensLocal: zLocalDate.optional(),
  lastEventLocal: zLocalDate.nullable(),
  daysUntilDue: z.number().int(),
  status: z.enum(["ok", "due_soon", "due", "overdue", "unknown"]),
  explanation: z.string().max(200),
  basis: z.enum(["household_average", "single_interval", "component_default", "region_default", "user_override"]),
  intervalDays: z.number().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  rulesApplied: z.array(z.object({ ruleId: z.string(), description: z.string(), shiftedByDays: z.number().int() }).strict()),
  confidence: Confidence,
  scheduleId: z.string().optional(),
  computedAt: zIsoUtc,
}).strict();
export type Prediction = z.infer<typeof Prediction>;
