import { describe, expect, it } from "vitest";
import { buildInventory } from "../src/privacy/inventory.js";
import { addHousehold, createTestContext } from "./helpers.js";
import { seedDemo } from "../src/seed/seed.js";

describe("privacy inventory", () => {
  it("counts seeded records and masks household contacts", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const inventory = await buildInventory(ctx, "demo-blr");
    expect(inventory.items).toHaveLength(4);
    expect(inventory.counts.items).toBe(4);
    expect(inventory.counts.events).toBeGreaterThan(0);
    expect(inventory.profile.contactMasked).toBe("•••• 0001");
    expect(JSON.stringify(inventory)).not.toContain("+919000000001");
    expect(inventory.sharedWith[0]?.dataSent).toContain("Nothing leaves");
  });

  it("supports an empty household without inventing items", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_empty-home");
    const inventory = await buildInventory(ctx, "hh_empty-home");
    expect(inventory.items).toEqual([]);
    expect(inventory.counts.items).toBe(0);
  });
});
