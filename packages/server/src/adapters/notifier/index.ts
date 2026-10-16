import type { Clock } from "../../lib/clock.js";
import type { DriverDecision } from "../../config/drivers.js";
import type { StorageAdapter } from "../storage/types.js";
import { ConsoleNotifier } from "./console.js";
import { SnsNotifier } from "./sns.js";
import type { NotifierAdapter } from "./types.js";
import type { Env } from "../../config/env.js";
import type { Logger } from "pino";

export function createNotifier(decision: DriverDecision, storage: StorageAdapter, clock: Clock, env: Env, logger: Logger): NotifierAdapter {
  return decision.implementation === "sns" ? new SnsNotifier(env, storage, clock, logger) : new ConsoleNotifier(storage, clock);
}
