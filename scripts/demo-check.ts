import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DemoStep } from "../packages/server/src/demo/script.js";

const base = new URL((process.env.ELLIE_DEMO_URL ?? "http://127.0.0.1:8787").replace(/\/$/, ""));
const origin = base.origin;
const rows: Array<{ step: string; tools: string; ms: number; status: string; reason: string }> = [];
let sessionId = "";
let householdId = "demo-blr";
let voiceLang = "en-IN";
let phoneToken: string | undefined;
let latestPresenterLink: string | undefined;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, origin), init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} returned HTTP ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
async function outboxState(household: string): Promise<Map<string, string>> {
  const messages = await request<Array<{ id: string; sentAt?: string; link?: string }>>(`/api/outbox?householdId=${encodeURIComponent(household)}`);
  return new Map(messages.map((message) => [message.id, `${message.sentAt ?? ""}|${message.link ?? ""}`]));
}
async function openLatestPhone(household: string): Promise<void> {
  const messages = latestPresenterLink ? [] : await request<Array<{ householdId: string; link?: string }>>(`/api/outbox?householdId=${encodeURIComponent(household)}`);
  const messageLink = latestPresenterLink ?? messages.find((candidate) => candidate.householdId === household && candidate.link)?.link;
  if (!messageLink) throw new Error("There is no phone link in the household outbox.");
  const shortUrl = new URL(messageLink, origin);
  const redirect = await fetch(shortUrl, { redirect: "manual" });
  const location = redirect.headers.get("location");
  if (redirect.status < 300 || redirect.status >= 400 || !location) throw new Error("The latest short link did not redirect.");
  const destination = new URL(location, shortUrl);
  phoneToken = destination.searchParams.get("t") ?? (destination.pathname.startsWith("/p/") ? decodeURIComponent(destination.pathname.slice(3)) : undefined);
  if (!phoneToken) throw new Error("The latest phone link did not expose its link-scoped token.");
  const view = await fetch(new URL("/api/phone/view", origin), { headers: { authorization: `Bearer ${phoneToken}` } });
  if (!view.ok) throw new Error(`Phone view returned HTTP ${view.status}.`);
}
async function runAction(step: DemoStep): Promise<{ speech?: string; tools?: string[]; state?: string; cards?: number; maxToolMs?: number; outboxNew?: number }> {
  if (step.household !== householdId) {
    const switched = await request<{ household: { language: string } }>("/api/sim/household", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, householdId: step.household }) });
    householdId = step.household;
    voiceLang = switched.household.language;
  }
    const before = await outboxState(householdId);
  const action = step.action;
  if (action.kind === "reseed") {
    await request("/api/dev/seed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true, anchor: "2026-10-16" }) });
    if (householdId === "demo-blr") await request("/api/dev/demo/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ householdId, keepCatalogKey: "lpg_cylinder" }) });
  } else if (action.kind === "timeTravel") {
    await request("/api/dev/time-travel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action.to === null ? { reset: true } : { to: action.to }) });
    const messages = await request<Array<{ id: string; link?: string; sentAt?: string; kind?: string; body?: string }>>(`/api/outbox?householdId=${encodeURIComponent(householdId)}`);
    const fresh = messages.filter((message) => before.get(message.id) !== `${message.sentAt ?? ""}|${message.link ?? ""}`);
    latestPresenterLink = fresh.find((message) => message.link)?.link ?? latestPresenterLink;
    return { outboxNew: fresh.length };
  } else if (action.kind === "say") {
    const turn = await request<{ speech: string; calls: Array<{ tool: string; ms: number }>; state: string; cards: unknown[] }>("/api/sim/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, householdId, text: action.text, lang: voiceLang, inputMode: "chip" }),
    });
    const messages = await request<Array<{ id: string; link?: string; sentAt?: string }>>(`/api/outbox?householdId=${encodeURIComponent(householdId)}`);
    const fresh = messages.filter((message) => before.get(message.id) !== `${message.sentAt ?? ""}|${message.link ?? ""}`);
    latestPresenterLink = fresh.find((message) => message.link)?.link ?? latestPresenterLink;
    return { speech: turn.speech, tools: turn.calls.map((call) => call.tool), state: turn.state, cards: turn.cards.length, maxToolMs: Math.max(0, ...turn.calls.map((call) => call.ms)), outboxNew: fresh.length };
  } else if (action.kind === "openPhone") {
    await openLatestPhone(householdId);
  } else {
    if (!phoneToken) throw new Error("Open a phone link before tapping a phone action.");
    const endpoint = action.action === "fixed" ? "fixed" : "booked";
    await request(`/api/phone/actions/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: phoneToken }) });
  }
  return { outboxNew: (await outboxState(householdId)).size - before.size };
}

const started = new Date().toISOString();
let steps: DemoStep[] = [];
try {
  steps = await request<DemoStep[]>("/api/sim/demo-script");
} catch (error) {
  console.error(`Cannot load the demo script from ${origin}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

try {
  const session = await request<{ sessionId: string; voiceLang: string }>("/api/sim/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ householdId }) });
  sessionId = session.sessionId;
  voiceLang = session.voiceLang;
} catch (error) {
  console.error(`Cannot create a simulator session: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

for (const step of steps) {
  const startedAt = performance.now();
  let reason = "";
  let result: Awaited<ReturnType<typeof runAction>> = {};
  try {
    result = await runAction(step);
    const expectations = step.expect;
    if (expectations.tools && JSON.stringify(result.tools ?? []) !== JSON.stringify(expectations.tools)) reason = `tools expected ${expectations.tools.join(" -> ") || "none"}, got ${(result.tools ?? []).join(" -> ") || "none"}`;
    const speech = (result.speech ?? "").toLowerCase();
    if (!reason && expectations.speechIncludes?.some((text) => !speech.includes(text.toLowerCase()))) reason = `speech missing: ${expectations.speechIncludes.filter((text) => !speech.includes(text.toLowerCase())).join(", ")}`;
    if (!reason && expectations.speechExcludes?.some((text) => speech.includes(text.toLowerCase()))) reason = `speech unexpectedly contains: ${expectations.speechExcludes.filter((text) => speech.includes(text.toLowerCase())).join(", ")}`;
    if (!reason && expectations.state && result.state !== expectations.state) reason = `state expected ${expectations.state}, got ${result.state ?? "n/a"}`;
    if (!reason && expectations.cards !== undefined && result.cards !== expectations.cards) reason = `cards expected ${expectations.cards}, got ${result.cards ?? "n/a"}`;
    if (!reason && (result.maxToolMs ?? 0) > expectations.maxToolMs) reason = `tool took ${result.maxToolMs} ms; maximum is ${expectations.maxToolMs} ms`;
    if (!reason && expectations.outboxNew !== undefined && result.outboxNew !== expectations.outboxNew) reason = `outbox expected ${expectations.outboxNew} new message(s), got ${result.outboxNew ?? 0}`;
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  rows.push({ step: step.id, tools: (result.tools ?? []).join(" -> ") || "—", ms: Math.round(performance.now() - startedAt), status: reason ? "✖" : "✔", reason });
}

console.table(rows);
await mkdir(resolve("demo"), { recursive: true });
await writeFile(resolve("demo/last-run.json"), JSON.stringify({ startedAt: started, completedAt: new Date().toISOString(), rows }, null, 2));
if (rows.some((row) => row.status === "✖")) process.exitCode = 1;
