import { randomUUID } from "node:crypto";
import { ChatMessage, PhoneChatResponse, type PhoneChatRequest, type PhoneChatResponse as PhoneChatResponseType, type PhoneLinkPayload } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { checkSafety } from "../diagnosis/safety.js";
import { linkPk, phoneChatCountSk, phoneChatDisabledSk, phoneChatPrefix, phoneChatSk, ttlClockForKey } from "../data/keys.js";
import { NotFoundError } from "../lib/errors.js";
import { loadHouseholdSnapshot } from "../domain/snapshot.js";

export const CHAT_PROMPT_V1 = `You are Headsup's repair-guide chat. Answer only from the supplied diagnosis, evidence and fix plan. Cite evidence IDs or step IDs exactly. Do not invent parts, dates, prices, contacts, names or instructions. Never contradict a non-DIY cause or safety note. Reply in at most 3 short spoken sentences as JSON with {"text":"...","citations":["id"]}. If the supplied context does not answer the question, say you are not sure and recommend a technician.`;
export class ChatLimitError extends Error { constructor() { super("I've answered a lot here — ask Alexa if you need more."); this.name = "ChatLimitError"; } }

function cleanUserText(value: string): string {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[contact]").slice(0, 500);
}
function sanitizeForLlm(value: string, privateValues: Array<string | undefined>): string {
  let safe = cleanUserText(value)
    .replace(/\b(?:demo-[a-z0-9-]+|hh_[a-z0-9-]+)\b/gi, "[private]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[private link]")
    .replace(/\b(my name is|their name is|his name is|her name is)\s+[\p{L}'’-]+/giu, "$1 [name]")
    .replace(/\b(my\s+(?:wife|husband|partner|son|daughter|mother|father|child))\s+[\p{L}'’-]+/giu, "$1 [name]");
  for (const valueToHide of [...new Set(privateValues.filter((entry): entry is string => Boolean(entry)))].sort((left, right) => right.length - left.length)) {
    safe = safe.replace(new RegExp(valueToHide.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[private]");
  }
  return safe.slice(0, 500);
}
function containsOutOfScope(text: string): boolean { return /weather|stock price|politic|sports score|write (?:a|an) poem|clima|pronóstico|मौसम|ಹವಾಮಾನ|வானிலை/i.test(text); }
function makeMessage(role: "user" | "ellie", text: string, citations: string[] = [], source?: "llm" | "deterministic" | "safety"): PhoneChatResponseType["reply"] {
  return ChatMessage.parse({ id: randomUUID(), role, text: text.slice(0, 600), citedEvidenceIds: citations, ...(source ? { source } : {}), createdAt: new Date().toISOString() });
}
function citedText(diagnosis: NonNullable<Awaited<ReturnType<typeof loadDiagnosis>>>, ids: string[]): string[] {
  return ids.map((id) => diagnosis.evidence.find((entry) => entry.evidenceId === id)?.text).filter((text): text is string => Boolean(text));
}
async function loadDiagnosis(ctx: AppContext, payload: PhoneLinkPayload) {
  return payload.ref ? ctx.repositories.diagnoses.get(payload.hh, payload.ref) : null;
}

export async function getPhoneChat(ctx: AppContext, payload: PhoneLinkPayload): Promise<PhoneChatResponseType["reply"][]> {
  if (payload.kind !== "fix") throw new NotFoundError("Chat unavailable");
  const tokenHash = payload.nonce;
  const rows = await ctx.storage.query(linkPk(), { skPrefix: phoneChatPrefix(tokenHash) });
  return rows.map((row) => ChatMessage.parse(row.data.message)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.role === b.role ? a.id.localeCompare(b.id) : a.role === "user" ? -1 : 1));
}

export async function postPhoneChat(ctx: AppContext, payload: PhoneLinkPayload, input: PhoneChatRequest): Promise<PhoneChatResponseType> {
  if (payload.kind !== "fix" || !payload.ref) throw new NotFoundError("Chat unavailable");
  const diagnosis = await loadDiagnosis(ctx, payload);
  if (!diagnosis || diagnosis.status === "safety_stop" || diagnosis.status === "needs_pro") throw new NotFoundError("Chat unavailable");
  const snapshot = await loadHouseholdSnapshot(payload.hh, ctx);
  const item = snapshot.items.find((entry) => entry.itemId === diagnosis.itemId);
  if (!item) throw new NotFoundError("Chat unavailable");
  const household = snapshot.profile;
  const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
  const catalog = pack.catalog[item.catalogKey];
  const tokenHash = payload.nonce;
  const disabledKey = phoneChatDisabledSk(tokenHash);
  if (await ctx.storage.get(linkPk(), disabledKey)) throw new NotFoundError("Chat unavailable");
  const countKey = phoneChatCountSk(tokenHash);
  const countRecord = await ctx.storage.get(linkPk(), countKey);
  const count = Number(countRecord?.data.count ?? 0);
  if (count >= 20) throw new ChatLimitError();

  const userText = cleanUserText(input.message);
  const privateValues = [household?.displayName, household?.region, item.name, item.brand, item.model, item.customProvider?.name, item.providerKey ? pack.providers[item.providerKey]?.name : undefined];
  const safeUserText = sanitizeForLlm(userText, privateValues);
  const safety = checkSafety(userText, catalog, pack);
  const expires = Math.min(payload.exp, Math.floor(Date.now() / 1000) + ctx.env.CHAT_RETENTION_DAYS * 86400);
  const saveMessage = async (message: PhoneChatResponseType["reply"]): Promise<PhoneChatResponseType["reply"]> => {
    const previous = await getPhoneChat(ctx, payload);
    const previousAt = previous.length ? Date.parse(previous[previous.length - 1]!.createdAt) : 0;
    if (Date.parse(message.createdAt) <= previousAt) message = ChatMessage.parse({ ...message, createdAt: new Date(previousAt + 1).toISOString() });
    const pk = linkPk();
    const sk = phoneChatSk(tokenHash, message.createdAt, message.id);
    await ctx.storage.put({ pk, sk, type: "phone-chat-message", data: { message }, ttlClock: ttlClockForKey(pk, sk), ttl: expires });
    return message;
  };
  await saveMessage(makeMessage("user", safeUserText));
  await ctx.storage.put({ pk: linkPk(), sk: countKey, type: "phone-chat-count", data: { count: count + 1 }, ttlClock: "wall", ttl: expires });
  if (safety) {
    await ctx.storage.put({ pk: linkPk(), sk: disabledKey, type: "phone-chat-disabled", data: { category: safety.category }, ttlClock: "wall", ttl: expires });
    const reply = await saveMessage(makeMessage("ellie", safety.message, [], "safety"));
    return PhoneChatResponse.parse({ reply, safety: { level: "stop", number: safety.emergencyNumber }, remaining: Math.max(0, 19 - count) });
  }

  const top = diagnosis.candidates[0];
  const plan = diagnosis.fixPlan;
  const evidence = diagnosis.evidence;
  const relevant = (ids: string[]) => ids.filter((id) => evidence.some((entry) => entry.evidenceId === id));
  let text: string | undefined;
  let citations: string[] = [];
  let source: "llm" | "deterministic" = "deterministic";
  const lower = userText.toLowerCase();
  if (containsOutOfScope(lower)) text = `I can only help with this ${catalog?.displayName ?? "home item"} fix.`;
  else if (/which step|next step|what next|continue|siguiente paso|qué sigue|अगला कदम|ಮುಂದಿನ ಹಂತ|அடுத்த படி/i.test(lower)) {
    const step = plan?.steps.findIndex((_value, index) => !input.ticked?.includes(index)) ?? -1;
    if (step >= 0 && plan?.steps[step]) { text = plan.steps[step]; citations = [`step_${step + 1}`]; }
  } else if (/how long|how much time|time|cuánto tiempo|cuanto tiempo|कितना समय|ಎಷ್ಟು ಸಮಯ|எவ்வளவு நேரம்/i.test(lower) && plan?.timeMinutes) { text = `This step should take about ${plan.timeMinutes} minutes.`; citations = ["fix_time"]; }
  else if (/parts|what.*need|what.*buy|which filter|qué necesito|que necesito|qué comprar|क्या चाहिए|ಏನು ಬೇಕು|என்ன தேவை/i.test(lower) && plan?.partsNeeded.length) { text = `You'll need ${plan.partsNeeded.join(", ")}.`; citations = ["fix_parts"]; }
  else if (/warranty|covered|garantía|garantia|वारंटी|ವಾರಂಟಿ|உத்தரவாதம்/i.test(lower)) {
    const warranty = evidence.find((entry) => entry.kind === "warranty");
    if (warranty) { text = warranty.text; citations = [warranty.evidenceId]; }
  } else if (/call.*(pro|technician)|technician|professional|técnico|técnica|electricista|मिस्त्री|ತಂತ್ರಜ್ಞ|தொழில்நுட்ப நிபுணர்/i.test(lower) && plan?.callProIf.length) { text = plan.callProIf.join(". "); citations = plan.callProIf.map((_value, index) => `call_pro_${index + 1}`); }
  else if (/why|cause|what.*wrong/i.test(lower) && top) {
    citations = relevant(top.evidenceIds);
    text = `${top.description}${citedText(diagnosis, citations).length ? `. ${citedText(diagnosis, citations).join(". ")}` : ""}`;
  }
  if (!text) {
    const context = {
      symptom: diagnosis.symptomKey,
      candidates: diagnosis.candidates.slice(0, 3).map(({ causeKey, description, diy }) => ({ causeKey, description, diy })),
      evidence: evidence.map(({ evidenceId, text: evidenceText }) => ({ id: evidenceId, text: evidenceText })),
      steps: (plan?.steps ?? []).map((step, index) => ({ id: `step_${index + 1}`, text: step })),
      parts: plan?.partsNeeded.map((part, index) => ({ id: `part_${index + 1}`, text: part })) ?? [],
      callProIf: plan?.callProIf.map((value, index) => ({ id: `call_pro_${index + 1}`, text: value })) ?? [],
      duration: plan?.timeMinutes ? { id: "fix_time", text: `This fix takes about ${plan.timeMinutes} minutes` } : undefined,
      warranty: evidence.filter((entry) => entry.kind === "warranty").map(({ evidenceId, text: evidenceText }) => ({ id: evidenceId, text: evidenceText })),
      language: input.language ?? (input.message.match(/[\u0900-\u097f]/) ? "hi" : household?.phoneLanguage?.split("-")[0] ?? household?.language?.split("-")[0] ?? "en"),
      conversation: (await getPhoneChat(ctx, payload)).slice(-6).map((message) => ({ role: message.role, text: sanitizeForLlm(message.text, privateValues), citedEvidenceIds: message.citedEvidenceIds })),
      question: safeUserText,
    };
    try {
      const result = await ctx.llm.complete({ system: CHAT_PROMPT_V1, messages: [{ role: "user", content: JSON.stringify(context) }], responseFormat: "json", maxTokens: 250, temperature: 0.2, signal: AbortSignal.timeout(ctx.env.LLM_BACKGROUND_TIMEOUT_MS) });
      const parsed = JSON.parse(result.text) as { text?: string; citations?: string[] };
      const ids = parsed.citations ?? [];
      const allowed = new Set([...evidence.map((entry) => entry.evidenceId), ...context.steps.map((step) => step.id), ...context.parts.map((part) => part.id), ...context.callProIf.map((entry) => entry.id), ...(context.duration ? [context.duration.id] : [])]);
      const facts = [...evidence.filter((entry) => ids.includes(entry.evidenceId)).map((entry) => entry.text), ...context.steps.filter((step) => ids.includes(step.id)).map((step) => step.text), ...context.parts.filter((part) => ids.includes(part.id)).map((part) => part.text), ...context.callProIf.filter((entry) => ids.includes(entry.id)).map((entry) => entry.text), ...(context.duration && ids.includes(context.duration.id) ? [context.duration.text] : [])].join(" ").toLowerCase();
      const numericTokens = [...(parsed.text ?? "").matchAll(/\d+|[$£€₹]|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/gi)].map((match) => match[0].toLowerCase());
      const unsafe = /(?:touch|open|repair|replace|check).{0,20}(?:live wire|gas leak|exposed|electrical fault)/i.test(parsed.text ?? "") || (top?.diy === false && /\b(try|do|replace|repair|open)\b/i.test(parsed.text ?? ""));
      if (!parsed.text || !ids.length || ids.some((id) => !allowed.has(id)) || numericTokens.some((token) => !facts.includes(token)) || unsafe || (plan?.partsNeeded.some((part, index) => (parsed.text ?? "").toLowerCase().includes(part.toLowerCase()) && !ids.includes(`part_${index + 1}`)))) throw new Error("invalid_chat_answer");
      text = parsed.text.slice(0, 600);
      citations = ids;
      source = "llm";
    } catch {
      text = `I'm not sure about that. ${plan?.callProIf[0] ?? "Please call a technician."}`;
      citations = [];
      source = "deterministic";
    }
  }
  const reply = await saveMessage(makeMessage("ellie", text, citations, source));
  return PhoneChatResponse.parse({ reply, remaining: Math.max(0, 19 - count) });
}
