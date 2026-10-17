import { randomUUID } from "node:crypto";
import { ConsentRecord, ConsentPurpose, type EventSource } from "@ellie/schema";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { auditPk, auditSk, consentPrefix, consentSk, householdPk } from "../data/keys.js";
import { getOrCreateHousehold } from "../domain/households.js";
import { maskEmail, maskPhone } from "./redact.js";

export type ConsentPurposeValue = z.infer<typeof ConsentPurpose>;
export type ConsentSource = EventSource;
function masked(value?: string): string | undefined {
  if (!value) return undefined;
  return value.includes("@") ? maskEmail(value) : maskPhone(value);
}

export async function consentHistory(ctx: AppContext, householdId: string): Promise<ConsentRecord[]> {
  const pk = householdPk(householdId);
  let rows = await ctx.storage.query(pk, { skPrefix: consentPrefix() });
  if (!rows.length) {
    const profile = await ctx.repositories.households.get(householdId);
    const contact = profile?.contact;
    if (contact?.consentGivenAt && (contact.phone || contact.email)) {
      const source = contact.consentSource ?? "system";
      const migrated = [
        ...(contact.phone ? [ConsentRecord.parse({ schemaVersion: 1, householdId, purpose: "phone_messages", action: "granted", channelMasked: masked(contact.phone), source, at: contact.consentGivenAt, note: "Migrated existing household consent" })] : []),
        ...(contact.email ? [ConsentRecord.parse({ schemaVersion: 1, householdId, purpose: "email_messages", action: "granted", channelMasked: masked(contact.email), source, at: contact.consentGivenAt, note: "Migrated existing household consent" })] : []),
      ];
      for (const record of migrated) await ctx.storage.put({ pk, sk: consentSk(record.purpose, record.at, randomUUID()), type: "consent", data: record });
      rows = await ctx.storage.query(pk, { skPrefix: consentPrefix() });
    }
  }
  return rows.map((row) => ConsentRecord.parse(row.data)).sort((left, right) => left.at.localeCompare(right.at));
}

export async function canSend(ctx: AppContext, householdId: string, purpose: ConsentPurposeValue): Promise<boolean> {
  const history = await consentHistory(ctx, householdId);
  const latest = history.filter((record) => record.purpose === purpose).at(-1);
  if (latest) return latest.action === "granted";
  const profile = await ctx.repositories.households.get(householdId);
  return Boolean(profile?.contact?.consentGivenAt && (purpose === "email_messages" ? profile.contact.email : profile.contact.phone));
}

export async function recordConsent(ctx: AppContext, input: { householdId: string; purpose: ConsentPurposeValue; action: "granted" | "withdrawn"; source: ConsentSource; channel?: string; note?: string }): Promise<ConsentRecord> {
  const profile = await getOrCreateHousehold(input.householdId, ctx);
  const at = ctx.clock.now().toISOString();
  const record = ConsentRecord.parse({ schemaVersion: 1, householdId: input.householdId, purpose: input.purpose, action: input.action, ...(masked(input.channel) ? { channelMasked: masked(input.channel) } : {}), source: input.source, at, ...(input.note ? { note: input.note.slice(0, 120) } : {}) });
  const pk = householdPk(input.householdId);
  const sk = consentSk(input.purpose, at, randomUUID());
  await ctx.storage.put({ pk, sk, type: "consent", data: record });
  await ctx.storage.put({ pk: auditPk(), sk: auditSk(input.householdId, at, randomUUID()), type: "privacy-audit", data: { householdId: input.householdId, action: `consent_${input.action}`, purpose: input.purpose }, ttlClock: "wall", ttl: Math.floor(Date.now() / 1000) + ctx.env.AUDIT_RETENTION_DAYS * 86400 });
  if (input.action === "withdrawn") {
    const contact = { ...profile.contact };
    if (input.purpose === "phone_messages") delete contact.phone;
    if (input.purpose === "email_messages") delete contact.email;
    if (input.purpose === "reminders") { delete contact.phone; delete contact.email; }
    if (!contact.phone && !contact.email) { delete contact.consentGivenAt; delete contact.consentSource; }
    const nextContact = contact.phone || contact.email
      ? { ...contact, consentGivenAt: contact.consentGivenAt ?? profile.contact?.consentGivenAt ?? ctx.clock.now().toISOString(), consentSource: contact.consentSource ?? profile.contact?.consentSource ?? input.source }
      : undefined;
    await ctx.repositories.households.put({ ...profile, contact: nextContact });
  }
  return record;
}

export async function grantConsent(ctx: AppContext, input: { householdId: string; purpose: ConsentPurposeValue; source: ConsentSource; phone?: string; email?: string; confirm: boolean }): Promise<{ record?: ConsentRecord; followUp?: string; speech: string }> {
  if (!input.confirm) return { speech: "Can I save that contact for messages and reminders?", followUp: "Say yes to allow it." };
  const profile = await getOrCreateHousehold(input.householdId, ctx);
  const contact = { ...profile.contact, ...(input.phone ? { phone: input.phone } : {}), ...(input.email ? { email: input.email } : {}), consentGivenAt: ctx.clock.now().toISOString(), consentSource: input.source };
  await ctx.repositories.households.put({ ...profile, contact });
  const record = await recordConsent(ctx, { householdId: input.householdId, purpose: input.purpose, action: "granted", source: input.source, channel: input.phone ?? input.email });
  return { record, speech: "Thanks — I'll only use that contact for the messages you approved." };
}
