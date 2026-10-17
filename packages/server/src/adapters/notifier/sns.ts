import { randomUUID } from "node:crypto";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { Env } from "../../config/env.js";
import type { Clock } from "../../lib/clock.js";
import type { Logger } from "pino";
import type { StorageAdapter } from "../storage/types.js";
import type { NotifierAdapter, OutboundMessage, SendResult } from "./types.js";
import { mirrorOutbox } from "./outbox.js";
import { outboxMessagePrefix, outboxPk } from "../../data/keys.js";
import { maskEmail, maskPhone } from "../../privacy/redact.js";

function masked(value: string): string { return value.includes("@") ? maskEmail(value) : maskPhone(value); }
function failureReason(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "AuthorizationError" || name === "AccessDeniedException") return "not_authorized";
  if (name === "OptedOut" || name === "OptedOutException") return "recipient_opted_out";
  if (name === "InvalidParameter" || name === "InvalidParameterException") return "invalid_message";
  return "sns_unavailable";
}

export class SnsNotifier implements NotifierAdapter {
  readonly name = "sns";
  private readonly client: SNSClient;
  constructor(private readonly env: Env, private readonly storage: StorageAdapter, private readonly clock: Clock, private readonly logger: Logger) {
    this.client = new SNSClient({ region: env.AWS_REGION, maxAttempts: 3, requestHandler: new NodeHttpHandler({ requestTimeout: 3000 }) });
  }

  async send(msg: OutboundMessage): Promise<SendResult> {
    let result: SendResult;
    const sms = msg.channel === "sms" && this.env.SNS_SMS_ENABLED && /^\+[1-9]\d{7,14}$/.test(msg.to);
    try {
      const messageAttributes: Record<string, { DataType: string; StringValue: string }> = sms
        ? { "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: this.env.SNS_SMS_TYPE } }
        : { householdId: { DataType: "String", StringValue: msg.householdId }, kind: { DataType: "String", StringValue: msg.kind } };
      if (sms && this.env.SNS_SMS_SENDER_ID) messageAttributes["AWS.SNS.SMS.SenderID"] = { DataType: "String", StringValue: this.env.SNS_SMS_SENDER_ID };
      if (sms && this.env.SNS_SMS_ENTITY_ID) messageAttributes["AWS.MM.SMS.EntityId"] = { DataType: "String", StringValue: this.env.SNS_SMS_ENTITY_ID };
      if (sms && this.env.SNS_SMS_TEMPLATE_ID) messageAttributes["AWS.MM.SMS.TemplateId"] = { DataType: "String", StringValue: this.env.SNS_SMS_TEMPLATE_ID };
      const response = await this.client.send(new PublishCommand(sms
        ? { PhoneNumber: msg.to, Message: msg.body, MessageAttributes: messageAttributes }
        : { TopicArn: this.env.SNS_TOPIC_ARN, Subject: (msg.subject ?? `Ellie: ${msg.kind}`).replace(/[^\x20-\x7E]/g, " ").slice(0, 100), Message: msg.subject ? `${msg.subject}\n\n${msg.body}` : msg.body, MessageAttributes: messageAttributes }));
      result = { id: response.MessageId ?? randomUUID(), status: "sent", provider: "sns" };
    } catch (error) {
      const reason = failureReason(error);
      this.logger.warn({ householdId: msg.householdId, channel: msg.channel, to: masked(msg.to), reason }, "sns.publish_failed");
      result = { id: randomUUID(), status: "failed", provider: "sns", error: reason };
    }
    await mirrorOutbox(this.storage, this.clock, msg, { ...result, provider: "sns" }, this.env.OUTBOX_RETENTION_DAYS);
    return result;
  }

  async listOutbox(householdId?: string, limit = 100): Promise<Array<OutboundMessage & SendResult & { sentAt: string }>> {
    const rows = await this.storage.query(outboxPk(), { skPrefix: outboxMessagePrefix(), descending: true, limit });
    return rows.map((row) => row.data as unknown as OutboundMessage & SendResult & { sentAt: string }).filter((message) => !householdId || message.householdId === householdId);
  }

  close(): void { this.client.destroy(); }
}
