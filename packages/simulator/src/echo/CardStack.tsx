import { useState, type ReactNode } from "react";
import { Card, type EllieCard } from "@ellie/ui";
import type { CardAction } from "@ellie/ui";
export function CardStack({ cards, onAction }: { cards: unknown[]; onAction: (action: CardAction) => void }): ReactNode {
  const [active, setActive] = useState(0);
  if (!cards.length) return null;
  const visible = cards.length <= 2 ? cards : [cards[active]];
  return <section className={`card-stack${cards.length > 1 ? " card-stack--multiple" : ""}`} aria-label="Headsup results">
    {visible.map((raw, index) => <Card key={active + index} card={raw as EllieCard} onAction={onAction} lang="en" />)}
    {cards.length > 2 ? <nav className="carousel-dots" aria-label="Result cards">{cards.map((_card, index) => <button key={index} aria-label={`Show card ${index + 1}`} aria-current={active === index ? "true" : undefined} onClick={() => setActive(index)} />)}</nav> : null}
  </section>;
}
