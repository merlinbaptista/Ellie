import { newId, type SendToPhoneInput } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { getOrCreateHousehold, resolveHouseholdId } from "./households.js";
import { resolveItem } from "./items.js";
import { signPhoneLink } from "../links/sign.js";
import { createShortLink } from "../links/shortLinks.js";
import { buildPhoneView } from "../phone/views.js";
import { buildEmailMessage, buildSmsMessage } from "../phone/messages.js";
import { logEvent } from "./events.js";
import { selectProvider } from "./providers.js";
import { linkPk, phoneSendPrefix, phoneSendSk } from "../data/keys.js";
import { recomputeItem } from "./predictions.js";
import { formatSmsDate } from "../phone/messages.js";

const duplicateWindowSeconds = 120;
export interface SendToPhoneOutcome {
  speech: string;
  followUp?: { field: string; question: string; defaultValue?: string; retry: { tool: string; argName: string; args: Record<string, unknown> } };
  data?: { messageId: string; status: string; shortUrl: string; expiresAt: string; provider?: string };
  card?: { channel: string; to: string; expiresAt: string; url: string };
}
function maskedContact(value: string): string { return value.includes("@") ? value.replace(/^(.{1}).*(@.*)$/, "$1***$2") : `ending ${value.slice(-4)}`; }

export async function sendToPhone(ctx: AppContext, input: SendToPhoneInput): Promise<SendToPhoneOutcome> {
  const householdId = resolveHouseholdId(input.householdId, ctx);
  const household = await getOrCreateHousehold(householdId, ctx);
  const items = await ctx.repositories.items.list(householdId);
  const pack = ctx.regions.get(household.regionPackId ?? "DEFAULT");
  const channel = input.channel ?? (household.contact?.phone ? "sms" : household.contact?.email ? "email" : "sms");
  const recipient = channel === "sms" ? household.contact?.phone : household.contact?.email;
  if (!recipient || !household.contact?.consentGivenAt) {
    const field = channel === "sms" ? "phone" : "email";
    return {
      speech: channel === "sms" ? "Where should I send it?" : "Which email should I send it to?",
      followUp: { field, question: channel === "sms" ? "Which phone number should I use?" : "Which email address should I use?", retry: { tool: "setup_household", argName: field, args: { householdId } } },
    };
  }

  let item = input.item ? items.find((candidate) => candidate.itemId === input.item || candidate.name.toLowerCase() === input.item!.toLowerCase() || candidate.catalogKey === input.item) : undefined;
  let itemCreated = false;
  if (!item && input.item && input.contentType !== "summary") {
    const resolved = await resolveItem(household, input.item, {}, ctx);
    item = resolved.item;
    itemCreated = resolved.created;
  }
  if ((input.contentType === "fix" || input.contentType === "booking") && !item) {
    return { speech: "Which item should I send?", followUp: { field: "item", question: "Which item do you mean?", retry: { tool: "send_to_phone", argName: "item", args: { householdId, contentType: input.contentType } } } };
  }

  let diagnosis = input.diagnosisId ? await ctx.repositories.diagnoses.get(householdId, input.diagnosisId) : null;
  if (input.contentType === "fix" && !diagnosis && item) {
    const cutoff = ctx.clock.now().getTime() - 24 * 60 * 60 * 1000;
    diagnosis = (await ctx.repositories.diagnoses.list(householdId)).find((record) => record.itemId === item?.itemId && record.status === "diagnosed" && Date.parse(record.createdAt) >= cutoff) ?? null;
  }
  if (input.contentType === "fix" && !diagnosis) {
    const question = `What's the problem with the ${item?.name ?? "item"}?`;
    return { speech: question, followUp: { field: "symptom", question, retry: { tool: "diagnose", argName: "symptom", args: { householdId, item: item?.name ?? input.item } } } };
  }

  let provider = item?.customProvider ?? (item?.providerKey ? pack.providers[item.providerKey] : undefined);
  if (input.contentType === "booking" && item) {
    if (itemCreated && Object.values(pack.providers).filter((candidate) => candidate.appliesTo.includes(item!.catalogKey)).length > 1) {
      item = await ctx.repositories.items.put({ ...item, providerKey: undefined });
    }
    const selection = await selectProvider(ctx, { household, item, supplied: input.provider, tool: "send_to_phone", retryArgs: { householdId, item: input.item, contentType: input.contentType } });
    item = selection.item;
    provider = selection.provider;
    if (selection.followUp) return { speech: selection.followUp.question, followUp: selection.followUp };
  }

  const ref = input.contentType === "fix" ? diagnosis!.diagnosisId : input.contentType === "booking" ? item!.itemId : undefined;
  const dedupeId = `SEND#${householdId}#${input.contentType}#${ref ?? "summary"}`;
  const nowEpoch = Math.floor(Date.now() / 1000);
  const existing = await ctx.storage.query(linkPk(), { skPrefix: `${dedupeId}#` });
  if (existing.some((record) => (record.data.sentAtEpoch as number) >= nowEpoch - duplicateWindowSeconds)) return { speech: "I've just sent that — check your phone." };
  const hourly = await ctx.storage.query(linkPk(), { skPrefix: phoneSendPrefix(householdId) });
  if (hourly.filter((record) => (record.data.sentAtEpoch as number) >= nowEpoch - 3600).length >= ctx.env.PHONE_SEND_LIMIT_PER_HOUR) return { speech: "I've sent a lot of messages this hour. Try again a bit later." };

  const signed = signPhoneLink({ householdId, kind: input.contentType, ...(ref ? { ref } : {}), env: ctx.env });
  const short = await createShortLink(ctx, { token: signed.token, householdId, kind: input.contentType, exp: signed.payload.exp });
  const view = await buildPhoneView(ctx, signed.payload);
  let detail = input.contentType === "fix" ? diagnosis?.candidates[0]?.causeKey.replaceAll("_", " ") : undefined;
  if (input.contentType === "booking" && item) {
    const prediction = await recomputeItem(ctx, householdId, item.itemId, { schedule: false });
    if (prediction.mostUrgent?.nextDueLocal) detail = `due ${formatSmsDate(prediction.mostUrgent.nextDueLocal, pack.locale.defaultLanguage, pack.locale.dateOrder)}`;
  } else if (input.contentType === "summary") {
    const dueSection = view.sections.find((section) => section.heading === "Due or overdue");
    detail = dueSection?.list?.length ? `${dueSection.list.length} things due` : "nothing due soon";
  }
  const body = channel === "sms"
    ? buildSmsMessage(input.contentType, { ...(item ? { item: item.name } : {}), ...(detail ? { detail } : {}), shortUrl: short.url })
    : buildEmailMessage(view, short.url).body;
  const email = channel === "email" ? buildEmailMessage(view, short.url) : undefined;
  const outbound = await ctx.notifier.send({ householdId, channel, to: recipient, ...(email ? { subject: email.subject } : {}), body, link: short.url, kind: input.contentType });
  await ctx.storage.put({ pk: linkPk(), sk: phoneSendSk(dedupeId, nowEpoch, newId("evt")), type: "phone-send", data: { sentAtEpoch: nowEpoch, code: short.code, channel, status: outbound.status }, ttl: nowEpoch + 3600 });
  const noteItem = item ?? items[0];
  if (noteItem) await logEvent({ householdId, item: noteItem.name, type: "note", source: "system", notes: `Sent ${input.contentType} to phone` }, ctx);
  const label = channel === "sms" ? `your phone ${maskedContact(recipient)}` : `your email ${maskedContact(recipient)}`;
  const speech = outbound.status === "failed" ? "I couldn't send that to your phone just now. I've saved it — ask me again in a minute."
    : input.contentType === "booking" ? `Sent the ${provider && "name" in provider ? provider.name : "booking"} link to ${label}${provider?.channel === "whatsapp" ? ` — it opens WhatsApp with ${provider.messageTemplate ?? "the booking message"} ready` : ""}.`
      : input.contentType === "fix" ? `Sent the steps to ${label}.`
        : `Sent this week's summary to ${label}.`;
  return { speech, data: { messageId: outbound.id, status: outbound.status, shortUrl: short.url, expiresAt: signed.expiresAt, ...(item?.providerKey ? { provider: item.providerKey } : provider && "name" in provider ? { provider: provider.name } : {}) }, card: { channel, to: maskedContact(recipient), expiresAt: signed.expiresAt, url: short.url } };
}
