import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { seedDemo } from "../src/seed/seed.js";
import { addHousehold, createTestContext } from "./helpers.js";
import { registerIntegrationCleanup } from "./integrationCleanup.js";

describe("household memory tools", () => {
  it("completes the follow-up journey, reads seeded history, and rejects a full address", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_test-1", "IN");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const client = new Client({ name: "memory-integration", version: "0.1.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const first = await client.callTool({ name: "log_event", arguments: { householdId: "hh_test-1", item: "gas", type: "changed" } });
      const firstResult = first.structuredContent as { followUp?: { field: string; defaultValue?: string; retry?: { tool: string; argName: string; args: Record<string, unknown> } } };
      expect(firstResult.followUp?.field).toBe("previousWhen");
      expect(firstResult.followUp?.defaultValue).toBe("about 6 weeks ago");
      const retry = firstResult.followUp!.retry!;
      const second = await client.callTool({ name: retry.tool, arguments: { ...retry.args, [retry.argName]: "about five weeks ago" } });
      expect(second.content[0]?.text.toLowerCase()).toContain("5 weeks");
      const secondData = second.structuredContent as { data: { previousEvent: unknown; event: unknown } };
      expect(secondData.data.previousEvent).toBeTruthy();
      expect(secondData.data.event).toBeTruthy();

      const history = await client.callTool({ name: "get_history", arguments: { householdId: "demo-blr", item: "gas" } });
      const historyData = history.structuredContent as { data: { stats: { sampleSize: number; averageDays: number } } };
      expect(historyData.data.stats.sampleSize).toBe(4);
      expect(historyData.data.stats.averageDays).toBe(38);
      const householdList = await fetch(`http://127.0.0.1:${address.port}/api/households`);
      expect((await householdList.json() as Array<{ householdId: string }>).some((entry) => entry.householdId === "demo-blr")).toBe(true);
      const profile = await fetch(`http://127.0.0.1:${address.port}/api/households/demo-blr`).then((response) => response.json()) as { contact: { phone: string } };
      expect(profile.contact.phone).toBe("•••••• 0001");
      const apiHistory = await fetch(`http://127.0.0.1:${address.port}/api/households/demo-blr/history?item=gas`).then((response) => response.json()) as { timeline: unknown[] };
      expect(apiHistory.timeline.length).toBeGreaterThan(0);

      const invalid = await client.callTool({ name: "setup_household", arguments: { householdId: "hh_test-1", region: "12 MG Road, Bengaluru" } });
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0]?.text).toContain("city or postcode");
      const inferred = await client.callTool({ name: "setup_household", arguments: { householdId: "hh_setup-1", language: "en-IN" } });
      expect(inferred.content[0]?.text).toContain("settings for India");
      expect((inferred.structuredContent as { followUp?: { field: string } }).followUp?.field).toBe("confirm");
      const confirmed = await client.callTool({ name: "setup_household", arguments: { householdId: "hh_setup-1", language: "en-IN", confirm: true } });
      expect((confirmed.structuredContent as { followUp?: { field: string } }).followUp?.field).toBe("region");
    } finally {
      await client.close();
    }
  });
});
