import { DataInventory } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { linkPk, outboxMessagePrefix } from "../data/keys.js";
import { loadHouseholdSnapshot } from "../domain/snapshot.js";
import { consentHistory } from "./consent.js";
import { expireOutbox, retentionPolicyFor } from "./retention.js";
import { maskEmail, maskPhone } from "./redact.js";

function maskContact(phone?: string, email?: string): string | undefined {
  if (phone) return maskPhone(phone);
  if (email) return maskEmail(email);
  return undefined;
}

export async function buildInventory(ctx: AppContext, householdId: string, onlyItemId?: string) {
  await expireOutbox(ctx, householdId);
  const snapshot = await loadHouseholdSnapshot(householdId, ctx);
  const profile = snapshot.profile;
  const items = snapshot.items.filter((item) => item.active && (!onlyItemId || item.itemId === onlyItemId));
  const events = [...snapshot.eventsByItem.values()].flat().filter((event) => !onlyItemId || event.itemId === onlyItemId);
  const resolutions = snapshot.resolutions.filter((resolution) => !onlyItemId || resolution.itemId === onlyItemId);
  const diagnoses = snapshot.diagnoses.filter((diagnosis) => !onlyItemId || diagnosis.itemId === onlyItemId);
  const predictions = snapshot.predictions.filter((prediction) => !onlyItemId || prediction.itemId === onlyItemId);
  const [consent, outbox, links, schedules] = await Promise.all([
    consentHistory(ctx, householdId),
    ctx.storage.query("OUTBOX", { skPrefix: outboxMessagePrefix() }),
    ctx.storage.query(linkPk()),
    ctx.scheduler.list(householdId),
  ]);
  const sharedWith: Array<{ service: string; purpose: string; dataSent: string }> = [];
  const active = Object.values(ctx.drivers).filter((driver) => driver.resolved === "aws");
  if (!active.length) sharedWith.push({ service: "This computer", purpose: "Local home memory", dataSent: "Nothing leaves this computer." });
  for (const driver of active) {
    if (driver.service === "storage") sharedWith.push({ service: "AWS DynamoDB", purpose: "Storing your home history", dataSent: "Everything listed here" });
    if (driver.service === "llm") sharedWith.push({ service: "AWS Bedrock", purpose: "Explaining problems and translating", dataSent: "Item type, symptom and history facts; no name, phone, email or address" });
    if (driver.service === "notifier") sharedWith.push({ service: "AWS SNS", purpose: "Sending messages", dataSent: "Your consented phone/email and message text" });
    if (driver.service === "scheduler") sharedWith.push({ service: "AWS EventBridge Scheduler", purpose: "Reminder timing", dataSent: "A job id and timing" });
  }
  const itemRows = items.map((item) => {
    const history = events.filter((event) => event.itemId === item.itemId).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const due = predictions.filter((prediction) => prediction.itemId === item.itemId).map((prediction) => prediction.nextDueLocal).filter((date): date is string => Boolean(date)).sort()[0] ?? null;
    return { itemId: item.itemId, name: item.name, eventCount: history.length, firstLocal: history[0]?.localDate ?? null, lastLocal: history.at(-1)?.localDate ?? null, hasWarranty: Boolean(item.warrantyUntil), nextDueLocal: due };
  });
  const counts = {
    items: items.length,
    events: events.length,
    resolutions: resolutions.length,
    reminders: schedules.length,
    outbox: outbox.filter((row) => row.data.householdId === householdId).length,
    diagnoses: diagnoses.length,
    links: links.filter((row) => row.data.householdId === householdId).length,
    consentRecords: consent.length,
  };
  return DataInventory.parse({
    householdId,
    profile: { ...(profile?.country ? { country: profile.country } : {}), ...(profile?.region ? { region: profile.region } : {}), timeZone: profile?.timeZone ?? "UTC", language: profile?.language ?? "en", ...(maskContact(profile?.contact?.phone, profile?.contact?.email) ? { contactMasked: maskContact(profile?.contact?.phone, profile?.contact?.email) } : {}) },
    items: itemRows,
    counts,
    consent,
    sharedWith,
    retention: retentionPolicyFor(ctx),
    generatedAt: ctx.clock.now().toISOString(),
  });
}

