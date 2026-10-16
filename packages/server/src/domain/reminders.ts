import { addDays, formatLocalDate, localDateToUtc } from "@ellie/schema";
import type { HomeEvent, Item, Prediction, Provider, ResolvedRegionPack } from "@ellie/schema";
import type { AppContext } from "../context.js";
import type { HouseholdRecord } from "../data/householdRepo.js";
import type { ScheduledJob } from "../adapters/scheduler/types.js";
import type { OutboundMessage } from "../adapters/notifier/types.js";
import { buildProviderLink } from "./providerLinks.js";
import { loadHouseholdSnapshot } from "./snapshot.js";
import { recomputeItem } from "./predictions.js";

export function reminderJobId(householdId: string, itemId: string, component?: string): string {
  return component ? `remind:${householdId}:${itemId}:${component}` : `remind:${householdId}:${itemId}`;
}
export function deliveryJobId(householdId: string, itemId: string): string {
  return `delivery:${householdId}:${itemId}`;
}

export async function schedulePredictionReminder(ctx: AppContext, prediction: Prediction, item: Item, household: HouseholdRecord | null, pack: ResolvedRegionPack): Promise<Prediction> {
  const id = reminderJobId(prediction.householdId, prediction.itemId, prediction.component);
  if (!prediction.remindOnLocal || !prediction.nextDueLocal || !["ok", "due_soon"].includes(prediction.status)) {
    await ctx.scheduler.cancel(id);
    const unscheduled = { ...prediction, scheduleId: undefined };
    await ctx.repositories.predictions.put(prediction.householdId, unscheduled);
    return unscheduled;
  }
  const timeZone = household?.timeZone ?? pack.locale.defaultTimeZone;
  const runAtUtc = localDateToUtc(prediction.remindOnLocal, timeZone, 9);
  if (new Date(runAtUtc).getTime() <= ctx.clock.now().getTime()) {
    await ctx.scheduler.cancel(id);
    const unscheduled = { ...prediction, scheduleId: undefined };
    await ctx.repositories.predictions.put(prediction.householdId, unscheduled);
    return unscheduled;
  }
  const displayName = prediction.component
    ? pack.catalog[item.catalogKey]?.components.find((component) => component.key === prediction.component)?.displayName ?? item.name
    : item.name;
  const job: ScheduledJob = {
    id,
    runAtUtc,
    timeZone,
    payload: { kind: "reminder", householdId: prediction.householdId, itemId: prediction.itemId, ...(prediction.component ? { component: prediction.component } : {}), lastEventLocal: prediction.lastEventLocal, message: `${displayName} is due around ${formatLocalDate(prediction.nextDueLocal, pack, "speech")}.` },
  };
  await ctx.scheduler.schedule(job);
  const scheduled = { ...prediction, scheduleId: id };
  await ctx.repositories.predictions.put(prediction.householdId, scheduled);
  return scheduled;
}

export async function cancelItemReminder(ctx: AppContext, householdId: string, itemId: string): Promise<void> {
  const jobs = await ctx.scheduler.list(householdId);
  await Promise.all(jobs.filter((job) => job.id === reminderJobId(householdId, itemId) || job.id.startsWith(`${reminderJobId(householdId, itemId)}:`)).map((job) => ctx.scheduler.cancel(job.id)));
}
export async function cancelDeliveryCheck(ctx: AppContext, householdId: string, itemId: string): Promise<void> {
  await ctx.scheduler.cancel(deliveryJobId(householdId, itemId));
}
export async function scheduleDeliveryCheck(ctx: AppContext, householdId: string, item: Item, bookedEvent: HomeEvent): Promise<void> {
  const expected = bookedEvent.booking?.expectedDeliveryLocal;
  if (!expected) return;
  const household = await ctx.repositories.households.get(householdId);
  const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
  const timeZone = household?.timeZone ?? pack.locale.defaultTimeZone;
  const runAtUtc = localDateToUtc(addDays(expected, 1), timeZone, 9);
  await ctx.scheduler.schedule({
    id: deliveryJobId(householdId, item.itemId),
    runAtUtc,
    timeZone,
    payload: { kind: "delivery_check", householdId, itemId: item.itemId, message: `Did your ${item.name} arrive?` },
  });
}

function outboxMessage(job: ScheduledJob, item: Item | undefined, household: HouseholdRecord | null, provider: Provider | undefined, pack: ResolvedRegionPack, prediction?: Prediction): OutboundMessage {
  const displayName = item?.name ?? "home item";
  const link = item ? buildProviderLink(provider, { displayName, brand: item.brand, model: item.model }) : undefined;
  const recipient = household?.contact?.phone ?? household?.contact?.email ?? "outbox";
  const channel = household?.contact?.email && !household.contact.phone ? "email" : "sms";
  let body: string;
  if (job.payload.kind === "delivery_check") body = `Ellie: Did your ${displayName} arrive? Tell Alexa "the ${displayName} came."`;
  else if (prediction?.nextDueLocal) {
    const date = formatLocalDate(prediction.nextDueLocal, pack, "speech");
    body = `Ellie: Your ${displayName} should be due around ${date}.${link ? ` Book or order: ${link}` : ""}`;
  } else body = `Ellie: ${job.payload.message}`;
  return {
    householdId: job.payload.householdId,
    channel,
    to: recipient,
    body: body.slice(0, 300),
    ...(link ? { link } : {}),
    kind: "reminder",
  };
}

export async function handleReminderFire(job: ScheduledJob, ctx: AppContext): Promise<void> {
  const snapshot = await loadHouseholdSnapshot(job.payload.householdId, ctx);
  const item = snapshot.items.find((candidate) => candidate.itemId === job.payload.itemId);
  const household = snapshot.profile;
  if (!item) {
    ctx.logger.warn({ jobId: job.id }, "reminder.skipped_stale");
    return;
  }
  const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
  if (job.payload.kind === "delivery_check") {
    const latestBooking = (snapshot.eventsByItem.get(item.itemId) ?? []).filter((event) => event.type === "booked").sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
    const delivered = latestBooking && (snapshot.eventsByItem.get(item.itemId) ?? []).some((event) => event.type === "delivered" && event.relatedEventId === latestBooking.eventId);
    if (delivered) {
      ctx.logger.info({ jobId: job.id }, "reminder.skipped_stale");
      return;
    }
    await ctx.notifier.send(outboxMessage(job, item, household, undefined, pack));
    return;
  }
  const itemPredictions = await recomputeItem(ctx, job.payload.householdId, item.itemId, { schedule: false });
  const prediction = [itemPredictions.main, ...itemPredictions.components].find((candidate) => candidate?.component === job.payload.component) ?? null;
  const latestAction = (snapshot.eventsByItem.get(item.itemId) ?? [])
    .filter((event) => event.component === job.payload.component || (!job.payload.component && !event.component))
    .filter((event) => event.type === "changed" || event.type === "serviced" || event.type === "cost")
    .sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
  if (!prediction || prediction.status === "ok" || prediction.status === "unknown" || (job.payload.lastEventLocal && latestAction && latestAction.localDate > job.payload.lastEventLocal)) {
    ctx.logger.info({ jobId: job.id }, "reminder.skipped_stale");
    return;
  }
  const provider = item.providerKey ? pack.providers[item.providerKey] : undefined;
  await ctx.notifier.send(outboxMessage(job, item, household, provider, pack, prediction));
}

export function isDueThisWeekStatus(status: Prediction["status"]): boolean {
  return status === "overdue" || status === "due" || status === "due_soon";
}
