import type { ReactNode } from "react";
import type { SimHousehold } from "../api.js";
import type { CardAction } from "@ellie/ui";
import { Caption } from "./Caption.js";
import { CardStack } from "./CardStack.js";
import { LightBar, type LightState } from "./LightBar.js";

export function EchoShow({ household, now, idleCard, cards, speech, state, listeningText, charIndex, muted, onMute, onAction, onDismiss }: { household: SimHousehold; now?: string; idleCard?: unknown; cards: unknown[]; speech: string; state: LightState; listeningText?: string; charIndex?: number; muted: boolean; onMute: () => void; onAction: (action: CardAction) => void; onDismiss: () => void }): ReactNode {
  const date = new Date(now ?? Date.now());
  const dateText = new Intl.DateTimeFormat(household.language, { weekday: "long", day: "numeric", month: "long", timeZone: household.timeZone }).format(date);
  const timeText = new Intl.DateTimeFormat(household.language, { hour: "numeric", minute: "2-digit", timeZone: household.timeZone }).format(date);
  return <section className="echo-device" aria-label="Echo Show simulator">
    <div className="echo-screen"><header className="echo-topline"><span className="echo-wordmark">ELLIE <i>HOME</i></span><span>{household.region || household.name} · {household.language} · {household.timeZone}</span><button className="mute-button" onClick={onMute} aria-pressed={muted}>{muted ? "◖×" : "◖"}<span>{muted ? "Unmute" : "Mute"}</span></button></header>
      {cards.length ? <CardStack cards={cards} onAction={onAction} /> : <div className="echo-idle"><p className="echo-time">{timeText}</p><p className="echo-date">{dateText}</p><span className="idle-rule" /><p className="idle-copy">Your home, in the loop.</p>{idleCard && typeof idleCard === "object" ? <IdleDueBanner card={idleCard} /> : null}</div>}
      <Caption text={speech} listeningText={listeningText} charIndex={charIndex} />
      {state === "safety_stop" ? <button className="dismiss-button" onClick={onDismiss}>Dismiss</button> : null}
    </div><LightBar state={state} />
  </section>;
}

function IdleDueBanner({ card }: { card: unknown }): ReactNode {
  const value = card as { title?: string; items?: Array<{ label: string; value: string; status?: string }> };
  const item = value.items?.[0];
  return <div className="idle-due-banner"><strong>{item?.label ?? value.title ?? "Home briefing"}</strong><span>{item?.value ?? "Nothing due soon"}</span></div>;
}
