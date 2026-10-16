export interface ScheduledJob {
  id: string;
  runAtUtc: string;
  timeZone: string;
  payload: { kind: "reminder" | "follow_up" | "delivery_check"; householdId: string; itemId?: string; component?: string; lastEventLocal?: string | null; message: string };
}
export type JobHandler = (job: ScheduledJob) => Promise<void>;
export interface SchedulerAdapter {
  readonly name: string;
  schedule(job: ScheduledJob): Promise<void>;
  cancel(id: string): Promise<void>;
  list(householdId?: string): Promise<ScheduledJob[]>;
  onFire(handler: JobHandler): void;
  tick?(): Promise<number>;
  healthCheck?(): Promise<{ ok: boolean; scheduled: number; queueDepth?: number }>;
  close?(): void | Promise<void>;
}
