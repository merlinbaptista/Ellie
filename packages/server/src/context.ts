import type { Logger } from "pino";
import type { DriverDecision, ServiceName } from "./config/drivers.js";
import { resolveDrivers } from "./config/drivers.js";
import type { Env } from "./config/env.js";
import { getEnv } from "./config/env.js";
import { createStorage } from "./adapters/storage/index.js";
import type { StorageAdapter } from "./adapters/storage/types.js";
import { createLlm } from "./adapters/llm/index.js";
import type { LlmAdapter } from "./adapters/llm/types.js";
import { createNotifier } from "./adapters/notifier/index.js";
import type { NotifierAdapter } from "./adapters/notifier/types.js";
import { createScheduler } from "./adapters/scheduler/index.js";
import type { SchedulerAdapter } from "./adapters/scheduler/types.js";
import type { Clock } from "./lib/clock.js";
import { createClock } from "./lib/clock.js";
import { logger as rootLogger } from "./lib/logger.js";
import type { RegionRegistry } from "@ellie/schema";
import { createServerRegionRegistry } from "./regions/registry.js";
import { createRepositories, type Repositories } from "./data/index.js";

export interface AppContext {
  env: Env;
  drivers: Record<ServiceName, DriverDecision>;
  clock: Clock;
  logger: Logger;
  storage: StorageAdapter;
  llm: LlmAdapter;
  notifier: NotifierAdapter;
  scheduler: SchedulerAdapter;
  regions: RegionRegistry;
  repositories: Repositories;
  startedAt: Date;
  version: string;
}

export async function buildContext(overrides: Partial<AppContext> = {}): Promise<AppContext> {
  const env = overrides.env ?? getEnv();
  const drivers = overrides.drivers ?? resolveDrivers(env);
  const clock = overrides.clock ?? createClock(env.ELLIE_FAKE_NOW);
  const log = overrides.logger ?? rootLogger;
  for (const [service, decision] of Object.entries(drivers)) {
    if (decision.resolved === "aws" && service !== "storage") {
      log.warn(`${service}: AWS adapter arrives in Module ${({ storage: 3, llm: 5, notifier: 6, scheduler: 6 } as Record<string, number>)[service]} — using mock for now`);
    }
  }
  const storage = overrides.storage ?? await createStorage(drivers.storage, env, clock, log);
  const regions = overrides.regions ?? await createServerRegionRegistry(log, env.REGION_PACKS_DIR);
  const repositories = overrides.repositories ?? createRepositories(storage, clock);
  return {
    env,
    drivers,
    clock,
    logger: log,
    storage,
    llm: overrides.llm ?? createLlm(drivers.llm),
    notifier: overrides.notifier ?? createNotifier(drivers.notifier, storage, clock),
    scheduler: overrides.scheduler ?? createScheduler(drivers.scheduler, storage, clock),
    regions,
    repositories,
    startedAt: overrides.startedAt ?? new Date(),
    version: overrides.version ?? "0.1.0",
  };
}
