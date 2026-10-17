import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";
import { expireOutbox } from "../src/privacy/retention.js";
import { outboxMessageSk } from "../src/data/keys.js";

describe("privacy retention", () => {
  it("backfills legacy outbox rows using their original send time and wall clock", async () => {
    const ctx = await createTestContext();
    const sentAt = "2026-10-01T03:00:00.000Z";
    await ctx.storage.put({ pk: "OUTBOX", sk: outboxMessageSk(sentAt, "legacy-msg"), type: "outbound-message", data: { householdId: "demo-blr", sentAt } });
    expect(await expireOutbox(ctx)).toBe(1);
    const row = await ctx.storage.get("OUTBOX", outboxMessageSk(sentAt, "legacy-msg"));
    expect(row?.ttlClock).toBe("wall");
    expect(row?.ttl).toBe(Math.floor(Date.parse(sentAt) / 1000) + ctx.env.OUTBOX_RETENTION_DAYS * 86400);
  });
});
