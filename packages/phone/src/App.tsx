import { useEffect, useState } from "react";
import type { PhoneView } from "@ellie/schema";
import { t, uiLanguage, type UiLanguage } from "@ellie/ui";
import { getPhoneView } from "./api.js";
import { captureToken, readLinkClaims } from "./token.js";
import { LanguagePicker } from "./components/LanguagePicker.js";
import "./privacy.css";
import { ErrorPage } from "./pages/ErrorPage.js";
import { FixPage } from "./pages/FixPage.js";
import { BookingPage } from "./pages/BookingPage.js";
import { SummaryPage } from "./pages/SummaryPage.js";
import { PrivacyPage } from "./pages/PrivacyPage.js";

const languageKey = "ellie.lang";
export default function App() {
  const [token] = useState(() => captureToken());
  const claims = token ? readLinkClaims(token) : null;
  const [language, setLanguage] = useState<UiLanguage>(() => uiLanguage(localStorage.getItem(languageKey) ?? undefined));
  const [view, setView] = useState<PhoneView>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  async function refresh() {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(undefined);
    try { setView(await getPhoneView(token, language)); }
    catch (failure) { setError(failure instanceof Error ? failure : new Error("Unable to load this guide.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [token, language]);
  function changeLanguage(next: UiLanguage) { localStorage.setItem(languageKey, next); setLanguage(next); }
  if (!token) return <ErrorPage noToken lang={language} />;
  if (loading) return <main className="phone-shell"><section className="loading-panel" aria-label="Loading"><span></span><span></span><span></span></section></main>;
  if (error) return <><ErrorPage error={error} lang={language} onRetry={() => void refresh()} /><div className="phone-floating-language"><LanguagePicker value={language} onChange={changeLanguage} /></div></>;
  if (!view || !claims) return <ErrorPage noToken lang={language} />;
  document.title = `${view.title} · Ellie`;
  if (view.kind === "privacy") return <PrivacyPage token={token} view={view} lang={language} />;
  const notice = language !== "en" && view.translated?.by === "none" ? t("translated.none", language) : undefined;
  const safetyOnly = view.kind === "fix" && view.sections.some((section) => section.tone === "safety");
  return <div className="phone-app">{!safetyOnly ? <div className="phone-floating-language"><LanguagePicker value={language} onChange={changeLanguage} /></div> : null}{view.kind === "fix" ? <FixPage token={token} view={view} refId={claims.ref ?? "guide"} lang={language} onRefresh={refresh} /> : view.kind === "booking" ? <BookingPage token={token} view={view} lang={language} /> : <SummaryPage view={view} lang={language} />}{notice && !safetyOnly ? <p className="phone-translation-note">{notice}</p> : null}</div>;
}
