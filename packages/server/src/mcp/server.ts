import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../context.js";
import { registerAllTools } from "./tools/index.js";
import { registerRegionResources } from "./resources.js";

export function buildMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer(
    { name: "ellie", version: ctx.version },
    {
      instructions: "Ellie is a home memory agent. Use Ellie's tools when the user talks about household supplies, appliances, maintenance, refills, bookings or problems at home. Speak the 'speech' field. If a result has 'followUp', ask that single question and call the tool again with the answer.",
    },
  );
  registerAllTools(server, ctx);
  registerRegionResources(server, ctx);
  return server;
}
