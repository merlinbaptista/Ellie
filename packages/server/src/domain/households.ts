import { Household, missingHouseholdFields, type SetupHouseholdInput } from "@ellie/schema";
import type { AppContext } from "../context.js";
import type { HouseholdRecord } from "../data/householdRepo.js";
import { ValidationError } from "../lib/errors.js";
import { recomputeHousehold } from "./predictions.js";

export interface HouseholdSetupResult {
  household: HouseholdRecord;
  missing: string[];
  speech: string;
  followUp?: { field: string; question: string; defaultValue?: string };
}

export function resolveHouseholdId(input: string | undefined, ctx: AppContext): string {
  return input ?? ctx.env.DEFAULT_HOUSEHOLD_ID;
}

export async function getOrCreateHousehold(id: string, ctx: AppContext): Promise<HouseholdRecord> {
  const existing = await ctx.repositories.households.get(id);
  if (existing) return existing;
  const now = ctx.clock.now().toISOString();
  const draft: HouseholdRecord = {
    schemaVersion: 1,
    householdId: id,
    regionPackId: "DEFAULT",
    regionPackVersion: ctx.regions.get("DEFAULT").version,
    askedFields: [],
    createdAt: now,
    updatedAt: now,
  };
  return ctx.repositories.households.put(draft);
}

function inferCountry(input: SetupHouseholdInput, current: HouseholdRecord): string | undefined {
  if (input.country) return input.country.toUpperCase();
  if (current.country) return current.country;
  const language = input.language ?? current.language;
  const languageCountry = language?.split("-")[1];
  if (languageCountry) return languageCountry === "GB" ? "GB" : languageCountry;
  const zone = input.timeZone ?? current.timeZone;
  if (zone === "Asia/Kolkata") return "IN";
  if (zone === "Europe/London") return "GB";
  if (zone?.startsWith("America/")) return "US";
  return undefined;
}

function missingOptions(household: HouseholdRecord, pack: ReturnType<AppContext["regions"]["get"]>): string[] {
  const missing = missingHouseholdFields(household as never);
  if (!household.region) missing.push("region");
  if (!household.contact?.phone) missing.push("phone");
  if (pack.locale.supportedLanguages.length > 1 && !household.phoneLanguage) missing.push("phoneLanguage");
  return missing;
}

export async function setupHousehold(input: SetupHouseholdInput, ctx: AppContext): Promise<HouseholdSetupResult> {
  const id = resolveHouseholdId(input.householdId, ctx);
  const old = await getOrCreateHousehold(id, ctx);
  const inferredCountry = inferCountry(input, old);
  if (inferredCountry && !input.confirm && !input.country && !old.country) {
    const pack = ctx.regions.forCountry(inferredCountry);
    return {
      household: old,
      missing: ["confirm", "region", "phone"],
      speech: `I'll use settings for ${pack.name}.`,
      followUp: { field: "confirm", question: "Is that right?" },
    };
  }
  if (input.confirm === false) {
    return { household: old, missing: ["country"], speech: "Which country should I use?", followUp: { field: "country", question: "What country are you in?" } };
  }

  const country = inferredCountry ?? old.country;
  const pack = country ? ctx.regions.forCountry(country) : ctx.regions.get(old.regionPackId ?? "DEFAULT");
  const next: HouseholdRecord = {
    ...old,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(country ? { country } : {}),
    ...(input.region !== undefined ? { region: input.region } : {}),
    timeZone: input.timeZone ?? old.timeZone ?? pack.locale.defaultTimeZone,
    language: input.language ?? old.language ?? pack.locale.defaultLanguage,
    phoneLanguage: input.phoneLanguage ?? old.phoneLanguage,
    units: old.country && old.country !== country ? pack.units : old.units ?? pack.units,
    regionPackId: pack.packId,
    regionPackVersion: pack.version,
  };
  if (input.region && /\d+[,\s]+\w+\s+(street|st|road|rd|lane|ln|avenue|ave|cross|main)\b/i.test(input.region)) {
    throw new ValidationError("Full address rejected", "I only need your city or postcode, not the full address.");
  }
  if (input.phone && input.consent !== true) {
    const masked = `•••••• ${input.phone.slice(-4)}`;
    return {
      household: await ctx.repositories.households.put(next),
      missing: missingOptions(next, pack),
      speech: `Can I send fixes and reminders to ${masked}?`,
      followUp: { field: "consent", question: "Say yes to allow it." },
    };
  }
  if (input.phone && input.consent === true) {
    const candidate = { phone: input.phone, consentGivenAt: ctx.clock.now().toISOString(), consentSource: "voice" as const };
    const parsed = Household.shape.contact!.safeParse(candidate);
    if (!parsed.success) throw new ValidationError("Invalid contact details", "That phone number doesn't look right. Could you say it again?");
    next.contact = parsed.data;
  }
  if (input.email && input.consent === true) {
    next.contact = { email: input.email, consentGivenAt: ctx.clock.now().toISOString(), consentSource: "voice" };
  }

  const asked = new Set(next.askedFields);
  if (!next.country) {
    next.askedFields = [...asked, "household:country"];
    return { household: await ctx.repositories.households.put(next), missing: ["country", ...missingOptions(next, pack)], speech: "Which country are you in?", followUp: { field: "country", question: "What country should I use?" } };
  }
  if (!next.region && !asked.has("household:region")) {
    next.askedFields = [...asked, "household:region"];
    return { household: await ctx.repositories.households.put(next), missing: missingOptions(next, pack), speech: "Which city are you in?", followUp: { field: "region", question: "Which city are you in?" } };
  }
  if (!next.contact?.phone && !next.contact?.email && !asked.has("household:phone")) {
    next.askedFields = [...asked, "household:phone"];
    return { household: await ctx.repositories.households.put(next), missing: missingOptions(next, pack), speech: "Where should I send fixes and reminders?", followUp: { field: "phone", question: "Which phone number should I use?" } };
  }
  if (pack.locale.supportedLanguages.length > 1 && !next.phoneLanguage && !asked.has("household:phoneLanguage")) {
    next.askedFields = [...asked, "household:phoneLanguage"];
    const languageNames = pack.locale.supportedLanguages.map((tag) => new Intl.DisplayNames([pack.locale.defaultLanguage], { type: "language" }).of(tag) ?? tag);
    return { household: await ctx.repositories.households.put(next), missing: missingOptions(next, pack), speech: "Which language would you like for the phone guide?", followUp: { field: "phoneLanguage", question: `Would you like ${languageNames.slice(0, 2).join(" or ")}?` } };
  }
  const validated = Household.safeParse(next);
  if (!validated.success) throw new ValidationError(validated.error.message);
  const saved = await ctx.repositories.households.put(validated.data);
  const switched = old.country && old.country !== country;
  if (switched) await recomputeHousehold(ctx, id);
  return {
    household: saved,
    missing: missingOptions(saved, pack),
    speech: switched ? `Switched to settings for ${pack.name}.` : `All set for ${saved.region ?? pack.name}. I'll use ${pack.units.volume === "L" ? "litres" : "gallons"}, ${pack.units.temp === "C" ? "Celsius" : "°F"} and ${pack.units.currency === "INR" ? "rupees" : pack.units.currency}.`,
  };
}
