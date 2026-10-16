import { t, type UiLanguage } from "@ellie/ui";
import { PhoneApiError } from "../api.js";

export function ErrorPage({ error, lang = "en", onRetry, noToken = false }: { error?: Error; lang?: UiLanguage; onRetry?: () => void; noToken?: boolean }) {
  const apiError = error instanceof PhoneApiError ? error : undefined;
  const key = noToken ? "error.no_token" : apiError?.status === 410 ? "error.expired" : apiError?.status === 403 || apiError?.status === 401 ? "error.invalid" : "error.offline";
  return <main className="phone-shell"><section className="error-panel"><p className="brand-mark">ELLIE / HOME GUIDE</p><h1>{t(key, lang)}</h1>{onRetry && !noToken ? <button className="ellie-button" onClick={onRetry}>{t("offline.retry", lang)}</button> : null}</section></main>;
}
