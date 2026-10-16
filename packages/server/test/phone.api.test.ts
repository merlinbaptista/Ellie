import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { diagnose } from "../src/domain/diagnose.js";
import { signPhoneLink } from "../src/links/sign.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";

const resources: Array<{ server: ReturnType<express.Express["listen"]>; ctx: Awaited<ReturnType<typeof createTestContext>> }> = [];
afterAll(async () => {
  await closeAllSessions();
  for (const { server, ctx } of resources.splice(0)) {
    (ctx.scheduler as { close?: () => void }).close?.();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function start(ctx: Awaited<ReturnType<typeof createTestContext>>): Promise<string> {
  const server = createApp(ctx).listen(0, "127.0.0.1");
  resources.push({ server, ctx });
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("token-authenticated phone API", () => {
  it("requires a token, serves a scoped view, and rejects a token signed for another household", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const base = await start(ctx);
    const missing = await fetch(`${base}/api/phone/view`);
    expect(missing.status).toBe(403);
    const signed = signPhoneLink({ householdId: "demo-blr", kind: "booking", ref: "itm_seed-blr-lpg", env: ctx.env });
    const view = await fetch(`${base}/api/phone/view`, { headers: { authorization: `Bearer ${signed.token}` } });
    expect(view.status).toBe(200);
    expect(view.headers.get("cache-control")).toBe("no-store");
    const data = await view.json() as { title: string };
    expect(data.title).toContain("gas cylinder");
    const tampered = await fetch(`${base}/api/phone/view?t=${encodeURIComponent(`${signed.token}x`)}`);
    expect(tampered.status).toBe(403);
  });

  it("logs fixed actions once and records phone bookings in the token household", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const diagnosis = await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping again" });
    const base = await start(ctx);
    const fixToken = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: diagnosis.diagnosis.diagnosisId, env: ctx.env }).token;
    const first = await fetch(`${base}/api/phone/actions/fixed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: fixToken }) });
    expect(first.status).toBe(200);
    const firstData = await first.json() as { ok: boolean; nextDue: string };
    expect(firstData.ok).toBe(true);
    expect(firstData.nextDue).toBe("2027-04-14");
    const second = await fetch(`${base}/api/phone/actions/fixed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: fixToken }) });
    expect(await second.json()).toEqual(firstData);

    const bookingToken = signPhoneLink({ householdId: "demo-blr", kind: "booking", ref: "itm_seed-blr-lpg", env: ctx.env }).token;
    const booked = await fetch(`${base}/api/phone/actions/booked`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: bookingToken }) });
    expect(booked.status).toBe(200);
    const itemEvents = await ctx.repositories.events.list("demo-blr", "itm_seed-blr-lpg");
    expect(itemEvents.some((event) => event.type === "booked" && event.source === "phone")).toBe(true);
  });
});
