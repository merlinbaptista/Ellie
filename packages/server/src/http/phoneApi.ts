import { createHash } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Diagnosis } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { logEvent } from "../domain/events.js";
import { logResolution } from "../domain/resolutions.js";
import { scheduleDeliveryCheck } from "../domain/reminders.js";
import { buildPhoneView } from "../phone/views.js";
import { renderPhonePage } from "../phone/fallbackPage.js";
import { verifyPhoneLink, PhoneTokenError } from "../links/sign.js";
import { allowRate } from "./rateLimit.js";
import { linkPk, phoneActionSk, ttlClockForKey } from "../data/keys.js";
import { NotFoundError } from "../lib/errors.js";

const expiredSpeech = "This link has expired. Ask Alexa to send it again.";
const invalidSpeech = "This link is invalid. Ask Alexa to send it again.";
const actionLabels = new Set(["fixed", "not_fixed", "booked"]);

function requestToken(req: Request): string {
  const authorization = req.header("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const query = typeof req.query.t === "string" ? req.query.t : undefined;
  const body = typeof req.body?.t === "string" ? req.body.t : undefined;
  return bearer ?? query ?? body ?? "";
}
function allowRequest(req: Request, token: string, method: "get" | "post"): boolean {
  const tokenKey = createHash("sha256").update(token).digest("hex").slice(0, 12);
  const limit = method === "get" ? 60 : 10;
  return allowRate(`${method}:ip:${req.ip}`, limit, 60_000) && allowRate(`${method}:token:${tokenKey}`, limit, 60_000);
}
function respondTokenError(res: Response, error: unknown): void {
  if (error instanceof PhoneTokenError && error.reason === "expired") res.status(410).json({ error: "expired", message: expiredSpeech });
  else res.status(403).json({ error: "invalid", message: invalidSpeech });
}
function actionKey(token: string, action: string): string {
  return phoneActionSk(createHash("sha256").update(token).digest("hex").slice(0, 24), action);
}
function setPrivateHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function registerPhoneApi(app: Express, ctx: AppContext): void {
  app.get("/api/phone/view", async (req, res, next) => {
    setPrivateHeaders(res);
    const token = requestToken(req);
    if (!allowRequest(req, token, "get")) { res.status(429).json({ error: "rate_limited" }); return; }
    try {
      const payload = verifyPhoneLink(token, ctx.env);
      res.json(await buildPhoneView(ctx, payload));
    } catch (error) {
      if (error instanceof PhoneTokenError) respondTokenError(res, error);
      else if (error instanceof NotFoundError) res.status(404).json({ error: "not_found", message: error.speech });
      else next(error);
    }
  });

  app.post("/api/phone/actions/:action", async (req, res, next) => {
    setPrivateHeaders(res);
    const action = Array.isArray(req.params.action) ? req.params.action[0] : req.params.action;
    const token = requestToken(req);
    if (!action || !actionLabels.has(action)) { res.status(404).json({ error: "not_found" }); return; }
    if (!allowRequest(req, token, "post")) { res.status(429).json({ error: "rate_limited" }); return; }
    try {
      const payload = verifyPhoneLink(token, ctx.env);
      if ((action === "fixed" || action === "not_fixed") && payload.kind !== "fix") { res.status(403).json({ error: "wrong_link_kind" }); return; }
      if (action === "booked" && payload.kind !== "booking") { res.status(403).json({ error: "wrong_link_kind" }); return; }
      const dedupeSk = actionKey(token, action);
      const previous = await ctx.storage.get(linkPk(), dedupeSk);
      if (previous) {
        if (req.is("application/x-www-form-urlencoded")) { res.redirect(303, `/p/${encodeURIComponent(token)}?done=${action}`); return; }
        res.json(previous.data.result);
        return;
      }
      let result: Record<string, unknown>;
      if (action === "booked") {
        const item = await ctx.repositories.items.get(payload.hh, payload.ref ?? "");
        if (!item) { res.status(404).json({ error: "item_not_found" }); return; }
        const logged = await logEvent({ householdId: payload.hh, item: item.name, type: "booked", source: "phone", providerKey: item.providerKey }, ctx);
        if (logged.event) await scheduleDeliveryCheck(ctx, payload.hh, item, logged.event);
        result = { ok: true, eventId: logged.event?.eventId };
      } else {
        if (!payload.ref) { res.status(400).json({ error: "missing_diagnosis" }); return; }
        const diagnosis = await ctx.repositories.diagnoses.get(payload.hh, payload.ref);
        if (!diagnosis || diagnosis.status === "safety_stop") { res.status(404).json({ error: "diagnosis_not_found" }); return; }
        if (action === "fixed") {
          const item = await ctx.repositories.items.get(payload.hh, diagnosis.itemId);
          if (!item) { res.status(404).json({ error: "item_not_found" }); return; }
          const top = diagnosis.candidates[0];
          const outcome = await logResolution(ctx, { householdId: payload.hh, item: item.name, diagnosisId: diagnosis.diagnosisId, ...(top ? { causeKey: top.causeKey } : {}), ...(diagnosis.fixPlan?.summary ? { fix: diagnosis.fixPlan.summary } : {}), byWhom: "self" });
          result = { ok: true, nextDue: outcome.prediction?.mostUrgent?.nextDueLocal };
        } else {
          const item = await ctx.repositories.items.get(payload.hh, diagnosis.itemId);
          if (!item) { res.status(404).json({ error: "item_not_found" }); return; }
          await logEvent({ householdId: payload.hh, item: item.name, type: "note", source: "phone", notes: "Fix didn't work" }, ctx);
          await ctx.repositories.diagnoses.put(payload.hh, { ...diagnosis, status: "needs_pro", updatedAt: ctx.clock.now().toISOString() } as Diagnosis, ctx.env.DIAGNOSIS_SESSION_TTL_HOURS);
          result = { ok: true, view: "call_a_professional" };
        }
      }
      const actionPk = linkPk();
      await ctx.storage.put({ pk: actionPk, sk: dedupeSk, type: "phone-action", data: { result }, ttlClock: ttlClockForKey(actionPk, dedupeSk), ttl: Math.floor(Date.now() / 1000) + ctx.env.PHONE_LINK_TTL_HOURS * 3600 });
      if (req.is("application/x-www-form-urlencoded")) res.redirect(303, `/p/${encodeURIComponent(token)}?done=${action}`);
      else res.json(result);
    } catch (error) {
      if (error instanceof PhoneTokenError) respondTokenError(res, error);
      else next(error);
    }
  });

  app.get("/p/:token", async (req, res, next) => {
    setPrivateHeaders(res);
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
      const payload = verifyPhoneLink(token ?? "", ctx.env);
      const view = await buildPhoneView(ctx, payload);
      res.status(200).type("html").send(renderPhonePage(view, token ?? "", typeof req.query.done === "string" ? "Thanks, your update has been saved." : undefined));
    } catch (error) {
      if (error instanceof PhoneTokenError) {
        const status = error.reason === "expired" ? 410 : 403;
        const message = error.reason === "expired" ? expiredSpeech : invalidSpeech;
        res.status(status).type("text/html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'self'"><title>Ellie link</title></head><body><main><h1>${message}</h1></main></body></html>`);
      } else if (error instanceof NotFoundError) {
        res.status(404).type("text/html").send("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"><title>Ellie link</title></head><body><main><h1>This guide is no longer available. Ask Alexa to send it again.</h1></main></body></html>");
      } else next(error);
    }
  });
}
