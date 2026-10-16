import { describe, expect, it } from "vitest";
import { addDays } from "@ellie/schema";
import { seedDemo } from "../src/seed/seed.js";
import { addHousehold, createTestContext } from "./helpers.js";

describe("demo memory seed", () => {
  it("is idempotent, uses relative offsets, and keeps absolute March dates", async () => {
    const ctx = await createTestContext("2026-10-16T03:00:00.000Z");
    const first = await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const second = await seedDemo(ctx, { anchorLocal: "2026-10-16" });
    expect(second.households.map((row) => row.events)).toEqual(first.households.map((row) => row.events));
    expect(first.households.map((row) => row.events)).toEqual([14, 8]);
    const lpg = await ctx.repositories.items.list("demo-blr");
    const cylinder = lpg.find((item) => item.catalogKey === "lpg_cylinder")!;
    const lpgEvents = await ctx.repositories.events.list("demo-blr", cylinder.itemId);
    expect(lpgEvents.filter((event) => event.type === "changed").map((event) => event.localDate)).toContain(addDays("2026-10-16", -38));
    const purifierEvents = await ctx.repositories.events.list("demo-blr", "itm_seed-blr-ro");
    expect(purifierEvents.find((event) => event.symptom)?.localDate).toBe("2026-03-14");
    const other = "demo-untouched";
    await addHousehold(ctx, other);
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-17" });
    expect(await ctx.repositories.households.get(other)).not.toBeNull();
  });
});
