import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";
import { seedDemo } from "../src/seed/seed.js";
import { executeForgetHousehold, executeForgetItem, forgetHouseholdPlan, forgetItem } from "../src/privacy/forget.js";
import { buildInventory } from "../src/privacy/inventory.js";
import { householdPk } from "../src/data/keys.js";
import { saveConfirmation, takeConfirmation } from "../src/privacy/confirm.js";
import { linkPk, shortLinkSk } from "../src/data/keys.js";
import { createHmac } from "node:crypto";

describe("privacy forget cascade", () => {
  it("deletes only the selected item records and cancels its jobs", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const items = await ctx.repositories.items.list("demo-blr");
    const target = items.find((item) => item.catalogKey === "water_purifier") ?? items[0]!;
    const expiredPayload = Buffer.from(JSON.stringify({ v: 1, hh: "demo-blr", kind: "booking", ref: target.itemId, exp: Math.floor(Date.now() / 1000) - 1, nonce: "expired123" })).toString("base64url");
    const expiredToken = `${expiredPayload}.${createHmac("sha256", ctx.env.LINK_SIGNING_SECRET).update(expiredPayload).digest("base64url")}`;
    await ctx.storage.put({ pk: linkPk(), sk: shortLinkSk("expired1"), type: "phone-short-link", data: { token: expiredToken, householdId: "demo-blr" } });
    await ctx.storage.put({ pk: linkPk(), sk: "expired123#ACTION#book", type: "phone-action", data: {} });
    const household = await ctx.repositories.households.get("demo-blr");
    expect(household).not.toBeNull();
    await ctx.repositories.households.put({ ...household!, askedFields: [...household!.askedFields, `${target.itemId}:diag:filter` , "household:region"] });
    const before = await ctx.repositories.events.list("demo-blr", target.itemId);
    expect(before.length).toBeGreaterThan(0);
    const planned = await forgetItem(ctx, "demo-blr", target.itemId);
    expect(planned.planHash).toHaveLength(64);
    expect(planned.plan.sharedRows.some((row) => row.sk === "expired1")).toBe(true);
    expect(planned.plan.sharedRows.some((row) => row.sk === "expired123#ACTION#book")).toBe(true);
    const receipt = await executeForgetItem(ctx, "demo-blr", target.itemId);
    expect(receipt.scope).toBe("item");
    expect(await ctx.repositories.items.get("demo-blr", target.itemId)).toBeNull();
    expect(await ctx.repositories.events.list("demo-blr", target.itemId)).toEqual([]);
    expect((await ctx.repositories.households.get("demo-blr"))?.askedFields).toEqual(expect.arrayContaining(["household:region"]));
    expect((await ctx.repositories.households.get("demo-blr"))?.askedFields).not.toContain(`${target.itemId}:diag:filter`);
    expect((await ctx.repositories.items.list("demo-blr")).length).toBe(items.length - 1);
    expect((await ctx.scheduler.list("demo-blr")).some((job) => job.payload.itemId === target.itemId)).toBe(false);
  });

  it("erases household data but leaves the household reusable as an empty home", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const receipt = await executeForgetHousehold(ctx, "demo-tx");
    expect(receipt.scope).toBe("household");
    expect(await ctx.repositories.items.list("demo-tx")).toEqual([]);
    expect(await ctx.storage.query(householdPk("demo-tx"))).toEqual([]);
    expect((await buildInventory(ctx, "demo-tx")).items).toEqual([]);
    expect((await ctx.storage.query("INDEX")).some((row) => row.data.householdId === "demo-tx")).toBe(false);
  });

  it("does not change a household erase plan when its confirmation record is added", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const before = await forgetHouseholdPlan(ctx, "demo-blr");
    const confirmation = await saveConfirmation(ctx, "demo-blr", "household", before.planHash, "blue river");
    const after = await forgetHouseholdPlan(ctx, "demo-blr");
    expect(after.planHash).toBe(before.planHash);
    const stored = await takeConfirmation(ctx, "demo-blr", confirmation.id, "household", false);
    expect(stored?.planHash).toBe(before.planHash);
  });

  it("keeps an item forget plan stable while unrelated household and shared rows change", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const items = await ctx.repositories.items.list("demo-blr");
    const target = items.find((item) => item.catalogKey === "inverter_battery") ?? items[0]!;
    const other = items.find((item) => item.itemId !== target.itemId)!;
    const before = await forgetItem(ctx, "demo-blr", target.itemId);
    const confirmation = await saveConfirmation(ctx, "demo-blr", "item", before.planHash);
    await ctx.storage.put({ pk: householdPk("demo-blr"), sk: `PENDING#${other.itemId}:unrelated`, type: "pending", data: { itemId: other.itemId } });
    await ctx.storage.put({ pk: householdPk("demo-blr"), sk: `CONSENT#phone_messages#2026-10-16T03:00:00.000Z#unrelated`, type: "consent", data: { purpose: "phone_messages", granted: true } });
    await ctx.storage.put({ pk: "AUDIT", sk: "demo-blr#2026-10-16T03:00:00.000Z#unrelated", type: "privacy-audit", data: { householdId: "demo-blr", action: "inventory_viewed" } });
    await saveConfirmation(ctx, "demo-blr", "item", before.planHash);
    const after = await forgetItem(ctx, "demo-blr", target.itemId);
    expect(after.planHash).toBe(before.planHash);
    const stored = await takeConfirmation(ctx, "demo-blr", confirmation.id, "item");
    expect(stored?.planHash).toBe(after.planHash);
    expect((await executeForgetItem(ctx, "demo-blr", target.itemId)).scope).toBe("item");
    expect(await ctx.repositories.items.get("demo-blr", other.itemId)).not.toBeNull();
  });
});
