import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import type { AppContext } from "./context.js";
import { registerHttpRoutes } from "./http/routes.js";
import { handlePost, handleSessionRequest } from "./mcp/transport.js";
import { registerDevApi } from "./http/devApi.js";

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cors({
    origin: ctx.env.CORS_ORIGINS,
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID"],
  }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header("x-request-id") || randomUUID();
    res.setHeader("x-request-id", requestId);
    res.locals.logger = ctx.logger.child({ requestId });
    next();
  });
  app.use("/mcp", (req: Request, res: Response, next: NextFunction) => {
    const host = req.header("host")?.toLowerCase();
    let publicHost = "";
    try { publicHost = new URL(ctx.env.ELLIE_PUBLIC_BASE_URL).host.toLowerCase(); } catch { /* env schema validates URL */ }
    const allowed = new Set([`localhost:${ctx.env.PORT}`, `127.0.0.1:${ctx.env.PORT}`, publicHost]);
    const ephemeralTestHost = ctx.env.NODE_ENV === "test" && /^(localhost|127\.0\.0\.1):\d+$/.test(host ?? "");
    if (!host || (!allowed.has(host) && !ephemeralTestHost)) {
      res.status(403).json({ error: { code: "HOST_NOT_ALLOWED", message: "Host is not allowed" } });
      return;
    }
    next();
  });
  app.post("/mcp", (req, res, next) => { void handlePost(req, res, ctx).catch(next); });
  app.get("/mcp", (req, res, next) => { void handleSessionRequest(req, res).catch(next); });
  app.delete("/mcp", (req, res, next) => { void handleSessionRequest(req, res).catch(next); });
  registerHttpRoutes(app, ctx);
  registerDevApi(app, ctx);
  app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    const message = error instanceof Error ? error.message : "Unexpected server error";
    ctx.logger.error({ err: error }, "HTTP request failed");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
  });
  return app;
}
