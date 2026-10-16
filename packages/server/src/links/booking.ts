import type { Item, PhoneAction, Provider, ResolvedRegionPack } from "@ellie/schema";
import type { HouseholdRecord } from "../data/householdRepo.js";
import { buildProviderLink } from "../domain/providerLinks.js";

export interface BookingActionResult { action: PhoneAction; channelName: string; registeredPhoneNote?: string }
type BookingProvider = Pick<Provider, "channel"> & { name?: string; to?: string; url?: string; urlTemplate?: string; messageTemplate?: string; requiresRegisteredPhone?: boolean };
export function buildBookingAction(household: HouseholdRecord, item: Item, provider: BookingProvider | undefined, pack: ResolvedRegionPack): BookingActionResult {
  const supplier = provider?.name ?? pack.vocabulary.gas_supplier ?? "service provider";
  const url = buildProviderLink(provider, { displayName: item.name, brand: item.brand, model: item.model });
  const channelName = provider?.channel === "whatsapp" ? "WhatsApp" : provider?.channel === "sms" ? "SMS" : provider?.channel === "web" || provider?.channel === "shopping_link" || provider?.channel === "app" ? "online" : "phone";
  if (!url) return { action: { id: "call", label: `Call your ${supplier}`, method: "post" }, channelName };
  const label = provider?.channel === "whatsapp" ? "Book on WhatsApp" : provider?.channel === "sms" ? "Book by SMS" : provider?.channel === "phone_call" || provider?.channel === "ivrs" ? "Call to book" : "Order online";
  return {
    action: { id: provider?.channel === "phone_call" || provider?.channel === "ivrs" ? "call" : "book", label, url, method: "link" },
    channelName,
    ...(provider?.requiresRegisteredPhone ? { registeredPhoneNote: `Send this from the phone number registered with ${provider.name}.` } : {}),
  };
}
