import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../context.js";
import { registerAllTools } from "./tools/index.js";
import { registerRegionResources } from "./resources.js";
import { registerMcpAppResource } from "./apps.js";
import { MCP_INSTRUCTIONS } from "./instructions.js";

export function buildMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer(
    { name: "ellie", version: ctx.version },
    {
      instructions: MCP_INSTRUCTIONS,
    },
  );
  registerAllTools(server, ctx);
  registerRegionResources(server, ctx);
  registerMcpAppResource(server, ctx);
  return server;
}
