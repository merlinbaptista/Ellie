import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../context.js";

export function registerRegionResources(server: McpServer, ctx: AppContext): void {
  server.registerResource(
    "region-packs",
    "ellie://region-packs",
    { title: "Headsup region packs", description: "Available household region packs.", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(ctx.regions.list()) }] }),
  );
  const template = new ResourceTemplate("ellie://region-packs/{packId}", {
    list: async () => ({ resources: ctx.regions.list().map((pack) => ({
      uri: `ellie://region-packs/${pack.packId}`,
      name: `${pack.name} (${pack.packId})`,
      description: `Region pack version ${pack.version}`,
      mimeType: "application/json",
    })) }),
  });
  server.registerResource(
    "region-pack",
    template,
    { title: "Resolved region pack", description: "Read a region pack merged with DEFAULT.", mimeType: "application/json" },
    async (uri, variables) => {
      const pack = ctx.regions.get(String(variables.packId));
      const regionPack = Object.fromEntries(Object.entries(pack).filter(([key]) => key !== "resolvedFrom"));
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(regionPack) }] };
    },
  );
}
