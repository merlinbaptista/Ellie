import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { activeSessionCount } from "../transport.js";
import { toolResponse } from "../result.js";
import { getRecentTimings, withTiming } from "../withTiming.js";
import { getLlmDiagnostics } from "../../diagnosis/llmRanker.js";
import { linkPk } from "../../data/keys.js";

export async function statusData(ctx: AppContext) {
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
  const memoryHealth = await ctx.storage.healthCheck();
  const llmDiagnostics = getLlmDiagnostics();
  const schedulerHealth = ctx.scheduler.healthCheck ? await ctx.scheduler.healthCheck() : undefined;
  const householdCount = await ctx.repositories.households.count();
  const households = await ctx.repositories.households.list();
  let predictionCount = 0;
  let scheduledReminders = 0;
  for (const household of households) predictionCount += (await ctx.repositories.predictions.listForHousehold(household.householdId)).length;
  scheduledReminders = (await ctx.scheduler.list()).filter((job) => job.payload.kind === "reminder").length;
  return {
    version: ctx.version,
    specVersion: "2025-11-25",
    uptimeSec: Math.floor((Date.now() - ctx.startedAt.getTime()) / 1000),
    activeMcpSessions: activeSessionCount(),
    drivers,
    regions,
    memory: { implementation: ctx.drivers.storage.implementation, households: householdCount, healthy: memoryHealth.ok },
    predictions: { stored: predictionCount, scheduledReminders },
    llm: {
      implementation: ctx.llm.name,
      ...(ctx.llm.name === "bedrock" ? { model: ctx.env.BEDROCK_MODEL_ID } : {}),
      lastLatencyMs: llmDiagnostics.lastLatencyMs,
      fallbacks24h: llmDiagnostics.fallbacks24h,
    },
    notifier: { implementation: ctx.notifier.name, smsEnabled: ctx.env.SNS_SMS_ENABLED, ...(ctx.env.SNS_TOPIC_ARN ? { topic: ctx.env.SNS_TOPIC_ARN } : {}) },
    scheduler: { implementation: ctx.scheduler.name, scheduled: schedulerHealth?.scheduled ?? (await ctx.scheduler.list()).length, ...(schedulerHealth?.queueDepth !== undefined ? { queueDepth: schedulerHealth.queueDepth } : {}) },
    links: { activeShortLinks: (await ctx.storage.query(linkPk())).filter((row) => row.type === "phone-short-link").length },
    storageHealth: memoryHealth,
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
