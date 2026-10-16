import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";
import ta from "./ta.json";
import es from "./es.json";

const dictionaries = { en, hi, kn, ta, es } as const;
export type UiLanguage = keyof typeof dictionaries;
export type TranslationKey = keyof typeof en;

export function uiLanguage(tag?: string): UiLanguage {
  const key = tag?.split("-")[0]?.toLowerCase() as UiLanguage | undefined;
  return key && key in dictionaries ? key : "en";
}
export function t(key: TranslationKey, language: UiLanguage, vars: Record<string, string | number> = {}): string {
  const dictionary = dictionaries[language] as Record<string, string>;
  const fallback = en[key];
  let value = dictionary[key] ?? fallback;
  if (!dictionary[key] && language !== "en" && import.meta.env?.DEV) console.warn(`Missing ${language} translation: ${key}`);
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
export function formatDate(value: string, languageTag: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(languageTag, options).format(new Date(value));
}
export function translationDictionaries() { return dictionaries; }
