import type { Express, Request, Response, NextFunction } from "express";
import { intervalStats, getTimeline } from "../domain/history.js";
import { matchCatalog, toLocalDate } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { seedDemo } from "../seed/seed.js";

function enabled(ctx: AppContext): boolean { return ctx.env.NODE_ENV !== "production" || ctx.env.OAUTH_ENABLED; }
function maskProfile<T extends { contact?: { phone?: string } }>(profile: T): T {
  if (!profile.contact?.phone) return profile;
  return { ...profile, contact: { ...profile.contact, phone: `•••••• ${profile.contact.phone.slice(-4)}` } };
}
export function registerDevApi(app: Express, ctx: AppContext): void {
  app.use("/api/households", (_req: Request, res: Response, next: NextFunction) => {
    if (!enabled(ctx)) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }); return; }
    next();
  });
  app.get("/api/households", async (_req, res, next) => {
    try { res.json(await ctx.repositories.households.list()); } catch (error) { next(error); }
  });
  app.get("/api/households/:id", async (req, res, next) => {
    try {
      const household = await ctx.repositories.households.get(req.params.id!);
      if (!household) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Household not found" } }); return; }
      res.json(maskProfile(household));
    } catch (error) { next(error); }
  });
  app.get("/api/households/:id/items", async (req, res, next) => {
    try {
      const household = await ctx.repositories.households.get(req.params.id!);
      if (!household) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Household not found" } }); return; }
      const pack = ctx.regions.get(household.regionPackId ?? "DEFAULT");
      const today = toLocalDate(ctx.clock.now().toISOString(), household.timeZone ?? pack.locale.defaultTimeZone);
      const items = await ctx.repositories.items.list(household.householdId);
      const payload = await Promise.all(items.map(async (item) => {
        const events = await ctx.repositories.events.list(household.householdId, item.itemId);
        const action = pack.catalog[item.catalogKey]?.recurring?.action ?? "changed";
        return { ...item, intervalStats: intervalStats(events, action, today) };
      }));
      res.json(payload);
    } catch (error) { next(error); }
  });
  app.get("/api/households/:id/history", async (req, res, next) => {
    try {
      const household = await ctx.repositories.households.get(req.params.id!);
      const phrase = typeof req.query.item === "string" ? req.query.item : undefined;
      let itemId: string | undefined;
      if (household && phrase) {
        const alias = await ctx.repositories.aliases.get(household.householdId, phrase);
        const items = await ctx.repositories.items.list(household.householdId);
        const item = alias
          ? items.find((candidate) => candidate.itemId === alias.itemId)
          : items.find((candidate) => candidate.name.toLowerCase() === phrase.toLowerCase() || candidate.catalogKey === phrase)
            ?? items.find((candidate) => matchCatalog(phrase, ctx.regions.get(household.regionPackId ?? "DEFAULT")).some((match) => match.catalogKey === candidate.catalogKey));
        itemId = item?.itemId;
      }
      const timeline = await getTimeline(req.params.id!, {
        itemId,
        period: typeof req.query.period === "string" && ["30d", "90d", "1y", "all"].includes(req.query.period) ? req.query.period as "30d" | "90d" | "1y" | "all" : "1y",
      }, ctx);
      res.json({ timeline });
    } catch (error) { next(error); }
  });
  app.post("/api/dev/seed", async (req, res, next) => {
    if (!enabled(ctx)) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }); return; }
    try {
      const reset = req.body?.reset === true;
      const anchor = typeof req.body?.anchor === "string" ? req.body.anchor : undefined;
      res.json(await seedDemo(ctx, { reset, anchorLocal: anchor }));
    } catch (error) { next(error); }
  });
}
