import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { seedDemo } from "../src/seed/seed.js";
import { closeSimSession } from "../src/simulator/session.js";
import { createTestContext } from "./helpers.js";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
const sessionIds: string[] = [];
afterAll(async () => {
  await Promise.all(sessionIds.splice(0).map((sessionId) => closeSimSession(sessionId)));
  await closeAllSessions();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("simulator loopback API", () => {
  it("routes a turn through the real MCP Streamable HTTP client", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const app = createApp(ctx);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const appResource = await fetch(`${base}/api/sim/app-resource`).then((response) => response.text());
    expect(appResource).toContain("Headsup card is waiting for the tool result");
    const session = await fetch(`${base}/api/sim/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ householdId: "demo-blr" }) }).then((response) => response.json()) as { sessionId: string };
    sessionIds.push(session.sessionId);
    const turn = await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId, householdId: "demo-blr", text: "Alexa, what's due this week?", lang: "en-IN", inputMode: "text" }) });
    expect(turn.status).toBe(200);
    const result = await turn.json() as { speech: string; calls: Array<{ tool: string }>; cards: unknown[] };
    expect(result.calls.map((call) => call.tool)).toEqual(["due_this_week"]);
    expect(result.speech).toContain("due");
    expect(result.cards.length).toBeGreaterThan(0);
    const clarifySession = await fetch(`${base}/api/sim/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ householdId: "demo-blr" }) }).then((response) => response.json()) as { sessionId: string };
    sessionIds.push(clarifySession.sessionId);
    const clarification = await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: clarifySession.sessionId, householdId: "demo-blr", text: "Send it to my phone", lang: "en-IN", inputMode: "text" }) }).then((response) => response.json()) as { state: string; followUp?: { question: string } };
    expect(clarification.state).toBe("awaiting_answer");
    expect(clarification.followUp?.question).toContain("fix steps or a booking link");
    const clarified = await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: clarifySession.sessionId, householdId: "demo-blr", text: "the booking link", lang: "en-IN", inputMode: "text" }) }).then((response) => response.json()) as { calls: Array<{ tool: string; args: Record<string, unknown> }> };
    expect(clarified.calls.map((call) => call.tool)).toContain("send_to_phone");
    expect(clarified.calls[0]?.args.contentType).toBe("booking");
    const hero = await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId, householdId: "demo-blr", text: "Alexa, the cylinder's changed and the purifier is beeping again", lang: "en-IN", inputMode: "chip" }) }).then((response) => response.json()) as { calls: Array<{ tool: string }>; cards: unknown[]; speech: string };
    expect(hero.calls.map((call) => call.tool)).toEqual(["log_event", "diagnose"]);
    expect(hero.cards).toHaveLength(2);
    expect(hero.speech).toContain("changed");
    const safety = await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId, householdId: "demo-blr", text: "I can smell gas and the AC isn't cooling", lang: "en-IN", inputMode: "text" }) }).then((response) => response.json()) as { state: string; calls: Array<{ tool: string }>; speech: string };
    expect(safety.state).toBe("safety_stop");
    expect(safety.calls.map((call) => call.tool)).toEqual(["diagnose"]);
    expect(safety.speech).toContain("1906");
    const followSession = await fetch(`${base}/api/sim/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ householdId: "hh_sim-followup" }) }).then((response) => response.json()) as { sessionId: string };
    await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: followSession.sessionId, householdId: "hh_sim-followup", text: "I live in Bengaluru", lang: "en-IN", inputMode: "text" }) });
    const initial = await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: followSession.sessionId, householdId: "hh_sim-followup", text: "I just changed the gas", lang: "en-IN", inputMode: "text" }) }).then((response) => response.json()) as { state: string; speech: string; followUp?: { question: string } };
    expect(initial.state, JSON.stringify(initial)).toBe("awaiting_answer");
    expect(initial.speech).toContain("previous");
    expect(initial.followUp?.question).toContain("previous");
    await fetch(`${base}/api/sim/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: followSession.sessionId, householdId: "hh_sim-followup", text: "about five weeks ago", lang: "en-IN", inputMode: "text" }) });
  });

  it("requires a timing-safe access code for production simulator APIs", async () => {
    const ctx = await createTestContext();
    ctx.env = { ...ctx.env, NODE_ENV: "production", SIMULATOR_ENABLED: true, SIM_ACCESS_CODE: "simulator-secret-123" };
    const app = createApp(ctx);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const body = JSON.stringify({ householdId: "demo-blr" });
    expect((await fetch(`${base}/api/sim/session`, { method: "POST", headers: { "content-type": "application/json" }, body })).status).toBe(401);
    expect((await fetch(`${base}/api/sim/session`, { method: "POST", headers: { "content-type": "application/json", "x-sim-access-code": "wrong" }, body })).status).toBe(401);
    expect((await fetch(`${base}/api/sim/session`, { method: "POST", headers: { "content-type": "application/json", "x-sim-access-code": "simulator-secret-123" }, body })).status).toBe(200);
  });
});
