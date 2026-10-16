import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileStorage } from "../src/adapters/storage/file.js";
import { createMemoryStorage } from "../src/adapters/storage/memory.js";
import { DynamoDbStorage } from "../src/adapters/storage/dynamodb.js";
import { loadEnv } from "../src/config/env.js";
import { createClock } from "../src/lib/clock.js";
import { logger } from "../src/lib/logger.js";
import type { StorageAdapter } from "../src/adapters/storage/types.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

function contract(name: string, make: (clock: ReturnType<typeof createClock>) => Promise<StorageAdapter> | StorageAdapter) {
  describe(name, () => {
    it("supports put/get, sorted prefix queries, limits, pagination, TTL, and partition deletion", async () => {
      const clock = createClock("2026-01-01T00:00:00.000Z");
      const storage = await make(clock);
      for (let index = 0; index < 150; index++) {
        await storage.put({ pk: "HH#contract", sk: `EVENT#${String(index).padStart(3, "0")}`, type: "event", data: { index } });
      }
      await storage.put({ pk: "HH#contract", sk: "PENDING#expired", type: "pending", data: {}, ttl: Math.floor(clock.now().getTime() / 1000) + 30 });
      expect((await storage.get("HH#contract", "EVENT#001"))?.data.index).toBe(1);
      expect((await storage.query("HH#contract", { skPrefix: "EVENT#", limit: 150 })).length).toBe(150);
      expect((await storage.query("HH#contract", { skPrefix: "EVENT#", descending: true, limit: 2 })).map((row) => row.sk)).toEqual(["EVENT#149", "EVENT#148"]);
      await storage.put({ pk: "HH#contract", sk: "TTL#expired", type: "ttl", data: {}, ttl: Math.floor(clock.now().getTime() / 1000) + 10 });
      clock.set("2026-01-01T00:01:00.000Z");
      expect(await storage.get("HH#contract", "TTL#expired")).toBeNull();
      expect((await storage.query("HH#contract", { skPrefix: "TTL#" })).length).toBe(0);
      expect((await storage.healthCheck()).ok).toBe(true);
      expect(await storage.deletePartition("HH#contract")).toBe(150);
      expect(await storage.query("HH#contract")).toEqual([]);
      await (storage as StorageAdapter & { flush?: () => Promise<void>; close?: () => Promise<void> }).flush?.();
      await (storage as StorageAdapter & { close?: () => Promise<void> }).close?.();
    });
  });
}

contract("memory storage contract", (clock) => createMemoryStorage(clock));
contract("file storage contract", async (clock) => {
  const directory = await mkdtemp(join(tmpdir(), "ellie-storage-contract-"));
  directories.push(directory);
  return createFileStorage(directory, clock);
});

const env = loadEnv();
const dynamodbEnabled = env.DYNAMODB_TEST && Boolean(env.DYNAMODB_ENDPOINT && env.DYNAMODB_TABLE_NAME);
const dynamodbContract = dynamodbEnabled ? contract : () => describe.skip("DynamoDB Local storage contract (set DYNAMODB_TEST=true and configure endpoint/table)", () => {});
dynamodbContract("DynamoDB Local storage contract", (clock) => new DynamoDbStorage({ tableName: env.DYNAMODB_TABLE_NAME ?? "ellie-main", endpoint: env.DYNAMODB_ENDPOINT, region: "local", local: true }, clock, logger));
