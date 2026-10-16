import type { ReactNode } from "react";
import type { UiLanguage } from "./i18n/index.js";
import { t } from "./i18n/index.js";
export function SafetyBanner({ text, callUrl, callLabel, lang = "en" }: { text: string; callUrl?: string; callLabel?: string; lang?: UiLanguage }): ReactNode {
  return <div className="ellie-safety" role="alert" lang={lang}><div><span aria-hidden="true">!</span><strong>{t("heading.safety", lang)}</strong></div><p>{text}</p>{callUrl ? <a className="ellie-button ellie-button--safety" href={callUrl}>{callLabel ?? t("button.retry", lang)}</a> : null}</div>;
}
