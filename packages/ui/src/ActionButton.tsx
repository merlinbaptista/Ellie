import type { PhoneAction } from "@ellie/schema";
import type { ReactNode } from "react";
import type { UiLanguage } from "./i18n/index.js";

export interface CardAction { label: string; url?: string; tool?: string; args?: Record<string, unknown> }
export function ActionButton({ action, onAction, lang = "en" }: { action: PhoneAction | CardAction; onAction?: (action: PhoneAction | CardAction) => void; lang?: UiLanguage }): ReactNode {
  const label = action.label;
  if ("url" in action && action.url) {
    const external = !action.url.startsWith("tel:") && !action.url.startsWith("sms:");
    return <a className="ellie-button" href={action.url} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{label}</a>;
  }
  return <button className="ellie-button" type="button" onClick={() => onAction?.(action)} lang={lang}>{label}</button>;
}
