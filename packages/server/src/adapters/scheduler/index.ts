import type { Clock } from "../../lib/clock.js";
import type { DriverDecision } from "../../config/drivers.js";
import type { StorageAdapter } from "../storage/types.js";
import { LocalScheduler } from "./local.js";
import { EventBridgeScheduler } from "./eventbridge.js";
import type { SchedulerAdapter } from "./types.js";
import type { Env } from "../../config/env.js";
import type { Logger } from "pino";

export function createScheduler(decision: DriverDecision, storage: StorageAdapter, clock: Clock, env: Env, logger: Logger): SchedulerAdapter {
  return decision.implementation === "eventbridge" ? new EventBridgeScheduler(env, storage, clock, logger) : new LocalScheduler(storage, clock);
}
