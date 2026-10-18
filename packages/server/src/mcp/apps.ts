import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../context.js";

export const MCP_APP_URI = "ui://ellie/card.html";
const appPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../packages/mcp-app/dist/card.html");
let cached: string | null | undefined;
export function loadMcpAppHtml(): string | null {
  if (cached !== undefined) return cached;
  cached = existsSync(appPath) ? readFileSync(appPath, "utf8") : null;
  return cached;
}
export function mcpAppMeta(): Record<string, unknown> | undefined {
  return loadMcpAppHtml() ? { ui: { resourceUri: MCP_APP_URI }, "ui/resourceUri": MCP_APP_URI } : undefined;
}
export function mcpAppStatus(): { enabled: boolean; bytes: number } {
  const html = loadMcpAppHtml();
  return { enabled: Boolean(html), bytes: Buffer.byteLength(html ?? "") };
}
export function registerMcpAppResource(server: McpServer, ctx: AppContext): void {
  const html = loadMcpAppHtml();
  if (!html) {
    ctx.logger.warn({ path: appPath }, "mcp_apps.bundle_missing");
    return;
  }
  server.registerResource("Headsup interactive card", MCP_APP_URI, { title: "Headsup interactive card", description: "Interactive rendering of Headsup tool cards.", mimeType: "text/html;profile=mcp-app" }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/html;profile=mcp-app", text: html }] }));
}
