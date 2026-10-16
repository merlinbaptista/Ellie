import { describe, expect, it } from "vitest";
import { addHousehold, createTestContext } from "./helpers.js";
import { resolveItem } from "../src/domain/items.js";
import { AmbiguousItemError } from "../src/domain/items.js";

describe("household item resolution", () => {
  it("matches gas regionally and learns household aliases", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "demo-items-in", "IN");
    await addHousehold(ctx, "demo-items-us", "US");
    expect((await resolveItem((await ctx.repositories.households.get("demo-items-in"))!, "gas", {}, ctx)).item.catalogKey).toBe("lpg_cylinder");
    expect((await resolveItem((await ctx.repositories.households.get("demo-items-us"))!, "gas", {}, ctx)).item.catalogKey).toBe("propane_tank");
    const india = (await ctx.repositories.households.get("demo-items-in"))!;
    await resolveItem(india, "cooking gas", {}, ctx);
    expect(await ctx.repositories.aliases.get(india.householdId, "cooking gas")).not.toBeNull();
  });

  it("prefers a learned alias, reports ambiguous existing items, and creates custom items", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "demo-items", "IN");
    const household = (await ctx.repositories.households.get("demo-items"))!;
    const first = await resolveItem(household, "bedroom AC", { itemName: "bedroom AC" }, ctx);
    expect(first.item.name).toBe("bedroom AC");
    const second = await resolveItem(household, "AC", { itemName: "living room AC" }, ctx);
    await ctx.repositories.items.put({ ...second.item, name: "living room AC" });
    await expect(resolveItem(household, "AC", {}, ctx)).rejects.toBeInstanceOf(AmbiguousItemError);
    expect(await ctx.repositories.aliases.get(household.householdId, "bedroom AC")).not.toBeNull();
    const custom = await resolveItem(household, "garden hose", {}, ctx);
    expect(custom.custom).toBe(true);
    expect(custom.item.name).toBe("garden hose");
  });

  it("rejects warranty dates earlier than purchase", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "demo-warranty", "IN");
    const household = (await ctx.repositories.households.get("demo-warranty"))!;
    await expect(resolveItem(household, "water purifier", { purchaseDate: "2026-01-01", warrantyUntil: "2025-12-01" }, ctx)).rejects.toThrow(/warranty/i);
  });
});
