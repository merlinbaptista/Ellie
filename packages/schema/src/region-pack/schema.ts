import { z } from "zod";
import { Channel, DateOrder, EventType, ItemKind, SafetyCategory, TempUnit, VolumeUnit, WeightUnit } from "../enums.js";
import { zCountry, zCurrency, zLanguageTag, zRegionCode, zSourceRef, zTimeZone } from "../primitives.js";

const Question = z.object({ id: z.string(), text: z.string(), answers: z.array(z.string()).min(2) }).strict();
const Fix = z.object({
  summary: z.string().max(120),
  steps: z.array(z.string().max(200)).max(8).default([]),
  partsNeeded: z.array(z.string().max(60)).default([]),
  timeMinutes: z.number().int().positive().optional(),
  callProIf: z.array(z.string().max(160)).default([]),
  warrantyRelevant: z.boolean().default(false),
  source: zSourceRef,
}).strict();
const LikelyCause = z.object({
  key: z.string(),
  description: z.string(),
  relatedComponent: z.string().optional(),
  diy: z.boolean(),
  fix: Fix.optional(),
  evidenceHints: z.object({
    componentOverdue: z.string().optional(),
    answers: z.record(z.string(), z.record(z.string(), z.number())).default({}),
  }).strict().default({ answers: {} }),
}).strict().superRefine((cause, ctx) => {
  if (!cause.diy && cause.fix?.steps.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fix", "steps"], message: "Non-DIY causes cannot include steps" });
});
const Symptom = z.object({
  key: z.string(),
  aliases: z.array(z.string().toLowerCase()).min(1),
  questions: z.array(Question).default([]),
  likelyCauses: z.array(LikelyCause).default([]),
  safety: SafetyCategory.optional(),
  followUpOnly: z.boolean().default(false),
}).strict();
const Recurring = z.object({
  action: EventType,
  defaultIntervalDays: z.number().int().positive(),
  leadTimeDays: z.number().int().nonnegative().default(0),
  safetyBufferDays: z.number().int().nonnegative().default(0),
  minDaysBetweenBookings: z.number().int().positive().optional(),
  preferredMonths: z.array(z.number().int().min(1).max(12)).optional(),
  source: zSourceRef,
}).strict();
export const CatalogEntry = z.object({
  kind: ItemKind,
  displayName: z.string(),
  aliases: z.array(z.string().toLowerCase()).min(1),
  icon: z.string().optional(),
  recurring: Recurring.optional(),
  components: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]+$/), displayName: z.string(), defaultIntervalDays: z.number().int().positive(), aliases: z.array(z.string().toLowerCase()).default([]), source: zSourceRef }).strict()).default([]),
  symptoms: z.array(Symptom).default([]),
  defaultProviderKey: z.string().optional(),
  manualSearchHint: z.string().optional(),
  questionsOnAdd: z.array(z.enum(["purchaseDate", "warrantyUntil", "brand", "model", "provider", "lastChangeDate"])).max(2).default([]),
}).strict();
export type CatalogEntry = z.infer<typeof CatalogEntry>;
export const Provider = z.object({
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  appliesTo: z.array(z.string()).min(1),
  channel: Channel,
  to: z.string().optional(),
  urlTemplate: z.string().optional(),
  messageTemplate: z.string().optional(),
  requiresRegisteredPhone: z.boolean().default(false),
  notes: z.string().optional(),
  source: zSourceRef,
}).strict().superRefine((provider, ctx) => {
  if (["whatsapp", "sms", "phone_call", "ivrs"].includes(provider.channel) && !provider.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: `${provider.channel} providers require a destination` });
  }
  if (["web", "shopping_link"].includes(provider.channel) && !provider.urlTemplate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["urlTemplate"], message: `${provider.channel} providers require a URL template` });
  }
});
export type Provider = z.infer<typeof Provider>;
const safetyCategoryValues = SafetyCategory.options;
export const SafetyBlock = z.object({
  generalEmergency: z.string(),
  numbers: z.record(z.string(), z.string()).refine((numbers) => Object.keys(numbers).every((key) => safetyCategoryValues.includes(key as (typeof safetyCategoryValues)[number])), "Unknown safety category"),
  stopMessages: z.record(z.string(), z.string())
    .refine((messages) => Object.keys(messages).every((key) => safetyCategoryValues.includes(key as (typeof safetyCategoryValues)[number])), "Unknown safety category")
    .refine((messages) => safetyCategoryValues.every((category) => category in messages), "Every safety category needs a stop message"),
  stopMessagesByLanguage: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  source: zSourceRef,
}).strict().superRefine((safety, ctx) => {
  for (const [category, message] of Object.entries(safety.stopMessages)) {
    if (!message.includes("{number}")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stopMessages", category], message: "Stop messages must include {number}" });
  }
});
export type SafetyBlock = z.infer<typeof SafetyBlock>;

const RegionPackBase = z.object({
  $schema: z.string().optional(),
  packId: zRegionCode,
  version: z.string().regex(/^\d{4}\.\d{2}(\.\d+)?$/),
  extends: z.literal("DEFAULT").optional(),
  name: z.string(),
  countries: z.array(zCountry).min(1).or(z.tuple([z.literal("*")])),
  locale: z.object({ defaultLanguage: zLanguageTag, supportedLanguages: z.array(zLanguageTag).min(1), defaultTimeZone: zTimeZone, dateOrder: DateOrder }).strict(),
  units: z.object({ volume: VolumeUnit, temp: TempUnit, weight: WeightUnit, currency: zCurrency }).strict(),
  seasons: z.array(z.object({ key: z.string(), startMonth: z.number().int().min(1).max(12), endMonth: z.number().int().min(1).max(12) }).strict()).default([]),
  vocabulary: z.record(z.string(), z.string()).default({}),
  catalog: z.record(z.string().regex(/^[a-z0-9_]+$/), CatalogEntry),
  providers: z.record(z.string().regex(/^[a-z0-9_]+$/), Provider).default({}),
  safety: SafetyBlock,
  sources: z.array(zSourceRef).default([]),
}).strict();

export const RegionPack = RegionPackBase.superRefine((pack, ctx) => {
  for (const [providerKey, provider] of Object.entries(pack.providers)) {
    provider.appliesTo.forEach((key, index) => {
      if (!(key in pack.catalog)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["providers", providerKey, "appliesTo", index], message: `Unknown catalog key: ${key}` });
    });
  }
  const aliases = new Map<string, string>();
  for (const [catalogKey, entry] of Object.entries(pack.catalog)) {
    const componentAliases = new Map<string, string>();
    for (const component of entry.components) {
      for (const alias of component.aliases) {
        const normalized = alias.trim().toLowerCase();
        const previousComponent = componentAliases.get(normalized);
        if (previousComponent && previousComponent !== component.key) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["catalog", catalogKey, "components"], message: `Component alias collision "${normalized}" between ${previousComponent} and ${component.key}` });
        } else componentAliases.set(normalized, component.key);
      }
    }
    if (entry.defaultProviderKey && !(entry.defaultProviderKey in pack.providers)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["catalog", catalogKey, "defaultProviderKey"], message: `Unknown provider: ${entry.defaultProviderKey}` });
    }
    for (const alias of entry.aliases) {
      const normalized = alias.trim().toLowerCase();
      const previous = aliases.get(normalized);
      if (previous && previous !== catalogKey) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["catalog", catalogKey, "aliases"], message: `Alias collision "${normalized}" between ${previous} and ${catalogKey}` });
      else aliases.set(normalized, catalogKey);
    }
    if (entry.recurring?.minDaysBetweenBookings && entry.recurring.minDaysBetweenBookings > entry.recurring.defaultIntervalDays) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["catalog", catalogKey, "recurring", "minDaysBetweenBookings"], message: "Minimum booking gap cannot exceed default interval" });
    }
    entry.symptoms.forEach((symptom, index) => {
      if (symptom.safety && symptom.likelyCauses.some((cause) => cause.diy || cause.fix?.steps.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["catalog", catalogKey, "symptoms", index, "likelyCauses"], message: "Safety symptoms cannot include DIY causes or steps" });
      for (const [causeIndex, cause] of symptom.likelyCauses.entries()) {
        if (cause.evidenceHints.componentOverdue && !entry.components.some((component) => component.key === cause.evidenceHints.componentOverdue)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["catalog", catalogKey, "symptoms", index, "likelyCauses", causeIndex, "evidenceHints", "componentOverdue"], message: `Unknown component ${cause.evidenceHints.componentOverdue}` });
        }
        for (const questionId of Object.keys(cause.evidenceHints.answers)) {
          if (!symptom.questions.some((question) => question.id === questionId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["catalog", catalogKey, "symptoms", index, "likelyCauses", causeIndex, "evidenceHints", "answers", questionId], message: `Unknown symptom question ${questionId}` });
        }
      }
    });
  }
});
export type RegionPack = z.infer<typeof RegionPack>;
