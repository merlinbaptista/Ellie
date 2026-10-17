import { createHash, randomInt, randomUUID } from "node:crypto";
import type { AppContext } from "../context.js";
import { confirmSk, householdPk, ttlClockForKey } from "../data/keys.js";

const spokenWords = ["blue river", "green mango", "quiet cedar", "silver kite", "bright lemon", "calm meadow"];
export function hashPlan(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function makeSpokenCode(): string { return spokenWords[randomInt(spokenWords.length)]!; }
export function normalizeSpokenCode(value: string): string { return value.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim(); }

export async function saveConfirmation(ctx: AppContext, householdId: string, kind: "item" | "household", planHash: string, code?: string): Promise<{ id: string; code?: string }> {
  const id = randomUUID();
  const pk = householdPk(householdId);
  const sk = confirmSk(id);
  const ttl = Math.floor(Date.now() / 1000) + ctx.env.CONFIRM_TTL_SEC;
  await ctx.storage.put({ pk, sk, type: "privacy-confirmation", data: { householdId, kind, planHash, ...(code ? { code } : {}) }, ttlClock: ttlClockForKey(pk, sk), ttl });
  return { id, ...(code ? { code } : {}) };
}

export async function takeConfirmation(ctx: AppContext, householdId: string, id: string, kind: "item" | "household", consume = true): Promise<{ planHash: string; code?: string } | null> {
  const pk = householdPk(householdId);
  const sk = confirmSk(id);
  const row = await ctx.storage.get(pk, sk);
  if (!row || row.ttl !== undefined && row.ttl <= Math.floor(Date.now() / 1000)) return null;
  if (row.data.householdId !== householdId || row.data.kind !== kind) return null;
  if (consume) await ctx.storage.delete(pk, sk);
  return { planHash: String(row.data.planHash), ...(typeof row.data.code === "string" ? { code: row.data.code } : {}) };
}
export async function clearConfirmation(ctx: AppContext, householdId: string, id: string): Promise<void> { await ctx.storage.delete(householdPk(householdId), confirmSk(id)); }
