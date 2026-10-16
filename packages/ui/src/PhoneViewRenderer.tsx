import type { PhoneAction, PhoneView } from "@ellie/schema";
import type { ReactNode } from "react";
import { ActionButton } from "./ActionButton.js";
import { SafetyBanner } from "./SafetyBanner.js";
import type { UiLanguage } from "./i18n/index.js";
import { t } from "./i18n/index.js";

const sectionTranslationKeys: Record<string, Parameters<typeof t>[0]> = {
  "What's likely wrong": "heading.likely", "Call a professional if": "heading.call_pro", "You'll need": "heading.parts",
  When: "heading.when", How: "heading.how", Overdue: "heading.overdue", Due: "heading.due", "Due soon": "heading.due_soon", Warranty: "heading.warranty", "Recent history": "heading.history",
};
const actionTranslationKeys: Record<PhoneAction["id"], Parameters<typeof t>[0] | undefined> = {
  fixed: "button.fixed", not_fixed: "button.not_fixed", booked: "button.booked", chat: "button.chat", open_manual: "button.manual", book: undefined, call: "button.call",
};

export function PhoneViewRenderer({ view, onAction, lang = "en", notice, children }: { view: PhoneView; onAction?: (action: PhoneAction) => void; lang?: UiLanguage; notice?: string; children?: ReactNode }): ReactNode {
  const safety = view.sections.find((section) => section.tone === "safety");
  if (safety) {
    const call = view.actions.find((action) => action.id === "call");
    return <article className="ellie-phone-view" lang={lang}><header className="ellie-phone-header"><p className="ellie-eyebrow">ELLIE / HOME GUIDE</p><h1>{view.title}</h1></header>{notice ? <p className="ellie-language-note">{notice}</p> : null}<SafetyBanner text={safety.body ?? safety.heading} callUrl={call?.url} callLabel={t("button.call", lang)} lang={lang} /></article>;
  }
  return <article className="ellie-phone-view" lang={lang}>
    <header className="ellie-phone-header"><p className="ellie-eyebrow">ELLIE / HOME GUIDE</p><h1>{view.title}</h1>{view.subtitle ? <p className="ellie-phone-subtitle">{view.subtitle}</p> : null}</header>
    {notice ? <p className="ellie-language-note">{notice}</p> : null}
    <div className="ellie-sections">{view.sections.map((section, index) => <section className={`ellie-section ellie-section--${section.tone}`} key={`${section.heading}-${index}`}><h2>{sectionTranslationKeys[section.heading] ? t(sectionTranslationKeys[section.heading]!, lang) : section.heading}</h2>{section.body ? <p>{section.body}</p> : null}{section.list ? <>{section.ordered ? <ol>{section.list.map((text, row) => <li key={`${row}-${text}`}>{text}</li>)}</ol> : <ul>{section.list.map((text, row) => <li key={`${row}-${text}`}>{text}</li>)}</ul>}</> : null}</section>)}</div>
    {children}
    {view.actions.length ? <nav className="ellie-actions" aria-label="Actions">{view.actions.map((action, index) => <ActionButton key={`${action.id}-${index}`} action={{ ...action, label: actionTranslationKeys[action.id] ? t(actionTranslationKeys[action.id]!, lang) : action.label }} onAction={(selected) => { if ("id" in selected) onAction?.(selected); }} lang={lang} />)}</nav> : null}
    <footer className="ellie-footer">{t("expires", lang, { date: new Intl.DateTimeFormat(view.translated?.to ?? view.language, { dateStyle: "medium" }).format(new Date(view.expiresAt)) })}</footer>
  </article>;
}
