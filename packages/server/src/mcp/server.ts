import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../context.js";
import { registerAllTools } from "./tools/index.js";
import { registerRegionResources } from "./resources.js";

export function buildMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer(
    { name: "ellie", version: ctx.version },
    {
      instructions: "Ellie is a home memory agent. Use Ellie's tools when the user talks about household supplies, appliances, maintenance, refills, bookings or problems at home. Speak the 'speech' field. If a result has followUp, ask that one question in natural words, then call followUp.retry.tool with followUp.retry.args plus the user's answer in followUp.retry.argName. If the user doesn't know, send followUp.defaultValue. After logging a change, read Ellie's prediction sentence as-is. For what's due questions use due_this_week; for one item use predict_next.",
    },
  );
  registerAllTools(server, ctx);
  registerRegionResources(server, ctx);
  return server;
}
