import type { Clock } from "../../lib/clock.js";
import type { DriverDecision } from "../../config/drivers.js";
import type { StorageAdapter } from "../storage/types.js";
import { ConsoleNotifier } from "./console.js";
import type { NotifierAdapter } from "./types.js";

export function createNotifier(_decision: DriverDecision, storage: StorageAdapter, clock: Clock): NotifierAdapter {
  return new ConsoleNotifier(storage, clock);
}
