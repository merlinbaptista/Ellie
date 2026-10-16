import { z } from "zod";
import { EventSource } from "./enums.js";
import { zEventId, zHouseholdId, zId, zIsoUtc, zItemId, zLocalDate, zMoney } from "./primitives.js";

export const Resolution = z.object({
  schemaVersion: z.literal(1),
  resolutionId: zId("res"),
  householdId: zHouseholdId,
  itemId: zItemId,
  symptomKey: z.string(),
  causeKey: z.string().optional(),
  component: z.string().optional(),
  cause: z.string().max(200),
  fix: z.string().max(500),
  cost: zMoney.optional(),
  confirmedBy: EventSource,
  byWhom: z.enum(["self", "technician", "warranty_service"]).optional(),
  localDate: zLocalDate,
  supportingEventIds: z.array(zEventId),
  createdAt: zIsoUtc,
}).strict();
export type Resolution = z.infer<typeof Resolution>;
