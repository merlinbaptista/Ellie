import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { resolveDrivers } from "./config/drivers.js";
import { buildContext } from "./context.js";
import { logger } from "./lib/logger.js";
import { closeAllSessions } from "./mcp/transport.js";
import type { ScheduledJob } from "./adapters/scheduler/types.js";
import type { OutboundMessage } from "./adapters/notifier/types.js";

const env = loadEnv();
const drivers = resolveDrivers(env);
const ctx = await buildContext({ env, drivers });
ctx.scheduler.onFire(async (job: ScheduledJob) => {
  const msg: OutboundMessage = {
    householdId: job.payload.householdId,
    channel: "sms",
    to: "",
    body: job.payload.message.slice(0, 300),
    kind: "reminder",
  };
  await ctx.notifier.send(msg);
});

const app = createApp(ctx);
const httpServer = app.listen(env.PORT, env.HOST, () => {
  logger.info(`Ellie MCP server v${ctx.version} · spec 2025-11-25 · http://${env.HOST}:${env.PORT}/mcp`);
  for (const service of Object.values(ctx.drivers)) {
    const active = service.resolved === "aws" ? "mock (AWS adapter pending)" : "mock";
    logger.info(`${service.service.padEnd(10)} ${active.padEnd(27)} ${service.implementation} (${service.reason})`);
  }
  logger.info(`clock      ${ctx.clock.isFake() ? "fake" : "real"} (set ELLIE_FAKE_NOW to time-travel)`);
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 5_000);
  timeout.unref();
  httpServer.close(async () => {
    await closeAllSessions();
    const storage = ctx.storage as typeof ctx.storage & { flush?: () => Promise<void> };
    await storage.flush?.();
    const scheduler = ctx.scheduler as typeof ctx.scheduler & { close?: () => void };
    scheduler.close?.();
    clearTimeout(timeout);
    process.exit(0);
  });
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
