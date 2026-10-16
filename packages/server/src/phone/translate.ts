import { createHash } from "node:crypto";
import { PhoneView, type PhoneLinkPayload, type PhoneUiLanguage, type PhoneView as PhoneViewType } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { buildPhoneView } from "./views.js";
import { loadHouseholdSnapshot } from "../domain/snapshot.js";
import { translationPk, translationSk } from "../data/keys.js";

export const TRANSLATE_PROMPT_V1 = `Translate only supplied user-visible text fields into the requested language. Preserve JSON shape, placeholders, numbers, dates, URLs and brand names exactly. Safety text is omitted and must never be translated. Return only JSON: {"fields":[{"path":"...","text":"..."}]}.`;

type TextPair = { path: string; text: string };
function textFields(view: PhoneViewType, skipSafety = true): TextPair[] {
  const values: TextPair[] = [{ path: "title", text: view.title }];
  if (view.subtitle) values.push({ path: "subtitle", text: view.subtitle });
  view.sections.forEach((section, index) => {
    if (skipSafety && section.tone === "safety") return;
    values.push({ path: `sections.${index}.heading`, text: section.heading });
    if (section.body) values.push({ path: `sections.${index}.body`, text: section.body });
    section.list?.forEach((text, line) => values.push({ path: `sections.${index}.list.${line}`, text }));
  });
  Object.entries(view.citationTexts ?? {}).forEach(([id, text]) => values.push({ path: `citationTexts.${id}`, text }));
  view.actions.forEach((action, index) => values.push({ path: `actions.${index}.label`, text: action.label }));
  return values;
}
function replacePath(view: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let current: unknown = view;
  for (const part of parts.slice(0, -1)) current = (current as Record<string, unknown>)[part];
  (current as Record<string, unknown>)[parts.at(-1)!] = value;
}
function protect(value: string, protectables: string[], sequence: Map<string, string>): { text: string; local: Map<string, string> } {
  let result = value;
  const local = new Map<string, string>();
  const patterns = [
    /https?:\/\/[^\s)]+/gi,
    /\b\+?\d[\d\s().-]{5,}\d\b/g,
    /\b\d+(?:[.,]\d+)?\b/g,
    /\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
  ];
  const matches = patterns.flatMap((pattern) => [...value.matchAll(pattern)].map((match) => match[0]));
  const candidates = [...new Set([...protectables.filter(Boolean), ...matches])].sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    if (!result.includes(candidate)) continue;
    const placeholder = `⟦${sequence.size}⟧`;
    sequence.set(placeholder, candidate);
    local.set(placeholder, candidate);
    result = result.split(candidate).join(placeholder);
  }
  return { text: result, local };
}

export async function translatePhoneView(ctx: AppContext, payload: PhoneLinkPayload, language: PhoneUiLanguage): Promise<PhoneViewType> {
  const view = await buildPhoneView(ctx, payload);
  const locale = language === "en" ? "en" : `${language}-${language === "es" ? "ES" : view.language.split("-")[1] ?? "IN"}`;
  if (language === "en" || ctx.llm.name === "mock-llm" || view.sections.some((section) => section.tone === "safety")) {
    return PhoneView.parse({ ...view, translated: { to: locale, by: "none", complete: false } });
  }
  const hash = createHash("sha256").update(JSON.stringify(view)).digest("hex").slice(0, 32);
  const cacheKey = translationSk(hash, language);
  const cached = await ctx.storage.get(translationPk(), cacheKey);
  if (cached) return PhoneView.parse(cached.data.view);
  const snapshot = await loadHouseholdSnapshot(payload.hh, ctx);
  const itemId = payload.kind === "fix" ? (payload.ref ? (await ctx.repositories.diagnoses.get(payload.hh, payload.ref))?.itemId : undefined) : payload.ref;
  const item = itemId ? snapshot.items.find((entry) => entry.itemId === itemId) : undefined;
  const pack = ctx.regions.get(snapshot.profile?.regionPackId ?? "DEFAULT");
  const providerName = item?.customProvider?.name ?? (item?.providerKey ? pack.providers[item.providerKey]?.name : undefined);
  const protects = [item?.name, item?.brand, item?.model, providerName].filter((value): value is string => Boolean(value));
  const placeholders = new Map<string, string>();
  const fields = textFields(view);
  const protectedFields = fields.map((field) => {
    const protectedField = protect(field.text, protects, placeholders);
    return { path: field.path, text: protectedField.text, placeholders: protectedField.local };
  });
  try {
    const response = await ctx.llm.complete({ system: TRANSLATE_PROMPT_V1, messages: [{ role: "user", content: JSON.stringify({ language: locale, fields: protectedFields.map(({ path, text }) => ({ path, text })) }) }], responseFormat: "json", maxTokens: 1400, temperature: 0.1, signal: AbortSignal.timeout(ctx.env.LLM_BACKGROUND_TIMEOUT_MS) });
    const parsed = JSON.parse(response.text) as { fields?: TextPair[] };
    if (!Array.isArray(parsed.fields) || parsed.fields.length !== protectedFields.length) throw new Error("invalid_translation_shape");
    const translated = structuredClone(view) as unknown as Record<string, unknown>;
    for (let index = 0; index < protectedFields.length; index++) {
      const expected = protectedFields[index]!;
      const actual = parsed.fields[index]!;
      if (actual.path !== expected.path || typeof actual.text !== "string") throw new Error("invalid_translation_path");
      let text = actual.text;
      for (const [placeholder, original] of expected.placeholders) {
        if (!text.includes(placeholder)) throw new Error("missing_translation_placeholder");
        text = text.split(placeholder).join(original);
      }
      if (/⟦\d+⟧/.test(text)) throw new Error("unknown_translation_placeholder");
      replacePath(translated, actual.path, text);
    }
    const result = PhoneView.parse({ ...translated, translated: { to: locale, by: "llm", complete: true } });
    await ctx.storage.put({ pk: translationPk(), sk: cacheKey, type: "phone-translation", data: { view: result }, ttl: Math.floor(ctx.clock.now().getTime() / 1000) + 7 * 24 * 60 * 60 });
    return result;
  } catch (error) {
    ctx.logger.warn({ reason: error instanceof Error ? error.message : "translation_failed" }, "phone.translation_fallback");
    return PhoneView.parse({ ...view, translated: { to: locale, by: "none", complete: false } });
  }
}
