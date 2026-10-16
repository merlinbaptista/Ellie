import { z } from "zod";
import { Channel, EventSource, EventType } from "./enums.js";
import { zEventId, zHouseholdId, zIsoUtc, zItemId, zLocalDate, zMoney } from "./primitives.js";

export const HomeEvent = z.object({
  schemaVersion: z.literal(1),
  eventId: zEventId,
  householdId: zHouseholdId,
  itemId: zItemId,
  component: z.string().regex(/^[a-z0-9_]+$/).optional(),
  type: EventType,
  timestamp: zIsoUtc,
  localDate: zLocalDate,
  dateIsApproximate: z.boolean().default(false),
  recordedAt: zIsoUtc,
  source: EventSource,
  notes: z.string().max(500).optional(),
  cost: zMoney.optional(),
  symptom: z.object({ key: z.string(), description: z.string().optional() }).strict().optional(),
  booking: z.object({ providerKey: z.string().optional(), channel: Channel, reference: z.string().optional(), expectedDeliveryLocal: zLocalDate.optional() }).strict().optional(),
  relatedEventId: zEventId.optional(),
}).strict().superRefine((event, ctx) => {
  if (event.component && !["changed", "serviced", "symptom"].includes(event.type)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["component"], message: "Components are only allowed on changed, serviced, or symptom events" });
  if ((event.type === "symptom") !== Boolean(event.symptom)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["symptom"], message: "Symptom details are required only for symptom events" });
  if ((event.type === "cost") !== Boolean(event.cost)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cost"], message: "Cost is required only for cost events" });
  if (event.type === "booked" && !event.booking) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["booking"], message: "Booking details are required for booked events" });
});
export type HomeEvent = z.infer<typeof HomeEvent>;
