import { z } from "zod";
import { EventSource, TempUnit, VolumeUnit, WeightUnit } from "./enums.js";
import { zCountry, zCurrency, zE164, zHouseholdId, zIsoUtc, zLanguageTag, zTimeZone } from "./primitives.js";

const unitsSchema = z.object({ volume: VolumeUnit, temp: TempUnit, weight: WeightUnit, currency: zCurrency }).strict();
const contactSchema = z.object({
  phone: zE164.optional(),
  email: z.string().email().optional(),
  consentGivenAt: zIsoUtc,
  consentSource: EventSource,
}).strict().refine((contact) => Boolean(contact.phone || contact.email), "Contact requires a phone or email");

export const Household = z.object({
  schemaVersion: z.literal(1),
  householdId: zHouseholdId,
  displayName: z.string().max(60).optional(),
  country: zCountry,
  region: z.string().max(80).optional().refine((value) => !value || !/\d+[,\s]+\w+\s+(street|st|road|rd|lane|ln|avenue|ave|cross|main)\b/i.test(value), "Only city or postcode, never a full address"),
  timeZone: zTimeZone,
  language: zLanguageTag,
  phoneLanguage: zLanguageTag.optional(),
  units: unitsSchema,
  regionPackId: z.string(),
  regionPackVersion: z.string(),
  contact: contactSchema.optional(),
  askedFields: z.array(z.string()),
  createdAt: zIsoUtc,
  updatedAt: zIsoUtc,
}).strict();
export type Household = z.infer<typeof Household>;
export const HouseholdDraft = Household.partial().required({ householdId: true });
export type HouseholdDraft = z.infer<typeof HouseholdDraft>;
export const REQUIRED_HOUSEHOLD_FIELDS = ["country", "timeZone", "language"] as const;
export function missingHouseholdFields(draft: Partial<Household> & { householdId: string }): string[] {
  return REQUIRED_HOUSEHOLD_FIELDS.filter((field) => !draft[field]);
}
