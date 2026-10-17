import { PrivacyExport, type PrivacyExport as PrivacyExportType } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { loadHouseholdSnapshot } from "../domain/snapshot.js";
import { buildInventory } from "./inventory.js";
import { maskEmail, maskPhone } from "./redact.js";

export async function buildPrivacyExport(ctx: AppContext, householdId: string): Promise<PrivacyExportType> {
  const [snapshot, inventory] = await Promise.all([
    loadHouseholdSnapshot(householdId, ctx),
    buildInventory(ctx, householdId),
  ]);
  const profile = snapshot.profile;
  const contact = profile?.contact;
  return PrivacyExport.parse({
    profile: {
      ...(profile?.displayName ? { displayName: profile.displayName } : {}),
      ...(profile?.country ? { country: profile.country } : {}),
      ...(profile?.region ? { region: profile.region } : {}),
      timeZone: profile?.timeZone ?? "UTC",
      language: profile?.language ?? "en",
      ...(contact?.phone ? { contactMasked: maskPhone(contact.phone) } : {}),
      ...(contact?.email ? { emailMasked: maskEmail(contact.email) } : {}),
    },
    items: snapshot.items,
    events: [...snapshot.eventsByItem.values()].flat(),
    predictions: snapshot.predictions,
    resolutions: snapshot.resolutions,
    consent: inventory.consent,
    inventory,
  });
}