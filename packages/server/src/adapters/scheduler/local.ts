import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { JobHandler, ScheduledJob, SchedulerAdapter } from "./types.js";
import { clearFired, hasFired, markFired, putScheduleMirror, removeScheduleMirror, listScheduleMirror } from "./mirror.js";
import { schedulePk, scheduleSk } from "../../data/keys.js";

export class LocalScheduler implements SchedulerAdapter {
  readonly name = "local-timer";
  private handler: JobHandler = async () => undefined;
  private readonly interval: ReturnType<typeof setInterval>;

  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock) {
    this.interval = setInterval(() => void this.tick(), 15_000);
    this.interval.unref();
  }

  onFire(handler: JobHandler): void { this.handler = handler; }

  async schedule(job: ScheduledJob): Promise<void> {
    await putScheduleMirror(this.storage, job);
  }

  async cancel(id: string): Promise<void> { await removeScheduleMirror(this.storage, id); }

  async list(householdId?: string): Promise<ScheduledJob[]> {
    return listScheduleMirror(this.storage, householdId);
  }

  async tick(): Promise<number> {
    const now = this.clock.now().getTime();
    const due = (await this.list()).filter((job) => new Date(job.runAtUtc).getTime() <= now);
    for (const job of due) {
      if (await hasFired(this.storage, job)) { await this.storage.delete(schedulePk(), scheduleSk(job.id)); continue; }
      await markFired(this.storage, this.clock, job);
      try { await this.handler(job); await this.storage.delete(schedulePk(), scheduleSk(job.id)); }
      catch (error) { await clearFired(this.storage, job); throw error; }
    }
    return due.length;
  }

  close(): void { clearInterval(this.interval); }
}
