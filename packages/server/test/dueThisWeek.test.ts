import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HomeEvent } from "@ellie/schema";
import { createApp } from "../src/app.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";
import { registerIntegrationCleanup } from "./integrationCleanup.js";

describe("due_this_week", () => {
  it("briefs both seeded households and includes overdue component predictions", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const client = new Client({ name: "due-this-week-test", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const started = performance.now();
      const blr = await client.callTool({ name: "due_this_week", arguments: { householdId: "demo-blr" } });
      expect(performance.now() - started).toBeLessThan(500);
      expect(blr.content[0]?.text.toLowerCase()).toContain("sediment filter");
      expect(blr.content[0]?.text.toLowerCase()).toContain("gas cylinder");
      const blrData = blr.structuredContent as { data: { entries: Array<{ status: string; component?: string }> } };
      expect(blrData.data.entries.some((entry) => entry.component === "sediment_filter" && entry.status === "overdue")).toBe(true);
      const tx = await client.callTool({ name: "due_this_week", arguments: { householdId: "demo-tx" } });
      expect(tx.content[0]?.text.toLowerCase()).toContain("propane tank");
      expect(tx.content[0]?.text.toLowerCase()).toContain("hvac filter");
      const propane = (await ctx.repositories.items.list("demo-tx")).find((item) => item.catalogKey === "propane_tank")!;
      await ctx.repositories.events.put(HomeEvent.parse({ schemaVersion: 1, eventId: "evt_tx-booking-late", householdId: "demo-tx", itemId: propane.itemId, type: "booked", timestamp: "2026-10-01T14:00:00.000Z", localDate: "2026-10-01", recordedAt: "2026-10-01T14:00:00.000Z", source: "seed", booking: { channel: "phone_call", expectedDeliveryLocal: "2026-10-03" } }));
      const delivery = await client.callTool({ name: "due_this_week", arguments: { householdId: "demo-tx" } });
      expect((delivery.structuredContent as { data: { entries: Array<{ status: string }> } }).data.entries.some((entry) => entry.status === "delivery")).toBe(true);
      ctx.clock.set("2026-11-25T03:00:00.000Z");
      const warranty = await client.callTool({ name: "due_this_week", arguments: { householdId: "demo-blr" } });
      expect((warranty.structuredContent as { data: { entries: Array<{ status: string }> } }).data.entries.some((entry) => entry.status === "warranty")).toBe(true);
    } finally { await client.close(); }
  });

  it("keeps the card glanceable while structuredContent stays complete", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const client = new Client({ name: "due-this-week-card-test", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const result = await client.callTool({ name: "due_this_week", arguments: { householdId: "demo-blr" } });
      const payload = result.structuredContent as { data: { entries: unknown[] }; card?: { items: unknown[]; actions?: unknown[] } };
      expect(payload.card?.items.length).toBeLessThanOrEqual(6);
      expect(payload.card?.actions?.length ?? 0).toBeLessThanOrEqual(3);
      expect(payload.data.entries.length).toBeGreaterThanOrEqual(payload.card?.items.length ?? 0);
    } finally { await client.close(); }
  });
});
