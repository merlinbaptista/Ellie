import { randomUUID } from "node:crypto";
import type { PlannedCall } from "./routers/types.js";

export interface PendingFollowUp { question: string; retry: { tool: string; argName: string; args: Record<string, unknown> }; defaultValue?: string; askedAt: number }
export interface SimHistoryTurn { user: string; speech: string }
export interface SimSession {
  id: string;
  householdId: string;
  lastItem?: string;
  lastDiagnosisId?: string;
  lastCauseKey?: string;
  lastDiagnosisAt?: number;
  lastTool?: string;
  offeredTool?: PlannedCall;
  pending?: PendingFollowUp;
  queued: PendingFollowUp[];
  history: SimHistoryTurn[];
  mcp?: import("./mcpClient.js").SimulatorMcpClient;
  lastSeen: number;
}
const sessions = new Map<string, SimSession>();
const idleTimeoutMs = 30 * 60_000;
const maxSessions = 200;
function sweep(now = Date.now()): void {
  for (const [id, session] of sessions) if (now - session.lastSeen > idleTimeoutMs) { void session.mcp?.close(); sessions.delete(id); }
}
export function createSimSession(householdId: string): SimSession {
  sweep();
  if (sessions.size >= maxSessions) {
    const oldest = [...sessions.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (oldest) { void oldest.mcp?.close(); sessions.delete(oldest.id); }
  }
  const session: SimSession = { id: randomUUID(), householdId, queued: [], history: [], lastSeen: Date.now() };
  sessions.set(session.id, session);
  return session;
}
export function getSimSession(id: string): SimSession | undefined {
  sweep();
  const session = sessions.get(id);
  if (session) session.lastSeen = Date.now();
  return session;
}
export async function closeSimSession(id: string): Promise<void> { const session = sessions.get(id); if (session) await session.mcp?.close(); sessions.delete(id); }
export function clearPending(session: SimSession): void { session.pending = undefined; session.queued = []; }
export function allSimSessions(): number { sweep(); return sessions.size; }
