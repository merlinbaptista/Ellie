import type { PhoneView } from "@ellie/schema";
import { PhoneViewRenderer, type UiLanguage } from "@ellie/ui";

export function SummaryPage({ view, lang }: { view: PhoneView; lang: UiLanguage }) {
  return <main className="phone-shell"><PhoneViewRenderer view={view} lang={lang} /></main>;
}
