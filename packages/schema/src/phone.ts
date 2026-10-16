import { z } from "zod";
import { zHouseholdId, zIsoUtc, zLanguageTag } from "./primitives.js";

export const PhoneContentKind = z.enum(["fix", "booking", "summary"]);
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
  id: z.enum(["book", "call", "open_manual", "fixed", "booked", "not_fixed"]),
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
  actions: z.array(PhoneAction),
  expiresAt: zIsoUtc,
  generatedAt: zIsoUtc,
}).strict();
export type PhoneView = z.infer<typeof PhoneView>;
