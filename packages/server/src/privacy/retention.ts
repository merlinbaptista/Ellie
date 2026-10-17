import type { AppContext } from "../context.js";
import { auditPk, householdPk, linkPk, outboxMessagePrefix, schedulePk, ttlClockForKey, translationPk } from "../data/keys.js";

export const retentionPolicy = [
  { data: "Home history, items, predictions and resolutions", keptFor: "Until you delete it" },
  { data: "Outbox messages", keptFor: "30 days" },
  { data: "Phone chat", keptFor: "7 days or link expiry, whichever comes first" },
  { data: "Diagnosis sessions", keptFor: "24 hours" },
  { data: "Short links", keptFor: "Link expiry (72 hours by default)" },
  { data: "Translation cache", keptFor: "7 days" },
  { data: "Privacy audit records", keptFor: "365 days" },
];
export function retentionPolicyFor(ctx: AppContext) {
  return retentionPolicy.map((entry) => entry.data === "Outbox messages" ? { ...entry, keptFor: `${ctx.env.OUTBOX_RETENTION_DAYS} days` }
    : entry.data === "Phone chat" ? { ...entry, keptFor: `${ctx.env.CHAT_RETENTION_DAYS} days or link expiry, whichever comes first` }
      : entry.data === "Privacy audit records" ? { ...entry, keptFor: `${ctx.env.AUDIT_RETENTION_DAYS} days` } : entry);
}

export async function expireOutbox(ctx: AppContext, householdId?: string): Promise<number> {
  if (ctx.storage.name === "dynamodb" && !householdId) return 0;
  const rows = await ctx.storage.query("OUTBOX", { skPrefix: outboxMessagePrefix() });
  const now = Math.floor(Date.now() / 1000);
  let updated = 0;
  for (const row of rows) {
    if (householdId && row.data.householdId !== householdId) continue;
    if (row.ttl !== undefined) continue;
    const sentAt = typeof row.data.sentAt === "string" ? Date.parse(row.data.sentAt) : Date.parse(row.createdAt);
    const origin = Number.isFinite(sentAt) ? Math.floor(sentAt / 1000) : now;
    await ctx.storage.put({ ...row, ttlClock: "wall", ttl: origin + ctx.env.OUTBOX_RETENTION_DAYS * 86400 });
    updated += 1;
  }
  return updated;
}

export function ttlFor(ctx: AppContext, days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86400;
}

export async function expireHouseholdEphemera(ctx: AppContext, householdId: string): Promise<number> {
  const rows = await ctx.storage.query(householdPk(householdId));
  const cutoff = Math.floor(Date.now() / 1000);
  let count = 0;
  for (const row of rows) {
    if (row.type !== "diagnosis" && row.type !== "pending") continue;
    if (row.ttl !== undefined) continue;
    await ctx.storage.put({ ...row, ttlClock: "wall", ttl: cutoff + 24 * 3600 });
    count += 1;
  }
  return count;
}

export function retentionTtlClock(pk: string, sk: string): "app" | "wall" { return ttlClockForKey(pk, sk); }
export const retentionPartitions = { outbox: outboxMessagePrefix(), links: linkPk(), schedules: schedulePk(), translations: translationPk(), audit: auditPk() };
