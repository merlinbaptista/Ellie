import { createHash, randomUUID } from "node:crypto";
import { ForgetReceipt, type ForgetReceipt as ForgetReceiptType } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { auditPk, auditSk, householdIndexPk, householdIndexSk, householdPk, householdProfileSk, linkPk, outboxMessagePrefix, schedulePk, subjectPk, translationPk } from "../data/keys.js";
import type { StoredRecord } from "../adapters/storage/types.js";
import { verifyPhoneLink } from "../links/sign.js";
import { PhoneTokenError } from "../links/sign.js";
import { loadHouseholdSnapshot } from "../domain/snapshot.js";
import { writePrivacyAudit } from "./audit.js";
import { hashPlan as digestPlan } from "./confirm.js";

interface ForgetPlan { householdRows: StoredRecord[]; externalJobs: string[]; externalState: string[]; sharedRows: StoredRecord[]; householdProfile?: StoredRecord; itemId?: string; itemName?: string }
function linkTokenHash(token: string): string { return createHash("sha256").update(token).digest("hex").slice(0, 24); }
function containsItem(value: unknown, itemId: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => containsItem(entry, itemId));
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => key === "itemId" && child === itemId || containsItem(child, itemId));
}

async function planItem(ctx: AppContext, householdId: string, itemId: string): Promise<ForgetPlan> {
  const snapshot = await loadHouseholdSnapshot(householdId, ctx);
  const item = snapshot.items.find((candidate) => candidate.itemId === itemId);
  if (!item) throw new Error("I couldn't find that item, so nothing was changed.");
  const diagnoses = snapshot.diagnoses.filter((entry) => entry.itemId === itemId).map((entry) => entry.diagnosisId);
  const diagnosisIds = new Set(diagnoses);
  const householdRows = await ctx.storage.query(householdPk(householdId));
  const selected = householdRows.filter((row) => row.sk === `ITEM#${itemId}` || row.sk.startsWith(`EVENT#${itemId}#`) || row.sk.startsWith(`PRED#${itemId}`) || row.sk.startsWith(`RES#${itemId}#`) || row.type === "diagnosis" && row.data.itemId === itemId || row.type === "alias" && row.data.itemId === itemId || containsItem(row.data, itemId) && ["pending", "dedupe"].includes(row.type));
  const profile = await ctx.storage.get(householdPk(householdId), householdProfileSk());
  const links = await ctx.storage.query(linkPk());
  const itemLinkRows: StoredRecord[] = [];
  const tokenPrefixes = new Set<string>();
  for (const row of links) {
    if (row.type === "phone-short-link" && row.data.householdId === householdId && typeof row.data.token === "string") {
      try {
        const payload = verifyPhoneLink(row.data.token, ctx.env);
        if (payload.ref === itemId || payload.kind === "fix" && diagnosisIds.has(payload.ref ?? "")) {
          itemLinkRows.push(row);
          tokenPrefixes.add(`${linkTokenHash(row.data.token)}#`);
          tokenPrefixes.add(`${payload.nonce}#`);
        }
      } catch (error) {
        if (error instanceof PhoneTokenError && error.reason === "expired") {
          try {
            const encoded = row.data.token.split(".")[0]!;
            const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { hh?: string; ref?: string; kind?: string; nonce?: string };
            if (payload.hh === householdId && (payload.ref === itemId || payload.kind === "fix" && diagnosisIds.has(payload.ref ?? ""))) {
              itemLinkRows.push(row);
              tokenPrefixes.add(`${linkTokenHash(row.data.token)}#`);
              if (payload.nonce) tokenPrefixes.add(`${payload.nonce}#`);
            }
          } catch { /* malformed stored links cannot be matched to an item */ }
        }
      }
    } else if (row.type === "phone-send" && row.data.householdId === householdId && (row.data.itemId === itemId || containsItem(row.data, itemId))) itemLinkRows.push(row);
  }
  for (const row of links) if (tokenPrefixes.size && [...tokenPrefixes].some((prefix) => row.sk.startsWith(prefix))) itemLinkRows.push(row);
  const outbox = (await ctx.storage.query("OUTBOX", { skPrefix: outboxMessagePrefix() })).filter((row) => row.data.householdId === householdId && (row.data.itemId === itemId || typeof row.data.body === "string" && row.data.body.toLowerCase().includes(item.name.toLowerCase())));
  const translations = (await ctx.storage.query(translationPk())).filter((row) => row.data.householdId === householdId && row.data.itemId === itemId);
  const scheduleRows = (await ctx.storage.query(schedulePk())).filter((row) => {
    const data = row.data as { payload?: { householdId?: string; itemId?: string } };
    return data.payload?.householdId === householdId && (data.payload.itemId === itemId || row.sk.includes(itemId));
  });
  const jobs = (await ctx.scheduler.list(householdId)).filter((job) => job.payload.itemId === itemId);
  return { householdRows: selected, externalJobs: jobs.map((job) => job.id), externalState: jobs.map((job) => JSON.stringify(job)), sharedRows: [...new Map([...itemLinkRows, ...outbox, ...translations, ...scheduleRows].map((row) => [`${row.pk}\0${row.sk}`, row])).values()], ...(profile ? { householdProfile: profile } : {}), itemId, itemName: item.name };
}

async function planHousehold(ctx: AppContext, householdId: string): Promise<ForgetPlan> {
  const jobs = await ctx.scheduler.list(householdId);
  const shared: StoredRecord[] = [];
  const links = await ctx.storage.query(linkPk());
  const childPrefixes = new Set<string>();
  for (const row of links.filter((entry) => entry.type === "phone-short-link" && entry.data.householdId === householdId && typeof entry.data.token === "string")) {
    try {
      const payload = verifyPhoneLink(String(row.data.token), ctx.env);
      childPrefixes.add(`${payload.nonce}#`);
      childPrefixes.add(`${linkTokenHash(String(row.data.token))}#`);
    } catch { /* an expired token's children are still matched through the stored payload below */
      try { const encoded = String(row.data.token).split(".")[0]; const payload = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8")) as { nonce?: string }; if (payload.nonce) childPrefixes.add(`${payload.nonce}#`); } catch { /* malformed stored tokens cannot authenticate a page */ }
    }
  }
  shared.push(...links.filter((row) => row.data.householdId === householdId || row.sk.startsWith(`SEND#${householdId}#`) || [...childPrefixes].some((prefix) => row.sk.startsWith(prefix))));
  const outbox = await ctx.storage.query("OUTBOX");
  shared.push(...outbox.filter((row) => row.data.householdId === householdId));
  const translations = await ctx.storage.query(translationPk());
  shared.push(...translations.filter((row) => row.data.householdId === householdId));
  const schedules = await ctx.storage.query(schedulePk());
  shared.push(...schedules.filter((row) => (row.data as { payload?: { householdId?: string } }).payload?.householdId === householdId || row.sk.includes(householdId)));
  const subjects = await ctx.storage.query(subjectPk());
  shared.push(...subjects.filter((row) => row.data.householdId === householdId));
  return { householdRows: (await ctx.storage.query(householdPk(householdId))).filter((row) => row.type !== "privacy-confirmation"), externalJobs: jobs.map((job) => job.id), externalState: jobs.map((job) => JSON.stringify(job)), sharedRows: shared };
}

function planHash(plan: ForgetPlan): string {
  const records = [...plan.householdRows, ...plan.sharedRows, ...(plan.householdProfile ? [plan.householdProfile] : [])].map((row) => [row.pk, row.sk, row.updatedAt, row.data]).sort((left, right) => `${left[0]}#${left[1]}`.localeCompare(`${right[0]}#${right[1]}`));
  return digestPlan({ records, externalState: plan.externalState });
}

export async function forgetItem(ctx: AppContext, householdId: string, itemId: string): Promise<{ plan: ForgetPlan; planHash: string }> {
  const plan = await planItem(ctx, householdId, itemId);
  return { plan, planHash: planHash(plan) };
}
export async function forgetHouseholdPlan(ctx: AppContext, householdId: string): Promise<{ plan: ForgetPlan; planHash: string }> {
  const plan = await planHousehold(ctx, householdId);
  return { plan, planHash: planHash(plan) };
}

async function deleteSharedRows(ctx: AppContext, rows: StoredRecord[], deleted: Record<string, number>): Promise<void> {
  for (const row of rows) {
    await ctx.storage.delete(row.pk, row.sk);
    const label = row.pk === "OUTBOX" ? "outbox" : row.pk === translationPk() ? "translations" : row.pk === schedulePk() ? "schedules" : row.pk === subjectPk() ? "subjects" : "links";
    deleted[label] = (deleted[label] ?? 0) + 1;
  }
}
async function cancelJobs(ctx: AppContext, ids: string[]): Promise<Array<{ service: string; ok: boolean; detail?: string }>> {
  const results: Array<{ service: string; ok: boolean; detail?: string }> = [];
  for (const id of ids) {
    try { await ctx.scheduler.cancel(id); results.push({ service: ctx.scheduler.name, ok: true }); }
    catch (error) { results.push({ service: ctx.scheduler.name, ok: false, detail: error instanceof Error ? error.message : "Schedule cancellation failed" }); }
  }
  return results;
}
function recordCount(rows: StoredRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.type] = (counts[row.type] ?? 0) + 1;
  return counts;
}

export async function executeForgetItem(ctx: AppContext, householdId: string, itemId: string): Promise<ForgetReceiptType> {
  if (!await ctx.repositories.items.get(householdId, itemId)) return ForgetReceipt.parse({ scope: "item", householdId, itemId, deleted: {}, externalCleanup: [], at: ctx.clock.now().toISOString() });
  const { plan } = await forgetItem(ctx, householdId, itemId);
  const externalCleanup = await cancelJobs(ctx, plan.externalJobs);
  const deleted = recordCount(plan.householdRows);
  deleted.items = plan.householdRows.filter((row) => row.type === "item").length;
  deleted.events = plan.householdRows.filter((row) => row.type === "event").length;
  deleted.predictions = plan.householdRows.filter((row) => row.type === "prediction").length;
  deleted.resolutions = plan.householdRows.filter((row) => row.type === "resolution").length;
  deleted.diagnoses = plan.householdRows.filter((row) => row.type === "diagnosis").length;
  deleted.aliases = plan.householdRows.filter((row) => row.type === "alias").length;
  for (const row of plan.householdRows) await ctx.storage.delete(row.pk, row.sk);
  await deleteSharedRows(ctx, plan.sharedRows, deleted);
  const household = await ctx.repositories.households.get(householdId);
  if (household) {
    const askedFields = household.askedFields.filter((field) => !field.startsWith(`${itemId}:`));
    deleted.askedFields = household.askedFields.length - askedFields.length;
    if (deleted.askedFields) await ctx.repositories.households.put({ ...household, askedFields });
  }
  await writePrivacyAudit(ctx, householdId, "item_forgotten", deleted);
  return ForgetReceipt.parse({ scope: "item", householdId, itemId, deleted, externalCleanup, at: ctx.clock.now().toISOString() });
}

export async function executeForgetHousehold(ctx: AppContext, householdId: string): Promise<ForgetReceiptType> {
  const { plan } = await forgetHouseholdPlan(ctx, householdId);
  const externalCleanup = await cancelJobs(ctx, plan.externalJobs);
  const deleted = recordCount(plan.householdRows);
  for (const row of plan.householdRows) deleted[row.type] = (deleted[row.type] ?? 0);
  const partitionCount = await ctx.storage.deletePartition(householdPk(householdId));
  deleted.householdPartition = partitionCount;
  await ctx.storage.delete(householdIndexPk(), householdIndexSk(householdId));
  deleted.householdIndex = 1;
  await deleteSharedRows(ctx, plan.sharedRows, deleted);
  const priorAudits = (await ctx.storage.query(auditPk())).filter((row) => row.sk.startsWith(`${householdId}#`));
  for (const audit of priorAudits) await ctx.storage.delete(auditPk(), audit.sk);
  deleted.auditRecords = priorAudits.length;
  const at = ctx.clock.now().toISOString();
  await ctx.storage.put({ pk: auditPk(), sk: auditSk(householdId, at, randomUUID()), type: "privacy-audit", data: { householdId, action: "household_erased", counts: deleted }, ttlClock: "wall", ttl: Math.floor(Date.now() / 1000) + ctx.env.AUDIT_RETENTION_DAYS * 86400 });
  return ForgetReceipt.parse({ scope: "household", householdId, deleted, externalCleanup, at });
}
