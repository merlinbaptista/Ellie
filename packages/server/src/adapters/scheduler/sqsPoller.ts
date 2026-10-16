import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Logger } from "pino";
import type { Env } from "../../config/env.js";
import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { JobHandler } from "./types.js";
import { clearFired, loadScheduleMirror, markFired, removeScheduleMirror } from "./mirror.js";

export class SqsPoller {
  private readonly client: SQSClient;
  private readonly controller = new AbortController();
  private loopPromise?: Promise<void>;
  constructor(private readonly env: Env, private readonly storage: StorageAdapter, private readonly clock: Clock, private readonly logger: Logger, private readonly handler: () => JobHandler) {
    this.client = new SQSClient({ region: env.AWS_REGION, maxAttempts: 3 });
  }
  start(): void {
    if (this.loopPromise || !this.env.SCHEDULER_QUEUE_URL) return;
    this.loopPromise = this.loop().finally(() => { this.loopPromise = undefined; });
  }
  async pollOnce(): Promise<void> {
    if (!this.env.SCHEDULER_QUEUE_URL) return;
    const response = await this.client.send(new ReceiveMessageCommand({ QueueUrl: this.env.SCHEDULER_QUEUE_URL, WaitTimeSeconds: this.env.SCHEDULER_POLL_WAIT_SEC, MaxNumberOfMessages: 10, VisibilityTimeout: 60 }), { abortSignal: this.controller.signal });
    await this.processMessages(response.Messages ?? []);
  }
  async processMessages(messages: Array<{ Body?: string; ReceiptHandle?: string; MessageId?: string }>): Promise<void> {
    for (const message of messages) {
      const receiptHandle = message.ReceiptHandle;
      try {
        const payload = JSON.parse(message.Body ?? "{}") as { v?: number; jobId?: string };
        if (payload.v !== 1 || !payload.jobId || !receiptHandle) {
          if (receiptHandle) await this.client.send(new DeleteMessageCommand({ QueueUrl: this.env.SCHEDULER_QUEUE_URL, ReceiptHandle: receiptHandle }));
          continue;
        }
        const job = await loadScheduleMirror(this.storage, payload.jobId);
        if (!job) {
          this.logger.warn({ jobId: payload.jobId }, "scheduler.unknown_job");
          await this.client.send(new DeleteMessageCommand({ QueueUrl: this.env.SCHEDULER_QUEUE_URL, ReceiptHandle: receiptHandle }));
          continue;
        }
        if (await markFired(this.storage, this.clock, job)) {
          try { await this.handler()(job); }
          catch (error) { await clearFired(this.storage, job); throw error; }
        }
        await this.client.send(new DeleteMessageCommand({ QueueUrl: this.env.SCHEDULER_QUEUE_URL, ReceiptHandle: receiptHandle }));
        await removeScheduleMirror(this.storage, job.id);
      } catch (error) {
        this.logger.error({ err: error, jobId: message.MessageId }, "scheduler.message_failed");
      }
    }
  }
  private async loop(): Promise<void> {
    const backoff = [1000, 2000, 5000, 10000];
    let failures = 0;
    while (!this.controller.signal.aborted) {
      try {
        const response = await this.client.send(new ReceiveMessageCommand({ QueueUrl: this.env.SCHEDULER_QUEUE_URL, WaitTimeSeconds: this.env.SCHEDULER_POLL_WAIT_SEC, MaxNumberOfMessages: 10, VisibilityTimeout: 60 }), { abortSignal: this.controller.signal });
        failures = 0;
        await this.processMessages(response.Messages ?? []);
      } catch (error) {
        if (this.controller.signal.aborted) break;
        this.logger.warn({ err: error, failures: failures + 1 }, "scheduler.poll_failed");
        const delayMs = backoff[Math.min(failures, backoff.length - 1)]!;
        failures++;
        await new Promise<void>((resolve) => {
          const onAbort = () => { clearTimeout(timer); resolve(); };
          const timer = setTimeout(() => { this.controller.signal.removeEventListener("abort", onAbort); resolve(); }, delayMs);
          this.controller.signal.addEventListener("abort", onAbort, { once: true });
        });
      }
    }
  }
  async close(): Promise<void> {
    this.controller.abort();
    await this.loopPromise?.catch(() => undefined);
    this.client.destroy();
  }
}
