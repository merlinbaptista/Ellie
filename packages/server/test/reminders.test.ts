import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";
import { seedDemo } from "../src/seed/seed.js";
import { recomputeItem } from "../src/domain/predictions.js";
import { handleReminderFire, reminderJobId } from "../src/domain/reminders.js";
import { deliveryJobId } from "../src/domain/reminders.js";
import { logEvent } from "../src/domain/events.js";

describe("local reminders", () => {
  it("uses deterministic reminder IDs, upserts and delivers provider links", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const gas = (await ctx.repositories.items.list("demo-blr")).find((item) => item.catalogKey === "lpg_cylinder")!;
    await ctx.repositories.events.put({
      schemaVersion: 1, eventId: "evt_manual-today", householdId: "demo-blr", itemId: gas.itemId, type: "changed",
      timestamp: "2026-10-16T03:30:00.000Z", localDate: "2026-10-16", dateIsApproximate: false,
      recordedAt: "2026-10-16T03:30:00.000Z", source: "voice",
    });
    const computed = await recomputeItem(ctx, "demo-blr", gas.itemId);
    const id = reminderJobId("demo-blr", gas.itemId);
    expect(computed.main?.scheduleId).toBe(id);
    expect((await ctx.repositories.predictions.get("demo-blr", gas.itemId))?.scheduleId).toBe(id);
    const firstJobs = await ctx.scheduler.list("demo-blr");
    expect(firstJobs.filter((job) => job.id === id)).toHaveLength(1);
    await recomputeItem(ctx, "demo-blr", gas.itemId);
    expect((await ctx.scheduler.list("demo-blr")).filter((job) => job.id === id)).toHaveLength(1);
    const prediction = computed.main!;
    ctx.clock.set("2026-11-18T03:35:00.000Z");
    await handleReminderFire({ id, runAtUtc: "2026-11-18T03:30:00.000Z", timeZone: "Asia/Kolkata", payload: { kind: "reminder", householdId: "demo-blr", itemId: gas.itemId, lastEventLocal: "2026-10-16", message: "Reminder" } }, ctx);
    const outbox = await ctx.notifier.listOutbox?.("demo-blr");
    expect(outbox?.[0]?.link).toBe("https://wa.me/917588888824?text=REFILL");
    expect(outbox?.[0]?.body).toContain("gas cylinder");
    expect(prediction.nextDueLocal).toBe("2026-11-23");
  });

  it("replaces reminders with delivery checks on booking and cancels delivery checks after a change", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const gas = (await ctx.repositories.items.list("demo-blr")).find((item) => item.catalogKey === "lpg_cylinder")!;
    await logEvent({ householdId: "demo-blr", item: "gas", type: "booked", providerKey: "indane" }, ctx);
    await recomputeItem(ctx, "demo-blr", gas.itemId);
    let jobs = await ctx.scheduler.list("demo-blr");
    expect(jobs.some((job) => job.id === deliveryJobId("demo-blr", gas.itemId))).toBe(true);
    expect(jobs.some((job) => job.id === reminderJobId("demo-blr", gas.itemId))).toBe(false);
    await logEvent({ householdId: "demo-blr", item: "gas", type: "changed" }, ctx);
    await recomputeItem(ctx, "demo-blr", gas.itemId);
    jobs = await ctx.scheduler.list("demo-blr");
    expect(jobs.some((job) => job.id === deliveryJobId("demo-blr", gas.itemId))).toBe(false);
  });
});
