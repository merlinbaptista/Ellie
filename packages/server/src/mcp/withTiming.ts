import { performance } from "node:perf_hooks";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AppContext } from "../context.js";
import { toolError } from "./result.js";
import { currentAuthIdentity } from "../auth/identity.js";
import { toolResponse } from "./result.js";

export interface ToolTiming { tool: string; ms: number; ok: boolean }
const recentTimings: ToolTiming[] = [];
export function getRecentTimings(): ToolTiming[] { return recentTimings.map((timing) => ({ ...timing })); }

export function withTiming<A extends Record<string, unknown>>(
  toolName: string,
  ctx: AppContext,
  handler: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    const started = performance.now();
    let ok = true;
    try {
      const identity = currentAuthIdentity();
      if (identity) {
        const toolArgs = args as Record<string, unknown>;
        if (typeof toolArgs.householdId === "string" && toolArgs.householdId !== identity.householdId) return toolResponse({ speech: "I can only see your own home." });
        toolArgs.householdId = identity.householdId;
      }
      return await handler(args);
    } catch (error) {
      ok = false;
      ctx.logger.error({ err: error, tool: toolName }, "MCP tool failed");
      return toolError(error);
    } finally {
      const ms = Math.round(performance.now() - started);
      recentTimings.push({ tool: toolName, ms, ok });
      if (recentTimings.length > 50) recentTimings.shift();
      ctx.logger.info({ tool: toolName, ms, ok }, "MCP tool timing");
      if (ms > 500) ctx.logger.warn({ tool: toolName, ms }, "over Alexa+ 500 ms budget");
    }
  };
}
