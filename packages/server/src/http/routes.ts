import type { Express, Request, Response } from "express";
import type { AppContext } from "../context.js";
import { statusData } from "../mcp/tools/status.js";
import { registerShortLinkRoutes } from "../links/shortLinks.js";
import { registerPhoneApi } from "./phoneApi.js";
import { registerStaticPhone } from "./static.js";

export function registerHttpRoutes(app: Express, ctx: AppContext): void {
  registerStaticPhone(app);
  registerShortLinkRoutes(app, ctx);
  registerPhoneApi(app, ctx);
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, version: ctx.version, uptimeSec: Math.floor((Date.now() - ctx.startedAt.getTime()) / 1000) });
  });

  app.get("/api/status", async (_req: Request, res: Response, next) => {
    try { res.json(await statusData(ctx)); } catch (error) { next(error); }
  });

  app.get("/api/outbox", async (req: Request, res: Response, next) => {
    if (ctx.env.NODE_ENV === "production") { res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }); return; }
    try {
      if (!ctx.notifier.listOutbox) {
        res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Outbox is not available" } });
        return;
      }
      res.json(await ctx.notifier.listOutbox(typeof req.query.householdId === "string" ? req.query.householdId : undefined));
    } catch (error) { next(error); }
  });

  app.post("/api/dev/clock", async (req: Request, res: Response, next) => {
    if (ctx.env.NODE_ENV === "production") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
      return;
    }
    try {
      const now = req.body?.now;
      if (now !== null && typeof now !== "string") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "now must be an ISO string or null" } });
        return;
      }
      ctx.clock.set(now);
      const fired = await ctx.scheduler.tick?.() ?? 0;
      res.json({ ok: true, fakeClock: ctx.clock.isFake(), now: ctx.clock.now().toISOString(), fired });
    } catch (error) { next(error); }
  });
}
