import { buildContext } from "../src/context.js";
import { loadEnv } from "../src/config/env.js";
import { createMemoryStorage } from "../src/adapters/storage/memory.js";
import { createClock } from "../src/lib/clock.js";
import type { AppContext } from "../src/context.js";

export async function createTestContext(now = "2026-10-16T03:00:00.000Z"): Promise<AppContext> {
  const clock = createClock(now);
  const env = loadEnv({ NODE_ENV: "test", MOCK_STORAGE_MODE: "memory", SEED_ON_START: "false" });
  return buildContext({ env, clock, storage: createMemoryStorage(clock) });
}

export async function addHousehold(ctx: AppContext, id: string, country = "IN"): Promise<void> {
  const pack = ctx.regions.forCountry(country);
  const now = ctx.clock.now().toISOString();
  await ctx.repositories.households.put({
    schemaVersion: 1,
    householdId: id,
    displayName: "Test home",
    country,
    region: "Test City",
    timeZone: pack.locale.defaultTimeZone,
    language: pack.locale.defaultLanguage,
    units: pack.units,
    regionPackId: pack.packId,
    regionPackVersion: pack.version,
    askedFields: [],
    createdAt: now,
    updatedAt: now,
  });
}
