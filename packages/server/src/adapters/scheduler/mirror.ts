import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { ScheduledJob } from "./types.js";
import { scheduleFiredSk, schedulePk, scheduleSk, ttlClockForKey } from "../../data/keys.js";

export const SCHEDULE_PK = schedulePk();
export function firedMarkerSk(job: ScheduledJob): string { return scheduleFiredSk(job.id, job.runAtUtc); }
export async function putScheduleMirror(storage: StorageAdapter, job: ScheduledJob): Promise<void> {
  await storage.put({ pk: SCHEDULE_PK, sk: scheduleSk(job.id), type: "scheduled-job", data: { ...job } });
}
export async function removeScheduleMirror(storage: StorageAdapter, id: string): Promise<void> { await storage.delete(SCHEDULE_PK, scheduleSk(id)); }
export async function listScheduleMirror(storage: StorageAdapter, householdId?: string): Promise<ScheduledJob[]> {
  return (await storage.query(SCHEDULE_PK)).filter((row) => row.type === "scheduled-job").map((row) => row.data as unknown as ScheduledJob).filter((job) => !householdId || job.payload.householdId === householdId);
}
export async function loadScheduleMirror(storage: StorageAdapter, id: string): Promise<ScheduledJob | null> {
  const row = await storage.get(SCHEDULE_PK, scheduleSk(id));
  return row?.type === "scheduled-job" ? row.data as unknown as ScheduledJob : null;
}
export async function hasFired(storage: StorageAdapter, job: ScheduledJob): Promise<boolean> { return Boolean(await storage.get(SCHEDULE_PK, firedMarkerSk(job))); }
export async function markFired(storage: StorageAdapter, clock: Clock, job: ScheduledJob): Promise<boolean> {
  const sk = firedMarkerSk(job);
  if (await storage.get(SCHEDULE_PK, sk)) return false;
  const now = clock.now().toISOString();
  await storage.put({ pk: SCHEDULE_PK, sk, type: "scheduled-job-fired", data: { jobId: job.id, runAtUtc: job.runAtUtc, firedAt: now }, ttlClock: ttlClockForKey(SCHEDULE_PK, sk), ttl: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 });
  return true;
}
export async function clearFired(storage: StorageAdapter, job: ScheduledJob): Promise<void> { await storage.delete(SCHEDULE_PK, firedMarkerSk(job)); }
