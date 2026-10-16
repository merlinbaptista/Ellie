import type { SimTurnRequest, SimTurnResponse } from "@ellie/schema";

export interface SimHousehold { householdId: string; name: string; country: string; region: string; timeZone: string; language: string; phoneLanguage: string }
export interface SimSessionResponse { sessionId: string; household: SimHousehold; suggestions: string[]; voiceLang: string; controlsEnabled: boolean; idleCard?: unknown }
export interface OutboxMessage { id: string; householdId: string; channel: string; to: string; body: string; link?: string; kind: string; sentAt: string }
const accessCodeKey = "ellie.sim.access";
export function setAccessCode(value: string): void { sessionStorage.setItem(accessCodeKey, value); }
function headers(): HeadersInit { const code = sessionStorage.getItem(accessCodeKey); return { "content-type": "application/json", ...(code ? { "x-sim-access-code": code } : {}) }; }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(response.status === 401 ? "Simulator access code was not accepted." : `Simulator request failed (${response.status}).`);
  return response.json() as Promise<T>;
}
export function createSession(householdId = "demo-blr"): Promise<SimSessionResponse> { return request("/api/sim/session", { method: "POST", body: JSON.stringify({ householdId }) }); }
export function sendTurn(input: SimTurnRequest): Promise<SimTurnResponse> { return request("/api/sim/turn", { method: "POST", body: JSON.stringify(input) }); }
export function switchHousehold(sessionId: string, householdId: string): Promise<Omit<SimSessionResponse, "sessionId" | "controlsEnabled">> { return request("/api/sim/household", { method: "POST", body: JSON.stringify({ sessionId, householdId }) }); }
export function getState(sessionId: string): Promise<{ householdId: string; lastItem?: string; pending?: string; router: string }> { return request(`/api/sim/state?sessionId=${encodeURIComponent(sessionId)}`); }
export function getIdleCard(sessionId: string): Promise<{ card: unknown | null }> { return request(`/api/sim/idle?sessionId=${encodeURIComponent(sessionId)}`); }
export function getOutbox(householdId: string): Promise<OutboxMessage[]> { return request(`/api/outbox?householdId=${encodeURIComponent(householdId)}`); }
export function getAppResource(): Promise<string> { return fetch("/api/sim/app-resource", { headers: { "x-sim-access-code": sessionStorage.getItem(accessCodeKey) ?? "" } }).then(async (response) => { if (!response.ok) throw new Error("MCP App resource unavailable"); return response.text(); }); }
export function timeTravel(input: { days?: number; to?: string; reset?: boolean }): Promise<{ now: string; firedJobs: number; outbox: OutboxMessage[] }> { return request("/api/dev/time-travel", { method: "POST", body: JSON.stringify(input) }); }
export function reseed(anchor: string): Promise<unknown> { return request("/api/dev/seed", { method: "POST", body: JSON.stringify({ reset: true, anchor }) }); }
export type { SimTurnRequest, SimTurnResponse };
