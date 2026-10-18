import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { createTestContext } from "./helpers.js";
import { mcpAppStatus } from "../src/mcp/apps.js";
import { registerIntegrationCleanup } from "./integrationCleanup.js";

const closeClients: Array<() => Promise<void>> = [];
afterAll(async () => { await closeAllSessions(); await Promise.all(closeClients.splice(0).map((close) => close())); });

describe("MCP Apps card registration", () => {
  it("registers the html resource and annotates five tools when the app bundle exists", async () => {
    if (!mcpAppStatus().enabled) return;
    expect(mcpAppStatus().bytes).toBeLessThanOrEqual(150 * 1024);
    const ctx = await createTestContext();
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const client = new Client({ name: "mcp-apps-test", version: "1.0.0" });
    closeClients.push(() => client.close());
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
    const tools = await client.listTools();
    for (const name of ["due_this_week", "predict_next", "get_history", "diagnose", "send_to_phone"]) {
      const tool = tools.tools.find((entry) => entry.name === name);
      expect(tool?._meta).toMatchObject({ ui: { resourceUri: "ui://ellie/card.html" }, "ui/resourceUri": "ui://ellie/card.html" });
    }
    const resources = await client.listResources();
    expect(resources.resources.some((resource) => resource.uri === "ui://ellie/card.html" && resource.mimeType === "text/html;profile=mcp-app")).toBe(true);
    const html = await client.readResource({ uri: "ui://ellie/card.html" });
    expect(String(html.contents[0]?.text)).toContain("Headsup card is waiting for the tool result");
  });
});
