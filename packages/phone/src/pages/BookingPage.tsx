import { useState } from "react";
import type { PhoneAction, PhoneView } from "@ellie/schema";
import { PhoneViewRenderer, type UiLanguage } from "@ellie/ui";
import { postPhoneAction } from "../api.js";
import { DoneBanner } from "../components/DoneBanner.js";

export function BookingPage({ token, view, lang }: { token: string; view: PhoneView; lang: UiLanguage }) {
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  async function act(action: PhoneAction) {
    if (action.id !== "booked") return;
    try { await postPhoneAction(token, "booked"); setDone("Noted — I'll check that it arrived soon."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "You're offline."); }
  }
  return <main className="phone-shell"><PhoneViewRenderer view={view} lang={lang} onAction={(action) => void act(action)} />{done ? <DoneBanner>{done}</DoneBanner> : null}{error ? <p role="alert">{error}</p> : null}</main>;
}
