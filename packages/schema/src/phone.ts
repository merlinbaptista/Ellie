import { z } from "zod";
import { zHouseholdId, zIsoUtc, zLanguageTag } from "./primitives.js";
import { SafetyLevel } from "./enums.js";
import { Evidence } from "./diagnosis.js";

export const PhoneContentKind = z.enum(["fix", "booking", "summary", "privacy"]);
export type PhoneContentKind = z.infer<typeof PhoneContentKind>;
export const PhoneLinkPayload = z.object({
  v: z.literal(1),
  hh: zHouseholdId,
  kind: PhoneContentKind,
  ref: z.string().max(80).optional(),
  exp: z.number().int(),
  nonce: z.string().length(10),
}).strict();
export type PhoneLinkPayload = z.infer<typeof PhoneLinkPayload>;

export const PhoneAction = z.object({
  id: z.enum(["book", "call", "open_manual", "fixed", "booked", "not_fixed", "chat", "download", "forget", "withdraw", "erase"]),
  label: z.string(),
  url: z.string().optional(),
  method: z.enum(["link", "post"]),
}).strict();
export type PhoneAction = z.infer<typeof PhoneAction>;

export const PhoneView = z.object({
  kind: PhoneContentKind,
  title: z.string(),
  subtitle: z.string().optional(),
  language: zLanguageTag,
  sections: z.array(z.object({
    heading: z.string(),
    body: z.string().optional(),
    list: z.array(z.string()).optional(),
    ordered: z.boolean().default(false),
    tone: z.enum(["normal", "warning", "safety"]).default("normal"),
  }).strict()),
  evidence: z.array(Evidence).optional(),
  citationTexts: z.record(z.string(), z.string()).optional(),
  actions: z.array(PhoneAction),
  translated: z.object({ to: zLanguageTag, by: z.enum(["llm", "none"]), complete: z.boolean() }).optional(),
  expiresAt: zIsoUtc,
  generatedAt: zIsoUtc,
}).strict();
export type PhoneView = z.infer<typeof PhoneView>;

export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "ellie"]),
  text: z.string().max(600),
  citedEvidenceIds: z.array(z.string()).default([]),
  source: z.enum(["llm", "deterministic", "safety"]).optional(),
  createdAt: zIsoUtc,
}).strict();
export type ChatMessage = z.infer<typeof ChatMessage>;

export const PhoneUiLanguage = z.enum(["en", "hi", "kn", "ta", "es"]);
export type PhoneUiLanguage = z.infer<typeof PhoneUiLanguage>;
export const PhoneChatRequest = z.object({ message: z.string().trim().min(1).max(500), ticked: z.array(z.number().int().nonnegative()).optional(), language: PhoneUiLanguage.optional() }).strict();
export type PhoneChatRequest = z.infer<typeof PhoneChatRequest>;
export const PhoneChatResponse = z.object({
  reply: ChatMessage,
  safety: z.object({ level: SafetyLevel, number: z.string().optional() }).strict().optional(),
  remaining: z.number().int().nonnegative(),
}).strict();
export type PhoneChatResponse = z.infer<typeof PhoneChatResponse>;
