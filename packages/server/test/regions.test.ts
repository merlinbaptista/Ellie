import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegionPack, createBuiltInRegistry } from "@ellie/schema";
import { createApp } from "../src/app.js";
import { buildContext } from "../src/context.js";
import { loadEnv } from "../src/config/env.js";
import { createClock } from "../src/lib/clock.js";
import { createMemoryStorage } from "../src/adapters/storage/memory.js";
import { closeAllSessions } from "../src/mcp/transport.js";

const running: Array<{ close: () => void }> = [];
afterEach(async () => {
  await closeAllSessions();
  for (const resource of running.splice(0)) resource.close();
});

describe("region registry and MCP resources", () => {
  it("loads built-ins and falls back to DEFAULT for unknown countries", () => {
    const registry = createBuiltInRegistry();
    expect(registry.list()).toHaveLength(4);
    expect(registry.forCountry("FR").packId).toBe("DEFAULT");
  });

  it("answers regional item questions and exposes pack list/template resources", async () => {
    const env = loadEnv({ NODE_ENV: "test", MOCK_STORAGE_MODE: "memory" });
    const clock = createClock("2026-10-16T03:00:00.000Z");
    const ctx = await buildContext({ env, clock, storage: createMemoryStorage(clock) });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    running.push({ close: () => server.close() });
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const client = new Client({ name: "ellie-regions-test", version: "0.1.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const india = await client.callTool({ name: "ellie_region_info", arguments: { country: "in", item: "gas" } });
      expect(india.content[0]?.text).toContain("25");
      expect(india.content[0]?.text.toLowerCase()).toContain("cylinder");
      const us = await client.callTool({ name: "ellie_region_info", arguments: { country: "US", item: "propane" } });
      expect(us.content[0]?.text.toLowerCase()).toContain("tank");
      expect(us.content[0]?.text.toLowerCase()).toContain("gallons");
      expect(us.content[0]?.text).toContain("°F");
      expect(us.content[0]?.text).not.toContain("rupees");
      const resources = await client.listResources();
      expect(resources.resources.some((resource) => resource.uri === "ellie://region-packs")).toBe(true);
      const packResource = await client.readResource({ uri: "ellie://region-packs/IN" });
      const serialized = packResource.contents[0]?.text;
      expect(RegionPack.safeParse(JSON.parse(String(serialized))).success).toBe(true);
    } finally {
      await client.close();
      (ctx.scheduler as { close?: () => void }).close?.();
    }
  });
});
