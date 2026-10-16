import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { seedDemo } from "../src/seed/seed.js";
import { registerIntegrationCleanup } from "./integrationCleanup.js";
import { createTestContext } from "./helpers.js";

const clients: Client[] = [];
afterAll(async () => { await Promise.all(clients.splice(0).map((client) => client.close())); await closeAllSessions(); });

describe("phone handoff Journey 3", () => {
  it("sends a signed booking link, opens the fallback guide, and records booked idempotently", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    ctx.env.ELLIE_PUBLIC_BASE_URL = base;
    const client = new Client({ name: "phone-journey", version: "1.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

    const sent = await client.callTool({ name: "send_to_phone", arguments: { householdId: "demo-blr", item: "gas", contentType: "booking" } });
    expect(sent.isError).not.toBe(true);
    const result = sent.structuredContent as { speech: string; data: { shortUrl: string; expiresAt: string; status: string }; phone: { url: string; kind: string } };
    expect(result.speech).toContain("ending 0001");
    expect(result.speech).toContain("WhatsApp");
    expect(result.data.shortUrl).toContain("/l/");
    expect(result.data.status).toBe("sent");
    expect(result.phone.kind).toBe("booking");
    const outbox = await ctx.notifier.listOutbox?.("demo-blr");
    expect(outbox?.[0]?.body.length).toBeLessThanOrEqual(160);
    expect(outbox?.[0]?.body).toContain("/l/");

    const redirect = await fetch(result.data.shortUrl, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    const phoneLocation = new URL(redirect.headers.get("location")!, base);
    expect(phoneLocation.pathname).toBe("/phone/");
    expect(phoneLocation.searchParams.has("t")).toBe(true);
    const token = phoneLocation.searchParams.get("t")!;
    const page = await fetch(phoneLocation);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("/phone/assets/");
    const view = await fetch(`${base}/api/phone/view`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json()) as { actions: Array<{ id: string; url?: string }>; sections: Array<{ body?: string }> };
    expect(view.actions.find((action) => action.id === "book")?.url).toBe("https://wa.me/917588888824?text=REFILL");
    expect(view.sections.find((section) => section.body?.includes("registered with Indane"))).toBeDefined();
    const fallback = await fetch(`${base}/p/${encodeURIComponent(token)}`);
    expect(fallback.status).toBe(200);
    expect(fallback.headers.get("cache-control")).toBe("no-store");

    const booking = await fetch(`${base}/api/phone/actions/booked`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) });
    const firstAction = await booking.json() as { ok: boolean; eventId: string };
    expect(firstAction.ok).toBe(true);
    const duplicate = await fetch(`${base}/api/phone/actions/booked`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) });
    expect(await duplicate.json()).toEqual(firstAction);
    const event = (await ctx.repositories.events.list("demo-blr", "itm_seed-blr-lpg")).find((candidate) => candidate.eventId === firstAction.eventId);
    expect(event?.source).toBe("phone");
    expect((await ctx.scheduler.list("demo-blr")).some((job) => job.id === "delivery:demo-blr:itm_seed-blr-lpg")).toBe(true);
  });
});
