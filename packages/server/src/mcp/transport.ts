import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AppContext } from "../context.js";
import { buildMcpServer } from "./server.js";

type SessionEntry = { transport: StreamableHTTPServerTransport; lastSeen: number };
const transports = new Map<string, SessionEntry>();
const MAX_SESSIONS = 100;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const sweepTimer = setInterval(() => {
  const cutoff = Date.now() - IDLE_TIMEOUT_MS;
  for (const entry of transports.values()) {
    if (entry.lastSeen < cutoff) void entry.transport.close();
  }
}, 60_000);
sweepTimer.unref();

function badSession(res: Response): void {
  res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: no valid session ID" }, id: null });
}

async function getOrCreate(req: Request, res: Response, ctx: AppContext): Promise<SessionEntry | undefined> {
  const sessionId = req.header("mcp-session-id");
  let entry = sessionId ? transports.get(sessionId) : undefined;
  if (entry) {
    entry.lastSeen = Date.now();
    return entry;
  }
  if (sessionId || !isInitializeRequest(req.body)) {
    badSession(res);
    return undefined;
  }
  if (transports.size >= MAX_SESSIONS) {
    const oldest = [...transports.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
    if (oldest) await oldest[1].transport.close();
  }
  const sessionRef: { transport?: StreamableHTTPServerTransport } = {};
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id: string): void => {
      if (sessionRef.transport) transports.set(id, { transport: sessionRef.transport, lastSeen: Date.now() });
    },
  });
  sessionRef.transport = transport;
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  await buildMcpServer(ctx).connect(transport);
  entry = { transport, lastSeen: Date.now() };
  return entry;
}

export async function handlePost(req: Request, res: Response, ctx: AppContext): Promise<void> {
  const entry = await getOrCreate(req, res, ctx);
  if (entry) await entry.transport.handleRequest(req, res, req.body);
}

export async function handleSessionRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.header("mcp-session-id");
  const entry = sessionId ? transports.get(sessionId) : undefined;
  if (!entry) {
    badSession(res);
    return;
  }
  entry.lastSeen = Date.now();
  await entry.transport.handleRequest(req, res);
}

export function activeSessionCount(): number { return transports.size; }

export async function closeAllSessions(): Promise<void> {
  clearInterval(sweepTimer);
  await Promise.all([...transports.values()].map(({ transport }) => transport.close().catch(() => undefined)));
  transports.clear();
}
