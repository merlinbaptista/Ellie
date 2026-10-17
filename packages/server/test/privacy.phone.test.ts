import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { signPhoneLink } from "../src/links/sign.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
afterAll(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

describe("privacy phone API", () => {
  it("requires a privacy-kind link for inventory and export", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const app = createApp(ctx);
    const server = app.listen(0, "127.0.0.1"); servers.push(server); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const fix = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: "dgn_test", env: ctx.env }).token;
    expect((await fetch(`${base}/api/phone/privacy/inventory`, { headers: { authorization: `Bearer ${fix}` } })).status).toBe(403);
    expect((await fetch(`${base}/api/phone/privacy/withdraw`, { method: "POST", headers: { authorization: `Bearer ${fix}` } })).status).toBe(403);
    expect((await fetch(`${base}/api/phone/privacy/forget-item`, { method: "POST", headers: { authorization: `Bearer ${fix}`, "content-type": "application/json" }, body: JSON.stringify({ itemId: "itm_seed-blr-inverter" }) })).status).toBe(403);
    expect((await fetch(`${base}/api/phone/privacy/forget-household`, { method: "POST", headers: { authorization: `Bearer ${fix}`, "content-type": "application/json" }, body: JSON.stringify({ confirmation: "erase" }) })).status).toBe(403);
    const privacy = signPhoneLink({ householdId: "demo-blr", kind: "privacy", env: ctx.env }).token;
    expect((await fetch(`${base}/api/phone/privacy/inventory`, { headers: { authorization: `Bearer ${privacy}` } })).status).toBe(200);
    const exportResponse = await fetch(`${base}/api/phone/export`, { headers: { authorization: `Bearer ${privacy}` } });
    expect(exportResponse.status).toBe(200);
    const exported = await exportResponse.text();
    expect(exported).not.toContain("+919000000001");
  });
});
