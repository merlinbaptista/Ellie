import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { SimTurnRequest } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { MCP_APP_URI } from "../mcp/apps.js";
import { clearPending, createSimSession, getSimSession } from "./session.js";
import { runTurn } from "./orchestrator.js";

const rates = new Map<string, { start: number; count: number }>();
const suggestions: Record<string, string[]> = {
  "demo-blr": ["What's due this week?", "The cylinder's changed and the purifier is beeping again", "Send it to my phone", "It's fixed", "When is the gas due?", "Show the purifier history", "What do you know about my home?", "Forget the inverter", "Stop texting me"],
  "demo-tx": ["What's due this week?", "The propane tank got refilled", "The furnace filter is changed", "My water heater has no hot water", "What do you know about my home?", "Forget the furnace filter", "Stop texting me"],
};
function enabled(ctx: AppContext): boolean { return ctx.env.SIMULATOR_ENABLED && (ctx.env.NODE_ENV !== "production" || Boolean(ctx.env.SIM_ACCESS_CODE && ctx.env.SIM_ACCESS_CODE.length >= 12)); }
function unauthorized(req: Request, ctx: AppContext): boolean {
  if (ctx.env.NODE_ENV !== "production") return false;
  const expected = Buffer.from(ctx.env.SIM_ACCESS_CODE ?? "");
  const supplied = Buffer.from(req.header("x-sim-access-code") ?? "");
  return expected.length < 12 || supplied.length !== expected.length || !timingSafeEqual(expected, supplied);
}
function rateLimit(req: Request): boolean {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const prior = rates.get(key);
  if (!prior || now - prior.start >= 60_000) { rates.set(key, { start: now, count: 1 }); return true; }
  prior.count += 1;
  return prior.count <= 30;
}
function error(res: Response, status: number, message: string): void { res.status(status).json({ error: { code: status === 404 ? "NOT_FOUND" : "SIMULATOR_ERROR", message } }); }
function baseUrl(req: Request, ctx: AppContext): string {
  const host = req.header("host");
  if (ctx.env.NODE_ENV === "test" && host) return `${req.protocol}://${host}`;
  return new URL(ctx.env.ELLIE_PUBLIC_BASE_URL).origin;
}

export function registerSimulatorApi(app: Express, ctx: AppContext): void {
  app.use("/api/sim", (req: Request, res: Response, next: NextFunction) => {
    if (!enabled(ctx)) { error(res, 404, "Simulator is disabled"); return; }
    if (unauthorized(req, ctx)) { error(res, 401, "Simulator access code required"); return; }
    if (req.method === "POST" && req.path === "/turn" && !rateLimit(req)) { error(res, 429, "Too many simulator turns"); return; }
    next();
  });
  app.post("/api/sim/session", async (req, res, next) => {
    try {
      const requested = typeof req.body?.householdId === "string" ? req.body.householdId : "demo-blr";
      const householdId = requested === "fresh" ? `hh_sim-${randomUUID().slice(0, 8)}` : requested;
      const session = createSimSession(householdId);
      const household = await ctx.repositories.households.get(householdId);
      const pack = ctx.regions.get(household?.regionPackId ?? "IN");
      const lang = household?.language ?? pack.locale.defaultLanguage;
      res.json({ sessionId: session.id, household: { householdId, name: household?.displayName ?? (requested === "fresh" ? "Fresh home" : householdId), country: household?.country ?? pack.packId, region: household?.region ?? "", timeZone: household?.timeZone ?? pack.locale.defaultTimeZone, language: lang, phoneLanguage: household?.phoneLanguage ?? lang }, suggestions: requested === "fresh" ? ["I live in Bengaluru", "I just changed the gas", "About five weeks ago", "What do you know about my home?", "Stop texting me"] : suggestions[householdId] ?? suggestions["demo-blr"], voiceLang: lang });
    } catch (failure) { next(failure); }
  });
  app.post("/api/sim/turn", async (req, res, next) => {
    try {
      const parsed = SimTurnRequest.safeParse(req.body);
      if (!parsed.success) { error(res, 400, "Invalid simulator turn"); return; }
      const session = getSimSession(parsed.data.sessionId);
      if (!session) { error(res, 404, "Simulator session expired"); return; }
      if (session.householdId !== parsed.data.householdId) { session.householdId = parsed.data.householdId; clearPending(session); }
      res.json(await runTurn(ctx, session, parsed.data, baseUrl(req, ctx)));
    } catch (failure) { next(failure); }
  });
  app.post("/api/sim/household", (req, res) => {
    const session = getSimSession(String(req.body?.sessionId ?? ""));
    const householdId = typeof req.body?.householdId === "string" ? req.body.householdId : undefined;
    if (!session || !householdId) { error(res, 400, "Session and householdId are required"); return; }
    session.householdId = householdId === "fresh" ? `hh_sim-${randomUUID().slice(0, 8)}` : householdId;
    clearPending(session);
    session.lastItem = undefined; session.lastDiagnosisId = undefined; session.lastCauseKey = undefined; session.lastTool = undefined; session.offeredTool = undefined;
    const household = ctx.repositories.households.get(session.householdId);
    void household.then((profile) => {
      const pack = ctx.regions.get(profile?.regionPackId ?? "IN");
      const language = profile?.language ?? pack.locale.defaultLanguage;
      res.json({ household: { householdId: session.householdId, name: profile?.displayName ?? session.householdId, country: profile?.country ?? pack.packId, region: profile?.region ?? "", timeZone: profile?.timeZone ?? pack.locale.defaultTimeZone, language, phoneLanguage: profile?.phoneLanguage ?? language }, suggestions: session.householdId.startsWith("hh_sim-") ? ["I live in Bengaluru", "I just changed the gas", "About five weeks ago", "What do you know about my home?", "Stop texting me"] : suggestions[session.householdId] ?? suggestions["demo-blr"], voiceLang: language });
    }).catch(() => error(res, 500, "Could not switch household"));
  });
  app.get("/api/sim/state", (req, res) => {
    const session = getSimSession(String(req.query.sessionId ?? ""));
    if (!session) { error(res, 404, "Simulator session expired"); return; }
    res.json({ householdId: session.householdId, lastItem: session.lastItem, lastDiagnosisId: session.lastDiagnosisId, pending: session.pending?.question, router: ctx.env.SIM_ROUTER === "auto" && ctx.llm.name === "bedrock" ? "llm" : ctx.env.SIM_ROUTER });
  });
  app.get("/api/sim/idle", async (req, res, next) => {
    const session = getSimSession(String(req.query.sessionId ?? ""));
    if (!session) { error(res, 404, "Simulator session expired"); return; }
    try {
      const profile = await ctx.repositories.households.get(session.householdId);
      if (!profile) { res.json({ card: { title: "No home data", items: [{ label: "No home data", value: "This home is empty" }] } }); return; }
      const { LoopbackMcpClient } = await import("./mcpClient.js");
      session.mcp ??= new LoopbackMcpClient(baseUrl(req, ctx));
      const result = await session.mcp.callTool("due_this_week", { householdId: session.householdId });
      res.json({ card: (result.structuredContent as Record<string, unknown> | undefined)?.card ?? null });
    } catch (failure) { next(failure); }
  });
  app.get("/api/sim/app-resource", async (req, res, next) => {
    const { LoopbackMcpClient } = await import("./mcpClient.js");
    const client = new LoopbackMcpClient(baseUrl(req, ctx));
    try { res.type("text/html").send(await client.readResource(MCP_APP_URI)); }
    catch (failure) { next(failure); }
    finally { await client.close(); }
  });
}
