import { randomUUID } from "node:crypto";
import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { NotifierAdapter, OutboundMessage, SendResult } from "./types.js";
import { mirrorOutbox } from "./outbox.js";
import { outboxMessagePrefix, outboxPk } from "../../data/keys.js";
import { maskEmail, maskPhone, redactText } from "../../privacy/redact.js";

export class ConsoleNotifier implements NotifierAdapter {
  readonly name = "console-outbox";
  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock, private readonly retentionDays = 30) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const id = randomUUID();
    const result: SendResult = { id, status: "sent", provider: this.name };
    const maskedTo = msg.channel === "sms" ? maskPhone(msg.to) : maskEmail(msg.to);
    console.info(`\n+--------------------------------------+\n| Ellie phone inbox                    |\n| To: ${maskedTo.padEnd(31)}|\n| ${redactText(msg.body).slice(0, 34).padEnd(36)}|\n+--------------------------------------+`);
    await mirrorOutbox(this.storage, this.clock, msg, { ...result, id }, this.retentionDays);
    return result;
  }

  async listOutbox(householdId?: string, limit = 100): Promise<Array<OutboundMessage & SendResult & { sentAt: string }>> {
    const rows = await this.storage.query(outboxPk(), { skPrefix: outboxMessagePrefix(), descending: true, limit });
    return rows
      .map((row) => row.data as unknown as OutboundMessage & SendResult & { sentAt: string })
      .filter((message) => !householdId || message.householdId === householdId);
  }
}
