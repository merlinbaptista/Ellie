import type { StorageAdapter } from "../adapters/storage/types.js";
import type { PlannedQuestion } from "../domain/followups.js";
import type { Clock } from "../lib/clock.js";
import { householdPk, pendingSk, ttlClockForKey } from "./keys.js";

export class PendingRepository {
  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock) {}
  async get(householdId: string, scope: string): Promise<PlannedQuestion | null> {
    const row = await this.storage.get(householdPk(householdId), pendingSk(scope));
    return row ? row.data as unknown as PlannedQuestion : null;
  }
  async put(householdId: string, question: PlannedQuestion): Promise<void> {
    const now = this.clock.now();
    const pk = householdPk(householdId);
    const sk = pendingSk(question.scope);
    await this.storage.put({ pk, sk, type: "pending-follow-up", data: question as unknown as Record<string, unknown>, ttlClock: ttlClockForKey(pk, sk), ttl: Math.floor((now.getTime() + 24 * 60 * 60 * 1000) / 1000) });
  }
  async delete(householdId: string, scope: string): Promise<void> { await this.storage.delete(householdPk(householdId), pendingSk(scope)); }
}
