import { buildContext } from "../packages/server/src/context.js";
import { seedDemo } from "../packages/server/src/seed/seed.js";

const ctx = await buildContext();
try {
  const result = await seedDemo(ctx, { reset: process.argv.includes("--reset") });
  console.table(result.households.map((household) => ({
    household: household.householdId,
    anchor: household.anchor,
    items: household.items,
    events: household.events,
    lastChange: household.lastChange ?? "none",
  })));
} finally {
  const storage = ctx.storage as typeof ctx.storage & { flush?: () => Promise<void>; close?: () => Promise<void> };
  await storage.flush?.();
  await storage.close?.();
  (ctx.scheduler as { close?: () => void }).close?.();
}
