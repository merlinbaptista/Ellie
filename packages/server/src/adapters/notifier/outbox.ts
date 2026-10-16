import { randomUUID } from "node:crypto";
import type { Clock } from "../../lib/clock.js";
import type { StorageAdapter } from "../storage/types.js";
import type { OutboundMessage, SendResult } from "./types.js";
import { outboxMessageSk, outboxPk } from "../../data/keys.js";

export async function mirrorOutbox(storage: StorageAdapter, clock: Clock, message: OutboundMessage, result: SendResult): Promise<OutboundMessage & SendResult & { sentAt: string }> {
  const sentAt = clock.now().toISOString();
  const id = result.id || randomUUID();
  const saved = { ...message, ...result, id, sentAt };
  await storage.put({ pk: outboxPk(), sk: outboxMessageSk(sentAt, id), type: "outbound-message", data: saved });
  return saved;
}
