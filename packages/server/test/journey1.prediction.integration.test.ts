import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";
import { registerIntegrationCleanup } from "./integrationCleanup.js";

describe("prediction Journey 1", () => {
  it("predicts, schedules, fires, and exposes the booking reminder", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    const client = new Client({ name: "prediction-journey", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
      const due = await client.callTool({ name: "due_this_week", arguments: { householdId: "demo-blr" } });
      expect(due.content[0]?.text.toLowerCase()).toContain("sediment filter");
      const changed = await client.callTool({ name: "log_event", arguments: { householdId: "demo-blr", item: "gas", type: "changed" } });
      expect(changed.content[0]?.text).toContain("23 November");
      expect(changed.content[0]?.text).toContain("18 November");
      const prediction = await client.callTool({ name: "predict_next", arguments: { householdId: "demo-blr", item: "gas" } });
      const data = prediction.structuredContent as { data: { mostUrgent: { confidence: string; nextDueLocal: string } } };
      expect(data.data.mostUrgent.confidence).toBe("high");
      expect(data.data.mostUrgent.nextDueLocal).toBe("2026-11-23");
      for (const job of await ctx.scheduler.list()) {
        if (job.payload.itemId !== data.data.mostUrgent.itemId) await ctx.scheduler.cancel(job.id);
      }
      const travel = await client.callTool({ name: "ellie_dev_time_travel", arguments: { to: "2026-11-18T09:05:00+05:30" } });
      const travelData = travel.structuredContent as { data: { firedJobs: number } };
      expect(travelData.data.firedJobs).toBe(1);
      const outbox = await fetch(`${base}/api/outbox?householdId=demo-blr`).then((response) => response.json()) as Array<{ body: string; link?: string }>;
      expect(outbox[0]?.body).toContain("gas cylinder");
      expect(outbox[0]?.link).toContain("wa.me/917588888824");
      const schedule = await fetch(`${base}/api/schedule?householdId=demo-blr`).then((response) => response.json()) as Array<{ id: string }>;
      expect(schedule.some((job) => job.id.includes(data.data.mostUrgent.itemId))).toBe(false);
      const apiTravel = await fetch(`${base}/api/dev/time-travel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) });
      expect(apiTravel.status).toBe(200);
      const predictions = await fetch(`${base}/api/households/demo-blr/predictions`).then((response) => response.json()) as Array<{ main: { itemId: string } | null }>;
      expect(predictions.some((entry) => entry.main?.itemId === data.data.mostUrgent.itemId)).toBe(true);
      const dueApi = await fetch(`${base}/api/households/demo-blr/due?days=7`).then((response) => response.json()) as { generatedForLocal: string; entries: unknown[] };
      expect(dueApi.generatedForLocal).toBe("2026-10-16");
      expect(Array.isArray(dueApi.entries)).toBe(true);
    } finally { await client.close(); }
  });
});
