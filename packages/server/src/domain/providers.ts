import type { Item, Provider } from "@ellie/schema";
import type { AppContext } from "../context.js";
import type { HouseholdRecord } from "../data/householdRepo.js";

export interface ProviderSelection {
  item: Item;
  provider?: Provider | Item["customProvider"];
  followUp?: { scope: string; field: string; question: string; defaultValue: string; retry: { tool: string; argName: string; args: Record<string, unknown> } };
}

function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9+]/g, ""); }

export async function selectProvider(ctx: AppContext, input: {
  household: HouseholdRecord;
  item: Item;
  supplied?: string;
  tool: "send_to_phone" | "log_event";
  retryArgs: Record<string, unknown>;
}): Promise<ProviderSelection> {
  const pack = ctx.regions.get(input.household.regionPackId ?? "DEFAULT");
  const item = input.item;
  const providers = Object.entries(pack.providers).filter(([, provider]) => provider.appliesTo.includes(item.catalogKey));
  const askedKey = `${item.itemId}:provider`;
  const alreadyAsked = input.household.askedFields.includes(askedKey);
  if (item.customProvider) return { item, provider: item.customProvider };
  if (input.supplied) {
    const number = input.supplied.replace(/[()\s-]/g, "");
    if (/^\+?[0-9]{7,15}$/.test(number)) {
      const custom = { name: "My supplier", channel: "phone_call" as const, to: number.startsWith("+") ? number : `+${number}` };
      const saved = await ctx.repositories.items.put({ ...item, providerKey: undefined, customProvider: custom });
      return { item: saved, provider: custom };
    }
    const normalized = normalize(input.supplied);
    const selected = providers.find(([key, provider]) => [key, provider.name, key.replaceAll("_", " "), ...provider.aliases].some((value) => normalize(value).includes(normalized) || normalized.includes(normalize(value))));
    if (selected) {
      const saved = await ctx.repositories.items.put({ ...item, providerKey: selected[0], customProvider: undefined });
      return { item: saved, provider: selected[1] };
    }
    if (/not sure|dont know|don't know|no idea/i.test(input.supplied)) {
      const defaultKey = pack.catalog[item.catalogKey]?.defaultProviderKey;
      const selectedDefault = (defaultKey && pack.providers[defaultKey]) ? [defaultKey, pack.providers[defaultKey]] as const : providers[0];
      if (selectedDefault) return { item: await ctx.repositories.items.put({ ...item, providerKey: selectedDefault[0] }), provider: selectedDefault[1] };
    }
  }
  const currentProvider = item.providerKey ? pack.providers[item.providerKey] : undefined;
  if (currentProvider) return { item, provider: currentProvider };
  if (providers.length <= 1) {
    const defaultKey = pack.catalog[item.catalogKey]?.defaultProviderKey ?? providers[0]?.[0];
    const provider = defaultKey ? pack.providers[defaultKey] : undefined;
    const saved = provider && !item.providerKey ? await ctx.repositories.items.put({ ...item, providerKey: defaultKey }) : item;
    return { item: saved, provider };
  }
  if (alreadyAsked) {
    const defaultKey = pack.catalog[item.catalogKey]?.defaultProviderKey ?? providers[0]?.[0];
    const provider = defaultKey ? pack.providers[defaultKey] : undefined;
    return { item: provider ? await ctx.repositories.items.put({ ...item, providerKey: defaultKey }) : item, provider };
  }
  const nextHousehold = { ...input.household, askedFields: [...input.household.askedFields, askedKey] };
  await ctx.repositories.households.put(nextHousehold);
  const names = providers.map(([, provider]) => provider.name);
  const choices = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0] ?? "your supplier";
  const question = `Which ${pack.vocabulary.gas_supplier ?? "supplier"} do you use — ${choices}?`;
  const defaultKey = pack.catalog[item.catalogKey]?.defaultProviderKey ?? providers[0]![0];
  return { item, followUp: { scope: item.itemId, field: "provider", question, defaultValue: pack.providers[defaultKey]?.name ?? providers[0]![1].name, retry: { tool: input.tool, argName: "provider", args: input.retryArgs } } };
}
