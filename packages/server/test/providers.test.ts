import { describe, expect, it } from "vitest";
import { Item } from "@ellie/schema";
import { selectProvider } from "../src/domain/providers.js";
import { addHousehold, createTestContext } from "./helpers.js";

describe("booking provider selection", () => {
  it("asks once for a new multi-provider IN item, then matches and persists the agency", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_provider-1", "IN");
    const household = (await ctx.repositories.households.get("hh_provider-1"))!;
    const item = Item.parse({ schemaVersion: 1, householdId: household.householdId, itemId: "itm_provider-1", catalogKey: "lpg_cylinder", kind: "supply", name: "gas", active: true, createdAt: ctx.clock.now().toISOString(), updatedAt: ctx.clock.now().toISOString() });
    await ctx.repositories.items.put(item);
    const first = await selectProvider(ctx, { household, item, tool: "send_to_phone", retryArgs: { householdId: household.householdId, item: "gas", contentType: "booking" } });
    expect(first.followUp?.question).toBe("Which gas agency do you use — Indane, Bharat Gas or HP Gas?");
    expect(first.followUp?.defaultValue).toBe("Indane");
    const refreshedHousehold = (await ctx.repositories.households.get(household.householdId))!;
    const chosen = await selectProvider(ctx, { household: refreshedHousehold, item, supplied: "Bharat Gas", tool: "send_to_phone", retryArgs: {} });
    expect(chosen.item.providerKey).toBe("bharatgas");
    expect(chosen.provider?.name).toBe("Bharat Gas");
  });

  it("maps a spoken number to a custom phone provider and uses the default for not sure", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_provider-2", "IN");
    const household = (await ctx.repositories.households.get("hh_provider-2"))!;
    const item = Item.parse({ schemaVersion: 1, householdId: household.householdId, itemId: "itm_provider-2", catalogKey: "lpg_cylinder", kind: "supply", name: "gas", active: true, createdAt: ctx.clock.now().toISOString(), updatedAt: ctx.clock.now().toISOString() });
    const custom = await selectProvider(ctx, { household, item, supplied: "+91 98765 43210", tool: "send_to_phone", retryArgs: {} });
    expect(custom.item.customProvider?.to).toBe("+919876543210");
    const unknown = await selectProvider(ctx, { household, item, supplied: "not sure", tool: "send_to_phone", retryArgs: {} });
    expect(unknown.item.providerKey).toBe("indane");
  });

  it("uses a single-provider region silently and preserves an explicitly saved provider", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_provider-tx", "US");
    const household = (await ctx.repositories.households.get("hh_provider-tx"))!;
    const propane = Item.parse({ schemaVersion: 1, householdId: household.householdId, itemId: "itm_propane-provider", catalogKey: "propane_tank", kind: "supply", name: "propane tank", active: true, createdAt: ctx.clock.now().toISOString(), updatedAt: ctx.clock.now().toISOString() });
    expect((await selectProvider(ctx, { household, item: propane, tool: "send_to_phone", retryArgs: {} })).followUp).toBeUndefined();
    const saved = await ctx.repositories.items.put({ ...propane, providerKey: "local_propane" });
    expect((await selectProvider(ctx, { household, item: saved, tool: "send_to_phone", retryArgs: {} })).provider?.name).toBe("Local propane supplier");
  });
});
