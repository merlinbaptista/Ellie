import { randomUUID } from "node:crypto";
import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { NotifierAdapter, OutboundMessage, SendResult } from "./types.js";

export class ConsoleNotifier implements NotifierAdapter {
  readonly name = "console-outbox";
  constructor(private readonly storage: StorageAdapter, private readonly clock: Clock) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const id = randomUUID();
    const sentAt = this.clock.now().toISOString();
    const result: SendResult = { id, status: "sent", provider: this.name };
    const maskedTo = msg.channel === "sms" ? `${"*".repeat(Math.max(0, msg.to.length - 4))}${msg.to.slice(-4)}` : msg.to;
    console.info(`\n+--------------------------------------+\n| Ellie phone inbox                    |\n| To: ${maskedTo.padEnd(31)}|\n| ${msg.body.slice(0, 34).padEnd(36)}|\n+--------------------------------------+`);
    await this.storage.put({
      pk: "OUTBOX",
      sk: `MSG#${sentAt}#${id}`,
      type: "outbound-message",
      data: { ...msg, ...result, sentAt },
    });
    return result;
  }

  async listOutbox(householdId?: string, limit = 100): Promise<Array<OutboundMessage & SendResult & { sentAt: string }>> {
    const rows = await this.storage.query("OUTBOX", { skPrefix: "MSG#", descending: true, limit });
    return rows
      .map((row) => row.data as unknown as OutboundMessage & SendResult & { sentAt: string })
      .filter((message) => !householdId || message.householdId === householdId);
  }
}
