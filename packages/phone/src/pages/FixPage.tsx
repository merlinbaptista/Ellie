import { useState } from "react";
import type { PhoneAction, PhoneView } from "@ellie/schema";
import { PhoneViewRenderer, t, type UiLanguage } from "@ellie/ui";
import { postPhoneAction } from "../api.js";
import { StepList } from "../components/StepList.js";
import { Chat } from "../components/Chat.js";
import { DoneBanner } from "../components/DoneBanner.js";
import { ErrorPage } from "./ErrorPage.js";

const localizedAction: Record<string, string> = { fixed: "button.fixed", not_fixed: "button.not_fixed", chat: "button.chat", open_manual: "button.manual" };
export function FixPage({ token, view, refId, lang, onRefresh }: { token: string; view: PhoneView; refId: string; lang: UiLanguage; onRefresh: () => Promise<void> }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState<Error>();
  const safety = view.sections.some((section) => section.tone === "safety");
  if (safety) return <main className="phone-shell"><PhoneViewRenderer view={view} lang={lang} /></main>;
  const stepSection = view.sections.find((section) => section.ordered);
  const steps = stepSection?.list ?? [];
  const content = view.sections.filter((section) => section !== stepSection);
  async function act(action: PhoneAction) {
    setError(undefined);
    if (action.id === "chat") { setChatOpen(true); return; }
    if (action.method === "link") return;
    try {
      const result = await postPhoneAction<{ ok: boolean; nextDue?: string; view?: string }>(token, action.id as "fixed" | "not_fixed" | "booked");
      if (action.id === "fixed") setDone(result.nextDue ? `Great — next filter due ${new Intl.DateTimeFormat(view.translated?.to ?? view.language, { day: "numeric", month: "long" }).format(new Date(`${result.nextDue}T12:00:00Z`))}.` : "Great — I've recorded the fix.");
      else { setDone("I've updated your guide."); await onRefresh(); }
    } catch (failure) { setError(failure instanceof Error ? failure : new Error("You're offline.")); }
  }
  const sharedView: PhoneView = { ...view, sections: content, actions: view.actions.map((action) => ({ ...action, label: localizedAction[action.id] ? t(localizedAction[action.id] as Parameters<typeof t>[0], lang) : action.label })) };
  return <main className="phone-shell">
    <PhoneViewRenderer view={sharedView} lang={lang} onAction={(action) => void act(action)}>
      {error ? <ErrorPage error={error} lang={lang} onRetry={() => void onRefresh()} /> : null}
      {done ? <DoneBanner>{done}</DoneBanner> : null}
      {steps.length ? <StepList steps={steps} refId={refId} lang={lang} /> : null}
    </PhoneViewRenderer>
    {chatOpen ? <Chat token={token} view={view} lang={lang} onClose={() => setChatOpen(false)} ticked={JSON.parse(localStorage.getItem(`ellie.steps.${refId}`) ?? "[]") as number[]} /> : null}
  </main>;
}
