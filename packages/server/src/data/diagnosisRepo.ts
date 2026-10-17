import type { Diagnosis } from "@ellie/schema";
import type { Clock } from "../lib/clock.js";
import type { StorageAdapter } from "../adapters/storage/types.js";
import { diagnosisPrefix, diagnosisSk, householdPk, ttlClockForKey } from "./keys.js";

export class DiagnosisRepository {
  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock) {}
  async get(householdId: string, diagnosisId: string): Promise<Diagnosis | null> {
    const row = await this.storage.get(householdPk(householdId), diagnosisSk(diagnosisId));
    return row ? row.data as unknown as Diagnosis : null;
  }
  async put(householdId: string, diagnosis: Diagnosis, ttlHours = 24): Promise<Diagnosis> {
    const ttl = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    const pk = householdPk(householdId);
    const sk = diagnosisSk(diagnosis.diagnosisId);
    await this.storage.put({ pk, sk, type: "diagnosis", data: diagnosis as unknown as Record<string, unknown>, ttlClock: "wall", ttl });
    return diagnosis;
  }
  async list(householdId: string): Promise<Diagnosis[]> {
    return (await this.storage.query(householdPk(householdId), { skPrefix: diagnosisPrefix(), descending: true }))
      .map((row) => row.data as unknown as Diagnosis);
  }
  async findOpen(householdId: string, itemId: string, symptomKey: string, sinceUtc: string): Promise<Diagnosis | null> {
    return (await this.list(householdId)).find((diagnosis) => diagnosis.itemId === itemId && diagnosis.symptomKey === symptomKey && diagnosis.status === "needs_answer" && diagnosis.updatedAt >= sinceUtc) ?? null;
  }
}