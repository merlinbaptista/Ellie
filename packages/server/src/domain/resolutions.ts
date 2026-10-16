import { Resolution, newId, parseRelativeDate, toLocalDate, type LogResolutionInput } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { resolveHouseholdId, getOrCreateHousehold } from "./households.js";
import { resolveItem } from "./items.js";
import { logEvent } from "./events.js";
import { recomputeItem } from "./predictions.js";

export interface ResolutionOutcome { resolution: Resolution; itemName: string; prediction?: Awaited<ReturnType<typeof recomputeItem>> }
export async function logResolution(ctx: AppContext, input: LogResolutionInput): Promise<ResolutionOutcome> {
  const householdId = resolveHouseholdId(input.householdId, ctx);
  const household = await getOrCreateHousehold(householdId, ctx);
  const pack = ctx.regions.get(household.regionPackId ?? "DEFAULT");
  const itemResult = await resolveItem(household, input.item, {}, ctx);
  const item = itemResult.item;
  const diagnosis = input.diagnosisId ? await ctx.repositories.diagnoses.get(householdId, input.diagnosisId) : null;
  const candidates = diagnosis?.candidates ?? [];
  const topCandidate = candidates[0];
  const symptom = diagnosis?.symptomKey ?? "other";
  const entry = pack.catalog[item.catalogKey];
  const causeKey = input.causeKey ?? topCandidate?.causeKey ?? (input.cause
    ? entry?.symptoms.flatMap((row) => row.likelyCauses).find((candidate) => `${candidate.key} ${candidate.description}`.toLowerCase().includes(input.cause!.toLowerCase()))?.key
    : undefined) ?? "other";
  const cause = input.cause ?? topCandidate?.description ?? causeKey;
  const fix = input.fix ?? diagnosis?.fixPlan?.summary ?? "Fix recorded";
  const packCause = entry?.symptoms.flatMap((row) => row.likelyCauses).find((candidate) => candidate.key === causeKey);
  const component = input.component ?? packCause?.relatedComponent ?? entry?.components.find((part) => fix.toLowerCase().includes(part.displayName.toLowerCase()) || part.aliases.some((alias) => fix.toLowerCase().includes(alias)))?.key;
  const today = toLocalDate(ctx.clock.now().toISOString(), household.timeZone ?? pack.locale.defaultTimeZone);
  const parsedDate = input.when ? parseRelativeDate(input.when, today, { dateOrder: pack.locale.dateOrder }) : { localDate: today, approximate: false };
  const localDate = parsedDate?.localDate ?? today;
  const citedRefs = diagnosis?.explanation?.citedEvidenceIds
    .map((evidenceId) => diagnosis?.evidence.find((evidence) => evidence.evidenceId === evidenceId)?.refId)
    .filter((refId): refId is string => Boolean(refId)) ?? [];
  const supporting = [diagnosis?.symptomEventId, ...citedRefs].filter((id): id is string => typeof id === "string" && id.startsWith("evt_"));
  const existing = await ctx.repositories.resolutions.list(householdId, item.itemId);
  const duplicate = existing.find((record) => record.causeKey === causeKey && record.localDate === localDate);
  if (duplicate) {
    const prediction = await recomputeItem(ctx, householdId, item.itemId);
    return { resolution: duplicate, itemName: item.name, prediction };
  }
  const resolution = Resolution.parse({
    schemaVersion: 1,
    resolutionId: newId("res"),
    householdId,
    itemId: item.itemId,
    symptomKey: symptom,
    causeKey,
    ...(component ? { component } : {}),
    cause,
    fix,
    ...(input.cost !== undefined ? { cost: { amount: input.cost, currency: household.units?.currency ?? pack.units.currency } } : {}),
    confirmedBy: input.byWhom === "technician" || input.byWhom === "warranty_service" ? "phone" : "voice",
    ...(input.byWhom ? { byWhom: input.byWhom } : {}),
    localDate,
    supportingEventIds: [...new Set(supporting)],
    createdAt: ctx.clock.now().toISOString(),
  });
  await ctx.repositories.resolutions.put(resolution);
  const replacement = /replace|replaced|changed|new|swapped|installed/i.test(`${fix} ${cause}`);
  if (replacement && component) await logEvent({ householdId, item: input.item, itemName: item.name, type: "changed", component, when: localDate, notes: fix }, ctx);
  else if (input.byWhom === "technician" || input.byWhom === "warranty_service") await logEvent({ householdId, item: input.item, itemName: item.name, type: "serviced", component, when: localDate, notes: fix }, ctx);
  if (input.cost !== undefined) {
    const events = await ctx.repositories.events.list(householdId, item.itemId);
    const hasSameCost = events.some((event) => event.type === "cost" && event.localDate === localDate && event.cost?.amount === input.cost && event.cost?.currency === (household.units?.currency ?? pack.units.currency));
    if (!hasSameCost) await logEvent({ householdId, item: input.item, itemName: item.name, type: "cost", when: localDate, cost: input.cost, notes: fix }, ctx);
  }
  if (diagnosis) await ctx.repositories.diagnoses.put(householdId, { ...diagnosis, status: "diagnosed", resolvedAt: ctx.clock.now().toISOString(), updatedAt: ctx.clock.now().toISOString() }, ctx.env.DIAGNOSIS_SESSION_TTL_HOURS);
  const prediction = await recomputeItem(ctx, householdId, item.itemId);
  return { resolution, itemName: item.name, prediction };
}
