import { z } from "zod";
import { Channel, ItemKind } from "./enums.js";
import { zHouseholdId, zIsoUtc, zItemId, zLocalDate } from "./primitives.js";
import { diffDays } from "./utils/dates.js";

export const Item = z.object({
  schemaVersion: z.literal(1),
  itemId: zItemId,
  householdId: zHouseholdId,
  catalogKey: z.string(),
  kind: ItemKind,
  name: z.string().max(60),
  brand: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  purchaseDate: zLocalDate.optional(),
  warrantyUntil: zLocalDate.optional(),
  providerKey: z.string().optional(),
  customProvider: z.object({ name: z.string(), channel: Channel, to: z.string().optional(), url: z.string().url().optional(), messageTemplate: z.string().optional() }).strict().optional(),
  intervalOverrideDays: z.number().int().min(1).max(3650).optional(),
  active: z.boolean().default(true),
  createdAt: zIsoUtc,
  updatedAt: zIsoUtc,
}).strict().superRefine((item, ctx) => {
  if (item.purchaseDate && item.warrantyUntil && diffDays(item.purchaseDate, item.warrantyUntil) < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["warrantyUntil"], message: "Warranty cannot end before purchase" });
  }
});
export type Item = z.infer<typeof Item>;
export function warrantyStatus(item: Pick<Item, "purchaseDate" | "warrantyUntil">, todayLocal: string): { status: "valid" | "expired" | "unknown"; daysLeft?: number } {
  if (!item.warrantyUntil) return { status: "unknown" };
  const daysLeft = diffDays(todayLocal, item.warrantyUntil);
  return daysLeft >= 0 ? { status: "valid", daysLeft } : { status: "expired", daysLeft };
}
