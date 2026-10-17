import { PhoneView, diffDays, formatLocalDate, toLocalDate, type PhoneLinkPayload, type PhoneView as PhoneViewType } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { buildBookingAction } from "../links/booking.js";
import { recomputeItem } from "../domain/predictions.js";
import { loadHouseholdSnapshot } from "../domain/snapshot.js";
import { NotFoundError } from "../lib/errors.js";
import { buildInventory } from "../privacy/inventory.js";

export async function buildPhoneView(ctx: AppContext, payload: PhoneLinkPayload): Promise<PhoneViewType> {
  const snapshot = await loadHouseholdSnapshot(payload.hh, ctx);
  const household = snapshot.profile;
  if (!household) throw new NotFoundError("Household not found");
  const pack = ctx.regions.get(household.regionPackId ?? "DEFAULT");
  const now = ctx.clock.now();
  const todayLocal = toLocalDate(now.toISOString(), household.timeZone ?? pack.locale.defaultTimeZone);
  const expiresAt = new Date(payload.exp * 1000).toISOString();
  const language = household.phoneLanguage ?? household.language ?? pack.locale.defaultLanguage;
  if (payload.kind === "privacy") {
    const inventory = await buildInventory(ctx, payload.hh);
    const sections = [
      { heading: "What I remember", list: inventory.items.length ? inventory.items.map((entry) => `${entry.name}: ${entry.eventCount} events${entry.lastLocal ? `; last ${entry.lastLocal}` : ""}${entry.nextDueLocal ? `; next due ${entry.nextDueLocal}` : ""}`) : ["No home data is stored."] },
      { heading: "Who it's shared with", list: inventory.sharedWith.map((entry) => `${entry.service}: ${entry.purpose}; ${entry.dataSent}`) },
      { heading: "How long I keep things", list: inventory.retention.map((entry) => `${entry.data}: ${entry.keptFor}`) },
      { heading: "Messages", list: [...inventory.consent.map((record) => `${record.purpose}: ${record.action} on ${record.at.slice(0, 10)}${record.channelMasked ? ` (${record.channelMasked})` : ""}`), "Backups kept by AWS expire on their own schedule."] },
    ];
    return PhoneView.parse({ kind: "privacy", title: "Your privacy and home data", language, sections, actions: [], expiresAt, generatedAt: now.toISOString() });
  }
  const diagnosis = payload.ref ? await ctx.repositories.diagnoses.get(payload.hh, payload.ref) : null;
  const itemId = payload.kind === "fix" ? diagnosis?.itemId : payload.ref;
  const item = itemId ? snapshot.items.find((candidate) => candidate.itemId === itemId) : undefined;
  if (payload.kind === "fix" && !diagnosis) throw new NotFoundError("Diagnosis not found");
  if (payload.kind === "booking" && !item) throw new NotFoundError("Item not found");
  const actions: PhoneViewType["actions"] = [];
  const sections: Array<{ heading: string; body?: string; list?: string[]; ordered?: boolean; tone?: "normal" | "warning" | "safety" }> = [];
  let title = "Your home summary";
  let subtitle: string | undefined;

  if (payload.kind === "fix" && diagnosis) {
    title = `Steps for ${item?.name ?? "your item"}`;
    subtitle = diagnosis.explanation?.text;
    if (diagnosis.status === "safety_stop") {
      const safetyCategory = diagnosis.safetyCategory ?? pack.catalog[item?.catalogKey ?? ""]?.symptoms.find((symptom) => symptom.key === diagnosis.symptomKey)?.safety;
      const emergencyNumber = diagnosis.safetyEmergencyNumber ?? (safetyCategory && pack.safety.numbers[safetyCategory]) ?? pack.safety.generalEmergency;
      sections.push({ heading: "Safety", body: diagnosis.explanation?.text ?? "Move away and contact emergency services.", tone: "safety" });
      actions.push({ id: "call", label: "Call emergency services", url: `tel:${emergencyNumber}`, method: "link" });
    } else if (diagnosis.status === "needs_pro") {
      sections.push({ heading: "Call a professional", body: "This still needs professional attention. Do not continue the repair steps.", tone: "warning" });
      const provider = item?.customProvider ?? (item?.providerKey ? pack.providers[item.providerKey] : undefined);
      const booking = buildBookingAction(household, item!, provider, pack);
      actions.push(booking.action);
    } else {
      const top = diagnosis.candidates[0];
      if (top) {
        const evidence = (diagnosis.explanation?.citedEvidenceIds ?? []).map((id) => diagnosis.evidence.find((entry) => entry.evidenceId === id)?.text).filter((text): text is string => Boolean(text));
        sections.push({ heading: "What's likely wrong", body: [top.description, ...evidence].join(". ") });
      }
      const plan = diagnosis.fixPlan;
      if (plan?.steps.length) sections.push({ heading: "Steps", list: plan.steps, ordered: true });
      if (plan?.safetyNote) sections.push({ heading: "Safety", body: plan.safetyNote, tone: "warning" });
      if (plan?.partsNeeded.length) sections.push({ heading: "You'll need", list: plan.partsNeeded });
      if (plan?.callProIf.length) sections.push({ heading: "Call a professional if", list: plan.callProIf, tone: "warning" });
      if (plan?.manualUrl) actions.push({ id: "open_manual", label: "Open manual", url: plan.manualUrl, method: "link" });
      actions.push({ id: "fixed", label: "Fixed it", method: "post" }, { id: "not_fixed", label: "Still not fixed", method: "post" }, { id: "chat", label: "Ask a question", method: "post" });
      const provider = item?.customProvider ?? (item?.providerKey ? pack.providers[item.providerKey] : undefined);
      if (item && provider) {
        const action = buildBookingAction(household, item, provider, pack).action;
        if (action.url) actions.push(action);
      }
    }
  } else if (payload.kind === "booking" && item) {
    title = `Book ${item.name}`;
    const predictions = await recomputeItem(ctx, payload.hh, item.itemId, { schedule: false });
    const prediction = predictions.mostUrgent;
    const leadTime = pack.catalog[item.catalogKey]?.recurring?.leadTimeDays;
    sections.push({ heading: "When", body: prediction?.nextDueLocal ? `Next due ${formatLocalDate(prediction.nextDueLocal, pack, "speech")}${prediction.bookingOpensLocal ? `. Booking opens ${formatLocalDate(prediction.bookingOpensLocal, pack, "speech")}` : ""}${leadTime ? `. Allow ${leadTime} days for delivery` : ""}.` : "No next due date is available yet." });
    const provider = item.customProvider ?? (item.providerKey ? pack.providers[item.providerKey] : undefined);
    if (provider) {
      const booking = buildBookingAction(household, item, provider, pack);
      sections.push({ heading: "How", body: [booking.action.url ? booking.channelName : booking.action.label, booking.registeredPhoneNote].filter(Boolean).join(". ") });
      if (booking.action.url) actions.push(booking.action);
    } else sections.push({ heading: "How", body: `Call your ${pack.vocabulary.gas_supplier ?? "service provider"}.` });
    actions.push({ id: "booked", label: "I've booked it", method: "post" });
  } else {
    title = "This week at home";
    const groups = new Map<string, string[]>([["Overdue", []], ["Due", []], ["Due soon", []], ["Warranty", []]]);
    for (const current of snapshot.items.filter((candidate) => candidate.active)) {
      const predictions = await recomputeItem(ctx, payload.hh, current.itemId, { schedule: false, windowDays: 14 });
      let hasDue = false;
      for (const prediction of [predictions.main, ...predictions.components]) {
        if (!prediction || !["overdue", "due", "due_soon"].includes(prediction.status)) continue;
        hasDue = true;
        const displayName = prediction.component ? pack.catalog[current.catalogKey]?.components.find((part) => part.key === prediction.component)?.displayName ?? current.name : current.name;
        const heading = prediction.status === "overdue" ? "Overdue" : prediction.status === "due" ? "Due" : "Due soon";
        groups.get(heading)!.push(`${displayName}${prediction.nextDueLocal ? ` (${formatLocalDate(prediction.nextDueLocal, pack, "speech")})` : ""}`);
      }
      if (current.warrantyUntil) {
        const days = diffDays(todayLocal, current.warrantyUntil);
        if (days >= 0 && days <= 30) groups.get("Warranty")!.push(`${current.name} until ${formatLocalDate(current.warrantyUntil, pack, "speech")}`);
      }
      const provider = current.customProvider ?? (current.providerKey ? pack.providers[current.providerKey] : undefined);
      if (hasDue && provider) {
        const action = buildBookingAction(household, current, provider, pack).action;
        if (action.url) actions.push(action);
      }
    }
    let dueCount = 0;
    for (const [heading, list] of groups) {
      if (!list.length || dueCount >= 14) continue;
      const visible = list.slice(0, 14 - dueCount);
      dueCount += visible.length;
      sections.push({ heading, list: visible });
    }
    if (!dueCount) sections.push({ heading: "All caught up", body: "Nothing is due soon." });
    const recent = snapshot.eventsByItem;
    const events = [...recent.values()].flat().sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 5);
    if (events.length) sections.push({ heading: "Recent history", list: events.map((event) => `${event.localDate}: ${event.type}`) });
  }
  const citationTexts = payload.kind === "fix" && diagnosis ? {
    ...Object.fromEntries(diagnosis.evidence.map((entry) => [entry.evidenceId, entry.text])),
    ...(diagnosis.fixPlan ? Object.fromEntries(diagnosis.fixPlan.steps.map((step, index) => [`step_${index + 1}`, step])) : {}),
    ...(diagnosis.fixPlan?.partsNeeded.length ? { fix_parts: diagnosis.fixPlan.partsNeeded.join(", "), ...Object.fromEntries(diagnosis.fixPlan.partsNeeded.map((part, index) => [`part_${index + 1}`, part])) } : {}),
    ...(diagnosis.fixPlan?.timeMinutes ? { fix_time: `This fix takes about ${diagnosis.fixPlan.timeMinutes} minutes` } : {}),
    ...(diagnosis.fixPlan ? Object.fromEntries(diagnosis.fixPlan.callProIf.map((text, index) => [`call_pro_${index + 1}`, text])) : {}),
  } : undefined;
  return PhoneView.parse({ kind: payload.kind, title, ...(subtitle ? { subtitle } : {}), language, sections, actions, ...(payload.kind === "fix" && diagnosis ? { evidence: diagnosis.evidence, citationTexts } : {}), expiresAt, generatedAt: now.toISOString() });
}
