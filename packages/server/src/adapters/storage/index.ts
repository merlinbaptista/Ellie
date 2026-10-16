import type { Logger } from "pino";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DriverDecision } from "../../config/drivers.js";
import type { Env } from "../../config/env.js";
import type { Clock } from "../../lib/clock.js";
import { createFileStorage } from "./file.js";
import { createMemoryStorage } from "./memory.js";
import type { StorageAdapter } from "./types.js";
import { DynamoDbStorage } from "./dynamodb.js";

export async function createStorage(
  decision: DriverDecision,
  env: Env,
  clock: Clock,
  _logger: Logger,
): Promise<StorageAdapter> {
  if (decision.implementation === "dynamodb" || decision.implementation === "dynamodb-local") {
    if (!env.DYNAMODB_TABLE_NAME) throw new Error("DYNAMODB_TABLE_NAME is required for DynamoDB storage");
    return new DynamoDbStorage({
      tableName: env.DYNAMODB_TABLE_NAME,
      region: env.AWS_REGION,
      endpoint: env.DYNAMODB_ENDPOINT,
      local: decision.implementation === "dynamodb-local",
    }, clock, _logger);
  }
  if (env.MOCK_STORAGE_MODE === "memory") return createMemoryStorage(clock);
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");
  return createFileStorage(resolve(repositoryRoot, env.DATA_DIR), clock);
}
