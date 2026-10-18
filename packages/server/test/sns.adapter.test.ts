import { afterAll, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { SnsNotifier } from "../src/adapters/notifier/sns.js";
import { createTestContext } from "./helpers.js";

const snsMock = mockClient(SNSClient);
afterAll(() => snsMock.restore());

describe("SNS notifier", () => {
  it("publishes SMS with only configured DLT metadata and mirrors to outbox", async () => {
    snsMock.reset();
    let sent: Record<string, unknown> = {};
    snsMock.on(PublishCommand).callsFake(async (input) => { sent = input as unknown as Record<string, unknown>; return { MessageId: "sns-message-1" }; });
    const ctx = await createTestContext();
    const env = { ...ctx.env, AWS_REGION: "ap-south-1", SNS_SMS_ENABLED: true, SNS_SMS_TYPE: "Transactional" as const, SNS_SMS_ENTITY_ID: "entity-1", SNS_SMS_TEMPLATE_ID: "template-1", SNS_TOPIC_ARN: undefined };
    const notifier = new SnsNotifier(env, ctx.storage, ctx.clock, ctx.logger);
    const result = await notifier.send({ householdId: "hh_sns-1", channel: "sms", to: "+919876543210", body: "Headsup message", kind: "fix" });
    expect(sent.PhoneNumber).toBe("+919876543210");
    expect((sent.MessageAttributes as Record<string, { StringValue: string }>) ["AWS.MM.SMS.EntityId"]?.StringValue).toBe("entity-1");
    expect(result).toMatchObject({ id: "sns-message-1", status: "sent", provider: "sns" });
    expect(await notifier.listOutbox("hh_sns-1")).toHaveLength(1);
    notifier.close();
  });

  it("uses a topic when SMS is unavailable and mirrors provider failures", async () => {
    snsMock.reset();
    let topicInput: Record<string, unknown> = {};
    snsMock.on(PublishCommand).callsFake(async (input) => { topicInput = input as unknown as Record<string, unknown>; return { MessageId: "topic-1" }; });
    const ctx = await createTestContext();
    const notifier = new SnsNotifier({ ...ctx.env, AWS_REGION: "us-east-1", SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789012:ellie", SNS_SMS_ENABLED: false }, ctx.storage, ctx.clock, ctx.logger);
    await notifier.send({ householdId: "hh_sns-2", channel: "email", to: "a@example.com", subject: "Headsup update", body: "A note", kind: "summary" });
    expect(topicInput.TopicArn).toContain(":ellie");
    expect(topicInput.Subject).toBe("Headsup update");
    snsMock.reset();
    snsMock.on(PublishCommand).rejects(Object.assign(new Error("denied"), { name: "AuthorizationError" }));
    const failed = await notifier.send({ householdId: "hh_sns-2", channel: "email", to: "a@example.com", body: "Again", kind: "summary" });
    expect(failed).toMatchObject({ status: "failed", error: "not_authorized" });
    expect(await notifier.listOutbox("hh_sns-2")).toHaveLength(2);
    notifier.close();
  });
});
