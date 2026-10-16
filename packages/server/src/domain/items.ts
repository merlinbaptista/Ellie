import { Item, newId, parseRelativeDate, toLocalDate, type Item as ItemType, type LogEventInput } from "@ellie/schema";
import { matchCatalog } from "@ellie/schema";
import type { AppContext } from "../context.js";
import type { HouseholdRecord } from "../data/householdRepo.js";
import { normalizePhrase } from "../data/keys.js";
import { EllieError, ValidationError } from "../lib/errors.js";

export class AmbiguousItemError extends EllieError {
  constructor(public readonly choices: string[]) {
    super("Ambiguous household item", "AMBIGUOUS_ITEM", `Which one — ${choices.join(" or ")}?`);
  }
}
export interface ResolveItemResult { item: ItemType; created: boolean; custom: boolean }
function similarity(phrase: string, candidate: string): number {
  const left = normalizePhrase(phrase);
  const right = normalizePhrase(candidate);
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;
  return 0;
}

export async function resolveItem(household: HouseholdRecord, spoken: string, input: Partial<LogEventInput>, ctx: AppContext): Promise<ResolveItemResult> {
  const trimmed = spoken.trim();
  const knownItems = await ctx.repositories.items.list(household.householdId);
  const direct = knownItems.find((candidate) => candidate.itemId === trimmed || candidate.catalogKey === trimmed);
  if (direct) return { item: await ctx.repositories.items.put(await applyItemDetails(direct, input, household, ctx)), created: false, custom: false };

  const alias = await ctx.repositories.aliases.get(household.householdId, trimmed);
  if (alias) {
    const found = knownItems.find((candidate) => candidate.itemId === alias.itemId);
    if (found) {
      const sameCatalog = knownItems.filter((candidate) => candidate.catalogKey === found.catalogKey);
      const catalogAliases = packAliases(household.regionPackId ?? "DEFAULT", found.catalogKey, ctx);
      if (sameCatalog.length > 1 && catalogAliases.includes(normalizePhrase(trimmed))) {
        throw new AmbiguousItemError(sameCatalog.map((candidate) => candidate.name));
      }
      return { item: await ctx.repositories.items.put(await applyItemDetails(found, input, household, ctx)), created: false, custom: false };
    }
  }

  const existingMatches = knownItems.map((candidate) => ({ item: candidate, score: Math.max(similarity(trimmed, candidate.name), similarity(trimmed, candidate.catalogKey)) }))
    .filter((candidate) => candidate.score >= 0.8).sort((a, b) => b.score - a.score);
  if (existingMatches.length > 1 && existingMatches[0]!.score === existingMatches[1]!.score) {
    throw new AmbiguousItemError(existingMatches.slice(0, 2).map(({ item }) => item.name));
  }
  const requestedDistinctItem = Boolean(
    input.itemName && existingMatches[0] && normalizePhrase(input.itemName) !== normalizePhrase(existingMatches[0].item.name),
  );
  if (existingMatches[0] && !requestedDistinctItem) {
    const item = await ctx.repositories.items.put(await applyItemDetails(existingMatches[0].item, input, household, ctx));
    await learnAlias(household.householdId, trimmed, item, ctx);
    return { item, created: false, custom: false };
  }

  const pack = ctx.regions.get(household.regionPackId || "DEFAULT");
  const catalogMatches = matchCatalog(trimmed, pack);
  const first = catalogMatches[0];
  if (first && catalogMatches[1] && first.catalogKey !== catalogMatches[1].catalogKey && first.score - catalogMatches[1].score <= 0.1) {
    throw new AmbiguousItemError([first.displayName, catalogMatches[1].displayName]);
  }
  const now = ctx.clock.now().toISOString();
  const todayLocal = toLocalDate(now, household.timeZone ?? pack.locale.defaultTimeZone);
  let item: ItemType;
  let custom = false;
  if (first) {
    const entry = pack.catalog[first.catalogKey]!;
    item = Item.parse({
      schemaVersion: 1,
      itemId: newId("itm"),
      householdId: household.householdId,
      catalogKey: first.catalogKey,
      kind: entry.kind,
      name: input.itemName ?? entry.displayName,
      ...(entry.defaultProviderKey ? { providerKey: entry.defaultProviderKey } : {}),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    custom = true;
    item = Item.parse({
      schemaVersion: 1,
      itemId: newId("itm"),
      householdId: household.householdId,
      catalogKey: "custom",
      kind: "custom",
      name: (input.itemName ?? trimmed).slice(0, 60),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  item = await applyItemDetails(item, { ...input, purchaseDate: input.purchaseDate ?? undefined }, household, ctx, todayLocal);
  item = await ctx.repositories.items.put(item);
  await learnAlias(household.householdId, trimmed, item, ctx);
  return { item, created: true, custom };
}

function packAliases(packId: string, catalogKey: string, ctx: AppContext): string[] {
  return ctx.regions.get(packId).catalog[catalogKey]?.aliases.map(normalizePhrase) ?? [];
}

async function learnAlias(householdId: string, phrase: string, item: ItemType, ctx: AppContext): Promise<void> {
  if (normalizePhrase(phrase) !== normalizePhrase(item.catalogKey)) {
    await ctx.repositories.aliases.put(householdId, phrase, item.itemId, ctx.clock.now().toISOString());
  }
}

async function applyItemDetails(item: ItemType, input: Partial<LogEventInput>, household: HouseholdRecord, ctx: AppContext, todayLocal?: string): Promise<ItemType> {
  const pack = ctx.regions.get(household.regionPackId || "DEFAULT");
  const today = todayLocal ?? toLocalDate(ctx.clock.now().toISOString(), household.timeZone ?? pack.locale.defaultTimeZone);
  const purchaseDate = input.purchaseDate ? parseRelativeDate(input.purchaseDate, today, { dateOrder: pack.locale.dateOrder })?.localDate : item.purchaseDate;
  const warrantyUntil = input.warrantyUntil ? parseRelativeDate(input.warrantyUntil, today, { dateOrder: pack.locale.dateOrder, allowFuture: true })?.localDate : item.warrantyUntil;
  const updated = {
    ...item,
    ...(input.itemName ? { name: input.itemName.slice(0, 60) } : {}),
    ...(input.brand ? { brand: input.brand } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(purchaseDate ? { purchaseDate } : {}),
    ...(warrantyUntil ? { warrantyUntil } : {}),
    updatedAt: ctx.clock.now().toISOString(),
  };
  const parsed = Item.safeParse(updated);
  if (!parsed.success) throw new ValidationError(parsed.error.message, "That warranty date is before the purchase date. Could you check the dates?");
  return parsed.data;
}
