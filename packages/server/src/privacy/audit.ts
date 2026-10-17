import { randomUUID } from "node:crypto";
import type { AppContext } from "../context.js";
import { auditPk, auditSk } from "../data/keys.js";

export async function writePrivacyAudit(ctx: AppContext, householdId: string, action: string, counts: Record<string, number> = {}): Promise<void> {
  const at = ctx.clock.now().toISOString();
  const sk = auditSk(householdId, at, randomUUID());
  await ctx.storage.put({ pk: auditPk(), sk, type: "privacy-audit", data: { householdId, action, counts }, ttlClock: "wall", ttl: Math.floor(Date.now() / 1000) + ctx.env.AUDIT_RETENTION_DAYS * 86400 });
}
