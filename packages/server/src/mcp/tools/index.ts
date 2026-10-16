import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { register as registerPing } from "./ping.js";
import { register as registerStatus } from "./status.js";
import { register as registerRegionInfo } from "./regionInfo.js";

export function registerAllTools(server: McpServer, ctx: AppContext): void {
  registerPing(server, ctx);
  registerStatus(server, ctx);
  registerRegionInfo(server, ctx);
}
