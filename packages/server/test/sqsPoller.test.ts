import { afterAll, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { SqsPoller } from "../src/adapters/scheduler/sqsPoller.js";
import { putScheduleMirror, hasFired } from "../src/adapters/scheduler/mirror.js";
import { createTestContext } from "./helpers.js";
import type { ScheduledJob } from "../src/adapters/scheduler/types.js";

const sqsMock = mockClient(SQSClient);
afterAll(() => sqsMock.restore());
const job: ScheduledJob = { id: "job-sqs-1", runAtUtc: "2026-10-17T03:00:00.000Z", timeZone: "Asia/Kolkata", payload: { kind: "reminder", householdId: "hh_sqs-1", itemId: "itm_sqs-1", message: "due" } };

describe("SQS scheduler poller", () => {
  it("fires from the mirror, records the marker, then deletes the message", async () => {
    sqsMock.reset();
    sqsMock.on(DeleteMessageCommand).resolves({});
    const ctx = await createTestContext();
    await putScheduleMirror(ctx.storage, job);
    const fire = async (received: ScheduledJob) => { expect(received.id).toBe(job.id); };
    const poller = new SqsPoller({ ...ctx.env, AWS_REGION: "us-east-1", SCHEDULER_QUEUE_URL: "queue-url" }, ctx.storage, ctx.clock, ctx.logger, () => fire);
    await poller.processMessages([{ Body: JSON.stringify({ v: 1, jobId: job.id }), ReceiptHandle: "receipt-1" }]);
    expect(await hasFired(ctx.storage, job)).toBe(true);
    expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(1);
    await poller.close();
  });

  it("leaves failed jobs for redrive, deletes unknown jobs, and suppresses duplicate fires", async () => {
    sqsMock.reset();
    sqsMock.on(DeleteMessageCommand).resolves({});
    const ctx = await createTestContext();
    await putScheduleMirror(ctx.storage, job);
    let calls = 0;
    const poller = new SqsPoller({ ...ctx.env, AWS_REGION: "us-east-1", SCHEDULER_QUEUE_URL: "queue-url" }, ctx.storage, ctx.clock, ctx.logger, () => async () => { calls++; if (calls === 1) throw new Error("temporary"); });
    const message = { Body: JSON.stringify({ v: 1, jobId: job.id }), ReceiptHandle: "receipt-2" };
    await poller.processMessages([message]);
    expect(await hasFired(ctx.storage, job)).toBe(false);
    expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(0);
    await poller.processMessages([message]);
    expect(calls).toBe(2);
    await poller.processMessages([message]);
    expect(calls).toBe(2);
    expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(2);
    await poller.processMessages([{ Body: JSON.stringify({ v: 1, jobId: "unknown" }), ReceiptHandle: "receipt-3" }]);
    expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(3);
    await poller.close();
  });

  it("pollOnce requests long polling with configured bounds", async () => {
    sqsMock.reset();
    let receive: Record<string, unknown> = {};
    sqsMock.on(ReceiveMessageCommand).callsFake(async (input) => { receive = input as unknown as Record<string, unknown>; return { Messages: [] }; });
    const ctx = await createTestContext();
    const poller = new SqsPoller({ ...ctx.env, AWS_REGION: "us-east-1", SCHEDULER_QUEUE_URL: "queue-url", SCHEDULER_POLL_WAIT_SEC: 7 }, ctx.storage, ctx.clock, ctx.logger, () => async () => undefined);
    await poller.pollOnce();
    expect(receive.WaitTimeSeconds).toBe(7);
    expect(receive.MaxNumberOfMessages).toBe(10);
    expect(receive.VisibilityTimeout).toBe(60);
    await poller.close();
  });
});
