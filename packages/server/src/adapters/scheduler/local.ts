import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { JobHandler, ScheduledJob, SchedulerAdapter } from "./types.js";

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
    await this.storage.put({ pk: "SCHEDULE", sk: job.id, type: "scheduled-job", data: { ...job } });
  }

  async cancel(id: string): Promise<void> { await this.storage.delete("SCHEDULE", id); }

  async list(householdId?: string): Promise<ScheduledJob[]> {
    const records = await this.storage.query("SCHEDULE");
    return records
      .map((record) => record.data as unknown as ScheduledJob)
      .filter((job) => !householdId || job.payload.householdId === householdId);
  }

  async tick(): Promise<number> {
    const now = this.clock.now().getTime();
    const due = (await this.list()).filter((job) => new Date(job.runAtUtc).getTime() <= now);
    for (const job of due) {
      await this.storage.delete("SCHEDULE", job.id);
      await this.handler(job);
    }
    return due.length;
  }

  close(): void { clearInterval(this.interval); }
}
