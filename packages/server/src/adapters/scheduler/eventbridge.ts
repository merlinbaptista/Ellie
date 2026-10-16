import { createHash } from "node:crypto";
import { CreateScheduleCommand, DeleteScheduleCommand, GetScheduleGroupCommand, SchedulerClient, UpdateScheduleCommand } from "@aws-sdk/client-scheduler";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Logger } from "pino";
import type { Env } from "../../config/env.js";
import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { JobHandler, ScheduledJob, SchedulerAdapter } from "./types.js";
import { clearFired, listScheduleMirror, markFired, putScheduleMirror, removeScheduleMirror } from "./mirror.js";
import { SqsPoller } from "./sqsPoller.js";

function scheduleName(id: string): string {
  const sanitized = id.replace(/[^0-9A-Za-z_.-]/g, "-");
  const hash = createHash("sha256").update(id).digest("hex").slice(0, 8);
  return `ellie-${sanitized.slice(0, 49)}-${hash}`.slice(0, 64);
}
function localScheduleDate(utc: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

export class EventBridgeScheduler implements SchedulerAdapter {
  readonly name = "eventbridge";
  private handler: JobHandler = async () => undefined;
  private readonly client: SchedulerClient;
  private readonly sqsClient: SQSClient;
  private readonly poller: SqsPoller;
  private healthCache?: { checkedAt: number; result: { ok: boolean; scheduled: number; queueDepth?: number } };
  constructor(private readonly env: Env, private readonly storage: StorageAdapter, private readonly clock: Clock, private readonly logger: Logger) {
    this.client = new SchedulerClient({ region: env.AWS_REGION, maxAttempts: 3 });
    this.sqsClient = new SQSClient({ region: env.AWS_REGION });
    this.poller = new SqsPoller(env, storage, clock, logger, () => this.handler);
  }
  onFire(handler: JobHandler): void { this.handler = handler; this.poller.start(); }

  private request(job: ScheduledJob) {
    return {
      Name: scheduleName(job.id),
      GroupName: this.env.EVENTBRIDGE_SCHEDULE_GROUP,
      ScheduleExpression: `at(${localScheduleDate(job.runAtUtc, job.timeZone)})`,
      ScheduleExpressionTimezone: job.timeZone,
      FlexibleTimeWindow: { Mode: "OFF" as const },
      ActionAfterCompletion: "DELETE" as const,
      Target: {
        Arn: this.env.EVENTBRIDGE_TARGET_ARN,
        RoleArn: this.env.EVENTBRIDGE_ROLE_ARN,
        Input: JSON.stringify({ v: 1, jobId: job.id }),
        RetryPolicy: { MaximumRetryAttempts: 3 },
      },
    };
  }

  async schedule(job: ScheduledJob): Promise<void> {
    await putScheduleMirror(this.storage, job);
    if (new Date(job.runAtUtc).getTime() <= this.clock.now().getTime() + 60_000) {
      await this.tick();
      return;
    }
    const request = this.request(job);
    try { await this.client.send(new CreateScheduleCommand(request)); }
    catch (error) {
      if ((error as { name?: string }).name !== "ConflictException") throw error;
      await this.client.send(new UpdateScheduleCommand(request));
    }
  }

  async cancel(id: string): Promise<void> {
    try { await this.client.send(new DeleteScheduleCommand({ Name: scheduleName(id), GroupName: this.env.EVENTBRIDGE_SCHEDULE_GROUP })); }
    catch (error) { if ((error as { name?: string }).name !== "ResourceNotFoundException") throw error; }
    await removeScheduleMirror(this.storage, id);
  }

  async list(householdId?: string): Promise<ScheduledJob[]> { return listScheduleMirror(this.storage, householdId); }

  async tick(): Promise<number> {
    const now = this.clock.now().getTime();
    const due = (await this.list()).filter((job) => new Date(job.runAtUtc).getTime() <= now);
    let fired = 0;
    for (const job of due) {
      if (await markFired(this.storage, this.clock, job)) {
        try { await this.handler(job); fired++; }
        catch (error) { await clearFired(this.storage, job); throw error; }
      }
      await removeScheduleMirror(this.storage, job.id);
      try { await this.client.send(new DeleteScheduleCommand({ Name: scheduleName(job.id), GroupName: this.env.EVENTBRIDGE_SCHEDULE_GROUP })); }
      catch (error) { if ((error as { name?: string }).name !== "ResourceNotFoundException") this.logger.warn({ jobId: job.id, errorName: (error as { name?: string }).name }, "scheduler.cancel_after_tick_failed"); }
    }
    return fired;
  }

  async healthCheck(): Promise<{ ok: boolean; scheduled: number; queueDepth?: number }> {
    if (this.healthCache && Date.now() - this.healthCache.checkedAt < 30_000) return this.healthCache.result;
    try {
      await this.client.send(new GetScheduleGroupCommand({ Name: this.env.EVENTBRIDGE_SCHEDULE_GROUP }));
      const attributes = await this.sqsClient.send(new GetQueueAttributesCommand({ QueueUrl: this.env.SCHEDULER_QUEUE_URL, AttributeNames: ["ApproximateNumberOfMessages"] }));
      const result = { ok: true, scheduled: (await this.list()).length, queueDepth: Number(attributes.Attributes?.ApproximateNumberOfMessages ?? 0) };
      this.healthCache = { checkedAt: Date.now(), result };
      return result;
    } catch (error) {
      this.logger.warn({ errorName: (error as { name?: string }).name }, "scheduler.health_failed");
      const result = { ok: false, scheduled: (await this.list()).length };
      this.healthCache = { checkedAt: Date.now(), result };
      return result;
    }
  }

  async close(): Promise<void> { await this.poller.close(); this.client.destroy(); this.sqsClient.destroy(); }
}
