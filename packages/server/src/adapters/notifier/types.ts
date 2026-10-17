export interface OutboundMessage {
  householdId: string;
  itemId?: string;
  channel: "sms" | "email";
  to: string;
  subject?: string;
  body: string;
  link?: string;
  kind: "fix" | "booking" | "summary" | "privacy" | "reminder" | "test";
}
export interface SendResult { id: string; status: "sent" | "queued" | "failed"; provider: string; error?: string }
export interface NotifierAdapter {
  readonly name: string;
  send(msg: OutboundMessage): Promise<SendResult>;
  listOutbox?(householdId?: string, limit?: number): Promise<Array<OutboundMessage & SendResult & { sentAt: string }>>;
  close?(): void | Promise<void>;
}
