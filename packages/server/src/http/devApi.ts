import type { Express, Request, Response, NextFunction } from "express";
import { intervalStats, getTimeline } from "../domain/history.js";
import { diffDays, localDateToUtc, matchCatalog, toLocalDate, warrantyStatus } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { seedDemo } from "../seed/seed.js";
import { recomputeHousehold } from "../domain/predictions.js";

function enabled(ctx: AppContext): boolean { return ctx.env.NODE_ENV !== "production" || ctx.env.OAUTH_ENABLED; }
function maskProfile<T extends { contact?: { phone?: string } }>(profile: T): T {
  if (!profile.contact?.phone) return profile;
  return { ...profile, contact: { ...profile.contact, phone: `•••••• ${profile.contact.phone.slice(-4)}` } };
}
interface DueApiEntry {
  itemId: string;
  component?: string;
  displayName: string;
  status: "ok" | "due_soon" | "due" | "overdue" | "warranty" | "delivery";
  nextDueLocal: string | null;
  daysUntilDue: number;
  reason: string;
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
  app.get("/api/households/:id/predictions", async (req, res, next) => {
    try {
      const predictions = await recomputeHousehold(ctx, req.params.id!, { schedule: false });
      res.json(predictions);
    } catch (error) { next(error); }
  });
  app.get("/api/households/:id/due", async (req, res, next) => {
    try {
      const days = Math.max(1, Math.min(31, Number(req.query.days ?? 7) || 7));
      const predictions = await recomputeHousehold(ctx, req.params.id!, { schedule: false });
      const household = await ctx.repositories.households.get(req.params.id!);
      const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
      const today = toLocalDate(ctx.clock.now().toISOString(), household?.timeZone ?? pack.locale.defaultTimeZone);
      const entries = (await Promise.all(predictions.map(async ({ item, main, components }): Promise<DueApiEntry[]> => {
        const itemPredictions = [main, ...components];
        const due: DueApiEntry[] = itemPredictions
          .filter((prediction) => prediction && prediction.status !== "unknown" && prediction.status !== "ok" && (prediction.status === "overdue" || prediction.daysUntilDue <= days))
          .map((prediction) => ({ itemId: item.itemId, ...(prediction!.component ? { component: prediction!.component } : {}), displayName: prediction!.component ? pack.catalog[item.catalogKey]?.components.find((part) => part.key === prediction!.component)?.displayName ?? item.name : item.name, status: prediction!.status as DueApiEntry["status"], nextDueLocal: prediction!.nextDueLocal, daysUntilDue: prediction!.daysUntilDue, reason: prediction!.explanation }));
        const warranty = item.warrantyUntil ? warrantyStatus(item, today) : undefined;
        if (warranty?.status === "valid" && (warranty.daysLeft ?? 999) <= 30) due.push({ itemId: item.itemId, displayName: `${item.name} warranty`, status: "warranty", nextDueLocal: item.warrantyUntil!, daysUntilDue: warranty.daysLeft!, reason: "Warranty expires within 30 days" });
        const events = await ctx.repositories.events.list(req.params.id!, item.itemId);
        const bookings = events.filter((event) => event.type === "booked").sort((left, right) => right.timestamp.localeCompare(left.timestamp));
        const booking = bookings[0];
        const delivered = booking && events.some((event) => event.type === "delivered" && event.relatedEventId === booking.eventId);
        if (booking?.booking?.expectedDeliveryLocal && !delivered && booking.booking.expectedDeliveryLocal <= today) due.push({ itemId: item.itemId, displayName: `${item.name} delivery`, status: "delivery", nextDueLocal: booking.booking.expectedDeliveryLocal, daysUntilDue: diffDays(today, booking.booking.expectedDeliveryLocal), reason: "Expected delivery has not been recorded" });
        return due;
      }))).flat();
      entries.sort((left, right) => (left.status === "overdue" ? 0 : left.status === "due" ? 1 : left.status === "due_soon" ? 2 : left.status === "warranty" ? 3 : 4) - (right.status === "overdue" ? 0 : right.status === "due" ? 1 : right.status === "due_soon" ? 2 : right.status === "warranty" ? 3 : 4) || left.daysUntilDue - right.daysUntilDue);
      res.json({ entries, generatedForLocal: today });
    } catch (error) { next(error); }
  });
  app.post("/api/dev/time-travel", async (req, res, next) => {
    if (!enabled(ctx)) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }); return; }
    try {
      const { days, to, reset } = req.body ?? {};
      const count = Number(days !== undefined) + Number(to !== undefined) + Number(reset === true);
      if (count !== 1 || (days !== undefined && (!Number.isInteger(days) || days < -400 || days > 400)) || (to !== undefined && typeof to !== "string")) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide exactly one valid days, to, or reset value" } });
        return;
      }
      if (reset) ctx.clock.set(null);
      else if (days !== undefined) ctx.clock.set(new Date(ctx.clock.now().getTime() + days * 86_400_000).toISOString());
      else {
        const parsed = new Date(to);
        if (Number.isNaN(parsed.getTime())) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "to must be an ISO date or date-time" } }); return; }
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(to);
        const household = await ctx.repositories.households.get(ctx.env.DEFAULT_HOUSEHOLD_ID);
        ctx.clock.set(isDate ? localDateToUtc(to, household?.timeZone ?? "UTC", 9) : parsed.toISOString());
      }
      const firedJobs = await ctx.scheduler.tick?.() ?? 0;
      const outbox = await ctx.notifier.listOutbox?.(undefined, 3) ?? [];
      res.json({ now: ctx.clock.now().toISOString(), firedJobs, outbox });
    } catch (error) { next(error); }
  });
  app.get("/api/schedule", async (req, res, next) => {
    if (!enabled(ctx)) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }); return; }
    try {
      res.json(await ctx.scheduler.list(typeof req.query.householdId === "string" ? req.query.householdId : undefined));
    } catch (error) { next(error); }
  });
  app.post("/api/dev/time-travel", async (req, res, next) => {
    if (!enabled(ctx)) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }); return; }
    try {
      const { days, to, reset } = req.body ?? {};
      const choices = Number(days !== undefined) + Number(to !== undefined) + Number(reset === true);
      if (choices !== 1 || (days !== undefined && (!Number.isInteger(days) || days < -400 || days > 400)) || (to !== undefined && typeof to !== "string")) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide exactly one valid days, to, or reset value" } });
        return;
      }
      if (reset) ctx.clock.set(null);
      else if (days !== undefined) ctx.clock.set(new Date(ctx.clock.now().getTime() + days * 86_400_000).toISOString());
      else {
        const parsed = new Date(to);
        if (Number.isNaN(parsed.getTime())) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "to must be an ISO date or date-time" } }); return; }
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(to);
        const household = await ctx.repositories.households.get(ctx.env.DEFAULT_HOUSEHOLD_ID);
        ctx.clock.set(dateOnly ? localDateToUtc(to, household?.timeZone ?? "UTC", 9) : parsed.toISOString());
      }
      const firedJobs = await ctx.scheduler.tick?.() ?? 0;
      const outbox = await ctx.notifier.listOutbox?.(undefined, 3) ?? [];
      res.json({ now: ctx.clock.now().toISOString(), firedJobs, outbox });
    } catch (error) { next(error); }
  });
}
