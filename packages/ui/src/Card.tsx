import type { ReactNode } from "react";
import { ActionButton, type CardAction } from "./ActionButton.js";
import { StatusPill, type StatusKind } from "./StatusPill.js";
import type { UiLanguage } from "./i18n/index.js";

export interface EllieCard {
  title: string;
  subtitle?: string;
  items?: Array<{ label: string; value: string; status?: StatusKind }>;
  actions?: CardAction[];
}
export function Card({ card, onAction, lang = "en" }: { card: EllieCard; onAction?: (action: CardAction) => void; lang?: UiLanguage }): ReactNode {
  return <article className="ellie-card" lang={lang}>
    <header className="ellie-card__header"><p className="ellie-eyebrow">Headsup / Home notes</p><h1>{card.title}</h1>{card.subtitle ? <p>{card.subtitle}</p> : null}</header>
    {card.items?.length ? <dl className="ellie-card__items">{card.items.map((item, index) => <div className="ellie-card__item" key={`${item.label}-${index}`}><dt>{item.label}{item.status ? <StatusPill status={item.status} lang={lang} /> : null}</dt><dd>{item.value}</dd></div>)}</dl> : null}
    {card.actions?.length ? <nav className="ellie-actions" aria-label="Actions">{card.actions.map((action, index) => <ActionButton key={`${action.label}-${index}`} action={action} onAction={onAction} lang={lang} />)}</nav> : null}
  </article>;
}
