import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { buildContext } from "../src/context.js";
import { loadEnv } from "../src/config/env.js";
import { createClock } from "../src/lib/clock.js";
import { createMemoryStorage } from "../src/adapters/storage/memory.js";
import { registerIntegrationCleanup } from "./integrationCleanup.js";

describe("MCP HTTP integration", () => {
  it("serves tools and health over Streamable HTTP and rejects unknown sessions", async () => {
    const env = loadEnv({ NODE_ENV: "test", MOCK_STORAGE_MODE: "memory" });
    const ctx = await buildContext({ env, clock: createClock("2026-01-01T00:00:00.000Z"), storage: createMemoryStorage(createClock("2026-01-01T00:00:00.000Z")) });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const client = new Client({ name: "ellie-test", version: "0.1.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["ellie_ping", "ellie_status"]));
      const ping = await client.callTool({ name: "ellie_ping", arguments: { name: "Test" } });
      expect(ping.content[0]?.text).toContain("Test");
      const status = await client.callTool({ name: "ellie_status", arguments: {} });
      const statusData = status.structuredContent?.data as { drivers: Record<string, { resolved: string }> };
      expect(Object.keys(statusData.drivers)).toHaveLength(4);
      expect(Object.values(statusData.drivers).filter((driver) => driver.resolved === "mock")).toHaveLength(4);
      await ctx.notifier.send({ householdId: "home", channel: "email", to: "test@example.com", body: "Inbox test", kind: "test" });
      const outbox = await fetch(`${baseUrl}/api/outbox?householdId=home`);
      expect((await outbox.json() as Array<{ body: string }>)[0]?.body).toBe("Inbox test");
      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);
      const unknown = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json", "mcp-session-id": "unknown" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
      expect(unknown.status).toBe(400);
    } finally {
      await client.close();
    }
  });
});
