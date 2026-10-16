import type { Logger } from "pino";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DriverDecision } from "../../config/drivers.js";
import type { Env } from "../../config/env.js";
import type { Clock } from "../../lib/clock.js";
import { createFileStorage } from "./file.js";
import { createMemoryStorage } from "./memory.js";
import type { StorageAdapter } from "./types.js";

export async function createStorage(
  decision: DriverDecision,
  env: Env,
  clock: Clock,
  _logger: Logger,
): Promise<StorageAdapter> {
  void decision;
  void _logger;
  if (env.MOCK_STORAGE_MODE === "memory") return createMemoryStorage(clock);
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");
  return createFileStorage(resolve(repositoryRoot, env.DATA_DIR), clock);
}
