import { afterAll, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { CreateScheduleCommand, DeleteScheduleCommand, SchedulerClient, UpdateScheduleCommand } from "@aws-sdk/client-scheduler";
import { EventBridgeScheduler } from "../src/adapters/scheduler/eventbridge.js";
import { createTestContext } from "./helpers.js";
import type { ScheduledJob } from "../src/adapters/scheduler/types.js";

const schedulerMock = mockClient(SchedulerClient);
afterAll(() => schedulerMock.restore());
const job: ScheduledJob = { id: "remind:demo-blr:item/one", runAtUtc: "2026-11-01T15:30:00.000Z", timeZone: "Asia/Kolkata", payload: { kind: "reminder", householdId: "demo-blr", itemId: "itm_test-1", message: "due" } };

describe("EventBridge scheduler", () => {
  it("creates a sanitized schedule name and a local-time at() expression", async () => {
    schedulerMock.reset();
    let request: Record<string, unknown> = {};
    schedulerMock.on(CreateScheduleCommand).callsFake(async (input) => { request = input as unknown as Record<string, unknown>; return {}; });
    const ctx = await createTestContext();
    const scheduler = new EventBridgeScheduler({ ...ctx.env, AWS_REGION: "ap-south-1", EVENTBRIDGE_SCHEDULE_GROUP: "ellie", EVENTBRIDGE_TARGET_ARN: "arn:aws:sqs:ap-south-1:123456789012:queue", EVENTBRIDGE_ROLE_ARN: "arn:aws:iam::123456789012:role/scheduler", SCHEDULER_QUEUE_URL: undefined }, ctx.storage, ctx.clock, ctx.logger);
    await scheduler.schedule(job);
    expect(String(request.Name)).toMatch(/^ellie-remind-demo-blr-item-one-[a-f0-9]{8}$/);
    expect((request.Name as string).length).toBeLessThanOrEqual(64);
    expect(request.ScheduleExpression).toBe("at(2026-11-01T21:00:00)");
    expect(request.ScheduleExpressionTimezone).toBe("Asia/Kolkata");
    expect((request.Target as { Arn: string }).Arn).toContain(":queue");
    expect(await scheduler.list("demo-blr")).toHaveLength(1);
    await scheduler.close();
    (ctx.scheduler as { close?: () => void }).close?.();
  });

  it("updates on ConflictException and ignores missing schedule cancellation", async () => {
    schedulerMock.reset();
    schedulerMock.on(CreateScheduleCommand).rejects(Object.assign(new Error("exists"), { name: "ConflictException" }));
    schedulerMock.on(UpdateScheduleCommand).resolves({});
    schedulerMock.on(DeleteScheduleCommand).rejects(Object.assign(new Error("missing"), { name: "ResourceNotFoundException" }));
    const ctx = await createTestContext();
    const scheduler = new EventBridgeScheduler({ ...ctx.env, AWS_REGION: "us-east-1", EVENTBRIDGE_TARGET_ARN: "queue-arn", EVENTBRIDGE_ROLE_ARN: "role-arn", SCHEDULER_QUEUE_URL: undefined }, ctx.storage, ctx.clock, ctx.logger);
    await scheduler.schedule({ ...job, runAtUtc: "2026-11-10T00:00:00.000Z", id: "retry-job" });
    await scheduler.cancel("retry-job");
    expect(await scheduler.list()).toHaveLength(0);
    await scheduler.close();
    (ctx.scheduler as { close?: () => void }).close?.();
  });
});
