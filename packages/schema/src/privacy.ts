import { z } from "zod";
import { EventSource } from "./enums.js";
import { zCountry, zHouseholdId, zIsoUtc, zItemId, zLocalDate } from "./primitives.js";

export const ConsentPurpose = z.enum(["phone_messages", "email_messages", "reminders"]);
export const ConsentRecord = z.object({
  schemaVersion: z.literal(1),
  householdId: zHouseholdId,
  purpose: ConsentPurpose,
  action: z.enum(["granted", "withdrawn"]),
  channelMasked: z.string().optional(),
  source: EventSource,
  at: zIsoUtc,
  note: z.string().max(120).optional(),
}).strict();
export type ConsentRecord = z.infer<typeof ConsentRecord>;

export const DataInventory = z.object({
  householdId: zHouseholdId,
  profile: z.object({ country: zCountry.optional(), region: z.string().optional(), timeZone: z.string(), language: z.string(), contactMasked: z.string().optional() }).strict(),
  items: z.array(z.object({ itemId: zItemId, name: z.string(), eventCount: z.number().int().nonnegative(), firstLocal: zLocalDate.nullable(), lastLocal: zLocalDate.nullable(), hasWarranty: z.boolean(), nextDueLocal: zLocalDate.nullable() }).strict()),
  counts: z.object({ items: z.number().int().nonnegative(), events: z.number().int().nonnegative(), resolutions: z.number().int().nonnegative(), reminders: z.number().int().nonnegative(), outbox: z.number().int().nonnegative(), diagnoses: z.number().int().nonnegative(), links: z.number().int().nonnegative(), consentRecords: z.number().int().nonnegative() }).strict(),
  consent: z.array(ConsentRecord),
  sharedWith: z.array(z.object({ service: z.string(), purpose: z.string(), dataSent: z.string() }).strict()),
  retention: z.array(z.object({ data: z.string(), keptFor: z.string() }).strict()),
  generatedAt: zIsoUtc,
}).strict();
export type DataInventory = z.infer<typeof DataInventory>;

export const ForgetReceipt = z.object({
  scope: z.enum(["item", "household"]),
  householdId: zHouseholdId,
  itemId: zItemId.optional(),
  deleted: z.record(z.string(), z.number().int().nonnegative()),
  externalCleanup: z.array(z.object({ service: z.string(), ok: z.boolean(), detail: z.string().optional() }).strict()),
  at: zIsoUtc,
}).strict();
export type ForgetReceipt = z.infer<typeof ForgetReceipt>;

export const PrivacyExport = z.object({
  profile: z.record(z.string(), z.unknown()),
  items: z.array(z.unknown()),
  events: z.array(z.unknown()),
  predictions: z.array(z.unknown()),
  resolutions: z.array(z.unknown()),
  consent: z.array(ConsentRecord),
  inventory: DataInventory,
}).strict();
export type PrivacyExport = z.infer<typeof PrivacyExport>;