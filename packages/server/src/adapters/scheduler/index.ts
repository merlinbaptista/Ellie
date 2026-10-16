import type { Clock } from "../../lib/clock.js";
import type { DriverDecision } from "../../config/drivers.js";
import type { StorageAdapter } from "../storage/types.js";
import { LocalScheduler } from "./local.js";
import type { SchedulerAdapter } from "./types.js";

export function createScheduler(_decision: DriverDecision, storage: StorageAdapter, clock: Clock): SchedulerAdapter {
  return new LocalScheduler(storage, clock);
}
