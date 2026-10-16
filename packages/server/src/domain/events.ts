import { createHash } from "node:crypto";
import { HomeEvent, addDays, localDateToUtc, matchComponent, matchSymptom, newId, parseRelativeDate, toLocalDate, type HomeEvent as HomeEventType, type LogEventInput } from "@ellie/schema";
import { fillTemplate } from "@ellie/schema";
import type { AppContext } from "../context.js";
import type { HouseholdRecord } from "../data/householdRepo.js";
import { dedupeSk, householdPk } from "../data/keys.js";
import { getOrCreateHousehold, resolveHouseholdId } from "./households.js";
import { resolveItem } from "./items.js";
import { defaultPreviousWhen } from "./speech.js";
import { markAsked, savePending, type PlannedQuestion } from "./followups.js";
import { ValidationError } from "../lib/errors.js";

export interface LogEventOutcome {
  household: HouseholdRecord;
  item: Awaited<ReturnType<typeof resolveItem>>["item"];
  event?: HomeEventType;
  previousEvent?: HomeEventType;
  deduped: boolean;
  created?: boolean;
  custom?: boolean;
  followUp?: PlannedQuestion;
  safety?: { level: "stop"; message: string; emergencyNumber: string };
}

function eventHash(values: unknown): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 40);
}

export async function logEvent(input: LogEventInput, ctx: AppContext): Promise<LogEventOutcome> {
  const householdId = resolveHouseholdId(input.householdId, ctx);
  const household = await getOrCreateHousehold(householdId, ctx);
  const pack = ctx.regions.get(household.regionPackId || "DEFAULT");
  const resolved = await resolveItem(household, input.item, input, ctx);
  const item = resolved.item;
  const timezone = household.timeZone ?? pack.locale.defaultTimeZone;
  const now = ctx.clock.now();
  const nowIso = now.toISOString();
  const todayLocal = toLocalDate(nowIso, timezone);
  const parsedWhen = input.when ? parseRelativeDate(input.when, todayLocal, { dateOrder: pack.locale.dateOrder }) : null;
  if (input.when && !parsedWhen) throw new ValidationError("Invalid or future event date", "That date is in the future or unclear. When did it actually happen?");
  const localDate = parsedWhen?.localDate ?? todayLocal;
  const approximate = parsedWhen?.approximate ?? false;

  const entry = pack.catalog[item.catalogKey];
  const recurring = entry?.recurring;
  const componentMatch = input.component && entry ? matchComponent(input.component, entry) : null;
  if (input.component && !componentMatch) throw new ValidationError("Unknown item component", "Which part do you mean: filter or membrane?");
  const existingEvents = await ctx.repositories.events.list(householdId, item.itemId);
  const hasPreviousAction = existingEvents.some((event) => event.type === recurring?.action);
  const askedField = `${item.itemId}:previousWhen`;
  const alreadyAsked = household.askedFields.includes(askedField);
  if (recurring && (input.type === "changed" || input.type === "serviced") && input.type === recurring.action && !hasPreviousAction && !input.previousWhen && !alreadyAsked) {
    const question: PlannedQuestion = {
      scope: item.itemId,
      field: "previousWhen",
      question: `Roughly when was the previous ${item.name} ${recurring.action}?`,
      defaultValue: defaultPreviousWhen(recurring.defaultIntervalDays),
      retry: { tool: "log_event", argName: "previousWhen", args: { ...input, householdId } },
    };
    await markAsked(question, ctx);
    await savePending(householdId, question, ctx);
    return { household, item, deduped: false, created: resolved.created, custom: resolved.custom, followUp: question };
  }
  const rawPreviousWhen = input.previousWhen ?? (alreadyAsked && recurring && !hasPreviousAction && input.type === recurring.action
    ? defaultPreviousWhen(recurring.defaultIntervalDays)
    : undefined);
  const previousAnswer = rawPreviousWhen && /^(not sure|don't know|do not know|no idea)$/i.test(rawPreviousWhen.trim())
    ? defaultPreviousWhen(recurring?.defaultIntervalDays ?? 40)
    : rawPreviousWhen;
  if (previousAnswer) {
    const parsedPrevious = parseRelativeDate(previousAnswer, todayLocal, { dateOrder: pack.locale.dateOrder });
    if (!parsedPrevious || parsedPrevious.localDate >= localDate) throw new ValidationError("Invalid previous event date", "That previous date should be earlier. Roughly when did it happen?");
  }

  const symptomMatch = input.symptom && entry ? matchSymptom(input.symptom, entry) : null;
  const symptomDefinition = symptomMatch && entry ? entry.symptoms.find((symptom) => symptom.key === symptomMatch.key) : undefined;
  let safety: LogEventOutcome["safety"];
  if (symptomDefinition?.safety) {
    const emergencyNumber = pack.safety.numbers[symptomDefinition.safety] ?? pack.safety.generalEmergency;
    safety = {
      level: "stop",
      emergencyNumber,
      message: fillTemplate(pack.safety.stopMessages[symptomDefinition.safety]!, { number: emergencyNumber }),
    };
  }

  const baseDate = input.when ? localDateToUtc(localDate, timezone) : nowIso;
  if (input.type === "cost" && input.cost === undefined) throw new ValidationError("Cost event requires amount", "How much did it cost?");
  const makeEvent = (date: string, eventTimestamp: string, isApproximate: boolean, notes?: string, type = input.type): HomeEventType => HomeEvent.parse({
    schemaVersion: 1,
    eventId: newId("evt"),
    householdId,
    itemId: item.itemId,
    ...(componentMatch ? { component: componentMatch.key } : {}),
    type,
    timestamp: eventTimestamp,
    localDate: date,
    dateIsApproximate: isApproximate,
    recordedAt: nowIso,
    source: "voice",
    ...(notes ?? input.notes ? { notes: notes ?? input.notes } : {}),
    ...(type === "cost" || input.type === "cost" ? { cost: { amount: input.cost ?? 0, currency: household.units?.currency ?? pack.units.currency } } : {}),
    ...(type === "symptom" || input.type === "symptom" ? { symptom: { key: symptomMatch?.key ?? "other", description: input.symptom } } : {}),
    ...(type === "booked" ? { booking: {
      providerKey: input.providerKey ?? item.providerKey,
      channel: (input.providerKey ? pack.providers[input.providerKey]?.channel : item.providerKey ? pack.providers[item.providerKey]?.channel : "none") ?? "none",
      expectedDeliveryLocal: addDays(date, recurring?.leadTimeDays ?? 0),
    } } : {}),
  });

  let previousEvent: HomeEventType | undefined;
  const dedupeHash = eventHash([householdId, item.itemId, input.type, localDate, symptomMatch?.key ?? input.symptom ?? "", input.requestId ?? ""]);
  const markerKey = dedupeSk(dedupeHash);
  const prior = await ctx.storage.get(householdPk(householdId), markerKey);
  if (prior?.data.event) return { household, item, event: prior.data.event as HomeEventType, deduped: true, created: resolved.created, custom: resolved.custom };

  if (previousAnswer && recurring) {
    const previous = parseRelativeDate(previousAnswer, todayLocal, { dateOrder: pack.locale.dateOrder })!;
    previousEvent = makeEvent(previous.localDate, localDateToUtc(previous.localDate, timezone), previous.approximate, "Recalled by user", recurring.action);
    await ctx.repositories.events.put(previousEvent);
    await ctx.repositories.pending.delete(householdId, `${item.itemId}:previousWhen`);
  }
  let event = makeEvent(localDate, baseDate, approximate);
  if (input.type === "delivered") {
    const booked = existingEvents.filter((candidate) => candidate.type === "booked");
    const linked = new Set(existingEvents.flatMap((candidate) => candidate.relatedEventId ? [candidate.relatedEventId] : []));
    const latest = [...booked].reverse().find((candidate) => !linked.has(candidate.eventId));
    if (latest) event = HomeEvent.parse({ ...event, relatedEventId: latest.eventId });
  }
  if (input.type === "installed" && !item.purchaseDate) {
    item.purchaseDate = localDate;
    await ctx.repositories.items.put(item);
  }

  await ctx.repositories.events.put(event);
  const dedupeTtl = Math.floor(now.getTime() / 1000) + ctx.env.EVENT_DEDUPE_WINDOW_SEC;
  await ctx.storage.put({ pk: householdPk(householdId), sk: markerKey, type: "event-dedupe", data: { event }, ttl: dedupeTtl });
  return { household, item, event, ...(previousEvent ? { previousEvent } : {}), deduped: false, created: resolved.created, custom: resolved.custom, ...(safety ? { safety } : {}) };
}
