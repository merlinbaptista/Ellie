import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { activeSessionCount } from "../transport.js";
import { toolResponse } from "../result.js";
import { getRecentTimings, withTiming } from "../withTiming.js";

export async function statusData(ctx: AppContext) {
  const health = await ctx.storage.healthCheck();
  const timings = getRecentTimings().map((entry) => entry.ms).sort((a, b) => a - b);
  const p50 = timings.length ? timings[Math.floor((timings.length - 1) * 0.5)] : 0;
  const max = timings.length ? Math.max(...timings) : 0;
  const drivers = Object.fromEntries(Object.entries(ctx.drivers).map(([service, decision]) => [service, {
    requested: decision.requested,
    resolved: decision.resolved,
    implementation: decision.implementation,
    missingKeys: decision.missingKeys,
  }]));
  const regions = ctx.regions.list().map(({ packId, version }) => ({ packId, version, unverifiedCount: ctx.regions.unverifiedFacts(packId).length }));
  return {
    version: ctx.version,
    specVersion: "2025-11-25",
    uptimeSec: Math.floor((Date.now() - ctx.startedAt.getTime()) / 1000),
    activeMcpSessions: activeSessionCount(),
    drivers,
    regions,
    storageHealth: health,
    recentToolTimings: { count: timings.length, p50, max },
    clockMode: ctx.clock.isFake() ? "fake" : "real",
  };
}

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "ellie_status",
    {
      title: "Ellie status",
      description: "Inspect Ellie service drivers, storage health, latency, and clock mode.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withTiming("ellie_status", ctx, async () => {
      const data = await statusData(ctx);
      const mockCount = Object.values(ctx.drivers).filter((decision) => decision.resolved === "mock").length;
      return toolResponse({
        speech: mockCount ? `All systems running. ${mockCount} services are on demo mode until AWS keys are added.` : "All systems running on AWS-backed drivers.",
        data,
        card: {
          title: "Ellie system status",
          items: Object.entries(ctx.drivers).map(([service, decision]) => ({
            label: service,
            value: `${decision.resolved} / ${decision.implementation}`,
            status: decision.resolved === "aws" ? "ok" as const : "info" as const,
          })),
        },
      });
    }),
  );
}
