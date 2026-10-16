import { HomeEvent, Item, Resolution, addDays, localDateToUtc, toLocalDate } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { householdIndexPk, householdIndexSk, householdPk } from "../data/keys.js";
import type { HouseholdRecord } from "../data/householdRepo.js";
import { DEMO_HOUSEHOLDS, type DemoHouseholdSpec } from "./households.js";

interface SeedItemSpec {
  itemId: string;
  catalogKey: string;
  kind: "supply" | "appliance" | "safety_device";
  name: string;
  providerKey?: string;
  brand?: string;
  purchaseDate?: string;
  warrantyUntil?: string;
  itemName?: string;
}

function seedItems(household: DemoHouseholdSpec): SeedItemSpec[] {
  if (household.householdId === "demo-blr") return [
    { itemId: "itm_seed-blr-lpg", catalogKey: "lpg_cylinder", kind: "supply", name: "gas cylinder", providerKey: "indane" },
    { itemId: "itm_seed-blr-ro", catalogKey: "ro_purifier", kind: "appliance", name: "water purifier", brand: "Kent", purchaseDate: "2024-12-20", warrantyUntil: "2026-12-20" },
    { itemId: "itm_seed-blr-battery", catalogKey: "inverter_battery", kind: "appliance", name: "inverter" },
    { itemId: "itm_seed-blr-ac", catalogKey: "air_conditioner", kind: "appliance", name: "AC", itemName: "bedroom AC" },
  ];
  return [
    { itemId: "itm_seed-tx-propane", catalogKey: "propane_tank", kind: "supply", name: "propane tank", providerKey: "local_propane" },
    { itemId: "itm_seed-tx-hvac", catalogKey: "hvac_filter", kind: "supply", name: "HVAC filter" },
    { itemId: "itm_seed-tx-fridge", catalogKey: "fridge_water_filter", kind: "appliance", name: "fridge filter" },
    { itemId: "itm_seed-tx-smoke", catalogKey: "smoke_alarm", kind: "safety_device", name: "smoke alarm" },
  ];
}

export interface SeedOptions { reset?: boolean; anchorLocal?: string }
export interface SeedHouseholdSummary { householdId: string; anchor: string; items: number; events: number; lastChange: string | null }
export interface SeedResult { households: SeedHouseholdSummary[] }

export async function seedDemo(ctx: AppContext, options: SeedOptions = {}): Promise<SeedResult> {
  if (options.reset) {
    for (const spec of DEMO_HOUSEHOLDS) {
      await ctx.storage.deletePartition(householdPk(spec.householdId));
      await ctx.storage.delete(householdIndexPk(), householdIndexSk(spec.householdId));
    }
  }
  const summaries: SeedHouseholdSummary[] = [];
  for (const [householdIndex, spec] of DEMO_HOUSEHOLDS.entries()) {
    const pack = ctx.regions.forCountry(spec.country);
    const anchor = options.anchorLocal ?? ctx.env.SEED_ANCHOR_DATE ?? toLocalDate(ctx.clock.now().toISOString(), spec.timeZone);
    const anchorUtc = localDateToUtc(anchor, spec.timeZone);
    const now = ctx.clock.now().toISOString();
    const existing = await ctx.repositories.households.get(spec.householdId);
    const household: HouseholdRecord = {
      schemaVersion: 1,
      householdId: spec.householdId,
      displayName: spec.displayName,
      country: spec.country,
      region: spec.region,
      timeZone: spec.timeZone,
      language: spec.language,
      ...(spec.phoneLanguage ? { phoneLanguage: spec.phoneLanguage } : {}),
      units: pack.units,
      regionPackId: pack.packId,
      regionPackVersion: pack.version,
      contact: spec.phone
        ? { phone: spec.phone, consentGivenAt: localDateToUtc(addDays(anchor, -60), spec.timeZone), consentSource: "seed" }
        : { email: spec.email!, consentGivenAt: localDateToUtc(addDays(anchor, -90), spec.timeZone), consentSource: "seed" },
      askedFields: householdIndex === 0 ? ["household:region", "household:phone", "household:phoneLanguage"] : ["household:region", "household:phone"],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await ctx.repositories.households.put(household);
    const items = seedItems(spec);
    for (const itemSpec of items) {
      const saved = Item.parse({
        schemaVersion: 1,
        householdId: spec.householdId,
        catalogKey: itemSpec.catalogKey,
        kind: itemSpec.kind,
        itemId: itemSpec.itemId,
        name: itemSpec.name,
        ...(itemSpec.providerKey ? { providerKey: itemSpec.providerKey } : {}),
        ...(itemSpec.brand ? { brand: itemSpec.brand } : {}),
        ...(itemSpec.purchaseDate ? { purchaseDate: itemSpec.purchaseDate } : {}),
        ...(itemSpec.warrantyUntil ? { warrantyUntil: itemSpec.warrantyUntil } : {}),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.repositories.items.put(saved);
      await ctx.repositories.aliases.put(spec.householdId, itemSpec.name, itemSpec.itemId, now);
      if (itemSpec.itemName) await ctx.repositories.aliases.put(spec.householdId, itemSpec.itemName, itemSpec.itemId, now);
    }

    const eventSpecs: Array<{ itemId: string; type: "changed" | "serviced" | "symptom" | "booked" | "delivered" | "cost"; component?: string; offset?: number; localDate?: string; suffix: string; notes?: string; cost?: number; symptom?: { key: string; description?: string }; relatedEventId?: string }> = [];
    if (spec.householdId === "demo-blr") {
      [-38, -76, -115, -152, -190].forEach((offset, index) => eventSpecs.push({ itemId: "itm_seed-blr-lpg", type: "changed", offset, suffix: `lpg-${String(index + 1).padStart(2, "0")}` }));
      eventSpecs.push({ itemId: "itm_seed-blr-lpg", type: "booked", offset: -42, suffix: "lpg-booked" });
      eventSpecs.push({ itemId: "itm_seed-blr-lpg", type: "delivered", offset: -39, suffix: "lpg-delivered", relatedEventId: `evt_seed-blr-lpg-booked` });
      eventSpecs.push({ itemId: "itm_seed-blr-ro", type: "serviced", component: "sediment_filter", offset: -270, suffix: "ro-service", notes: "filter changed" });
      eventSpecs.push({ itemId: "itm_seed-blr-ro", type: "symptom", localDate: "2026-03-14", suffix: "ro-beep", notes: "tank-full light on", symptom: { key: "beeping", description: "beeping" } });
      eventSpecs.push({ itemId: "itm_seed-blr-ro", type: "serviced", component: "ro_membrane", localDate: "2026-03-16", suffix: "ro-membrane", notes: "membrane replaced by technician" });
      eventSpecs.push({ itemId: "itm_seed-blr-ro", type: "cost", localDate: "2026-03-16", suffix: "ro-cost", cost: 2400 });
      eventSpecs.push({ itemId: "itm_seed-blr-battery", type: "serviced", offset: -50, suffix: "battery-service" });
      eventSpecs.push({ itemId: "itm_seed-blr-ac", type: "serviced", offset: -200, suffix: "ac-service" });
      eventSpecs.push({ itemId: "itm_seed-blr-ac", type: "cost", offset: -200, suffix: "ac-cost", cost: 1250 });
    } else {
      [-58, -121, -180].forEach((offset, index) => eventSpecs.push({ itemId: "itm_seed-tx-propane", type: "changed", offset, suffix: `propane-${index + 1}` }));
      eventSpecs.push({ itemId: "itm_seed-tx-propane", type: "cost", offset: -58, suffix: "propane-cost", cost: 310 });
      [-85, -176].forEach((offset, index) => eventSpecs.push({ itemId: "itm_seed-tx-hvac", type: "changed", offset, suffix: `hvac-${index + 1}` }));
      eventSpecs.push({ itemId: "itm_seed-tx-fridge", type: "changed", offset: -150, suffix: "fridge-change" });
      eventSpecs.push({ itemId: "itm_seed-tx-smoke", type: "serviced", offset: -170, suffix: "smoke-service" });
    }
    for (const eventSpec of eventSpecs) {
      const localDate = eventSpec.localDate ?? addDays(anchor, eventSpec.offset ?? 0);
      const id = `evt_seed-${spec.householdId === "demo-blr" ? "blr" : "tx"}-${eventSpec.suffix}`;
      const bookingProvider = eventSpec.type === "booked" ? spec.householdId === "demo-blr" ? "indane" : "local_propane" : undefined;
      const provider = bookingProvider ? pack.providers[bookingProvider] : undefined;
      const parsed = HomeEvent.parse({
        schemaVersion: 1,
        eventId: id,
        householdId: spec.householdId,
        itemId: eventSpec.itemId,
        ...(eventSpec.component ? { component: eventSpec.component } : {}),
        type: eventSpec.type,
        timestamp: localDateToUtc(localDate, spec.timeZone),
        localDate,
        dateIsApproximate: false,
        recordedAt: anchorUtc,
        source: "seed",
        ...(eventSpec.notes ? { notes: eventSpec.notes } : {}),
        ...(eventSpec.cost !== undefined ? { cost: { amount: eventSpec.cost, currency: spec.currency } } : {}),
        ...(eventSpec.symptom ? { symptom: eventSpec.symptom } : {}),
        ...(eventSpec.type === "booked" ? { booking: { providerKey: bookingProvider, channel: provider?.channel ?? "none", expectedDeliveryLocal: addDays(localDate, 3) } } : {}),
        ...(eventSpec.relatedEventId ? { relatedEventId: eventSpec.relatedEventId } : {}),
      });
      await ctx.repositories.events.put(parsed);
    }
    if (spec.householdId === "demo-blr") {
      const resolution = Resolution.parse({
        schemaVersion: 1,
        resolutionId: "res_seed-blr-ro-01",
        householdId: "demo-blr",
        itemId: "itm_seed-blr-ro",
        symptomKey: "beeping",
        causeKey: "membrane_clogged",
        component: "ro_membrane",
        cause: "Membrane clogged",
        fix: "Membrane replaced by technician",
        cost: { amount: 2400, currency: "INR" },
        confirmedBy: "phone",
        byWhom: "technician",
        localDate: "2026-03-16",
        supportingEventIds: ["evt_seed-blr-ro-beep"],
        createdAt: localDateToUtc("2026-03-16", spec.timeZone),
      });
      await ctx.repositories.resolutions.put(resolution);
    }
    const { recomputeHousehold } = await import("../domain/predictions.js");
    await recomputeHousehold(ctx, spec.householdId);
    const summaryEvents = await ctx.repositories.events.list(spec.householdId);
    const latestChange = summaryEvents.filter((event) => event.type === "changed" || event.type === "serviced").sort((a, b) => b.localDate.localeCompare(a.localDate))[0]?.localDate ?? null;
    summaries.push({ householdId: spec.householdId, anchor, items: items.length, events: eventSpecs.length, lastChange: latestChange });
  }
  return { households: summaries };
}
