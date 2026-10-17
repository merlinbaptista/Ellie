import { useEffect, useState } from "react";
import type { DataInventory, PhoneView } from "@ellie/schema";
import { PhoneViewRenderer, type UiLanguage } from "@ellie/ui";

const labels: Record<UiLanguage, { controls: string; download: string; stop: string; forget: string; confirm: string; cancel: string; erasePrompt: string; erase: string }> = {
  en: { controls: "Your controls", download: "Download my data", stop: "Stop messages", forget: "Forget item", confirm: "Confirm forget", cancel: "Cancel", erasePrompt: "Type erase to delete everything", erase: "Erase everything" },
  hi: { controls: "आपके नियंत्रण", download: "मेरा डेटा डाउनलोड करें", stop: "संदेश रोकें", forget: "आइटम भूलें", confirm: "भूलने की पुष्टि करें", cancel: "रद्द करें", erasePrompt: "सब कुछ मिटाने के लिए erase लिखें", erase: "सब कुछ मिटाएं" },
  kn: { controls: "ನಿಮ್ಮ ನಿಯಂತ್ರಣಗಳು", download: "ನನ್ನ ಡೇಟಾ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ", stop: "ಸಂದೇಶಗಳನ್ನು ನಿಲ್ಲಿಸಿ", forget: "ವಸ್ತುವನ್ನು ಮರೆತುಬಿಡಿ", confirm: "ಮರೆತುದನ್ನು ದೃಢೀಕರಿಸಿ", cancel: "ರದ್ದುಮಾಡಿ", erasePrompt: "ಎಲ್ಲವನ್ನೂ ಅಳಿಸಲು erase ಎಂದು ಟೈಪ್ ಮಾಡಿ", erase: "ಎಲ್ಲವನ್ನೂ ಅಳಿಸಿ" },
  ta: { controls: "உங்கள் கட்டுப்பாடுகள்", download: "என் தரவைப் பதிவிறக்கு", stop: "செய்திகளை நிறுத்து", forget: "பொருளை மறந்துவிடு", confirm: "மறப்பதை உறுதிப்படுத்து", cancel: "ரத்து செய்", erasePrompt: "அனைத்தையும் அழிக்க erase எனத் தட்டச்சு செய்க", erase: "அனைத்தையும் அழி" },
  es: { controls: "Tus controles", download: "Descargar mis datos", stop: "Dejar de enviar mensajes", forget: "Olvidar elemento", confirm: "Confirmar olvido", cancel: "Cancelar", erasePrompt: "Escribe erase para borrar todo", erase: "Borrar todo" },
};

async function privacyRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`Privacy action failed (${response.status}).`);
  return response.json() as Promise<T>;
}
export function PrivacyPage({ token, view, lang }: { token: string; view: PhoneView; lang: UiLanguage }) {
  const [inventory, setInventory] = useState<DataInventory>();
  const [confirmingItem, setConfirmingItem] = useState<string>();
  const [eraseText, setEraseText] = useState("");
  const [message, setMessage] = useState("");
  const [erased, setErased] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = labels[lang];
  useEffect(() => { void privacyRequest<DataInventory>(token, "/api/phone/privacy/inventory").then(setInventory).catch((error: Error) => setMessage(error.message)); }, [token]);
  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const result = await privacyRequest<{ message?: string }>(token, path, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
      setMessage(result.message ?? "Done.");
      if (path.endsWith("forget-household")) { setErased(true); setInventory(undefined); }
      else if (path.endsWith("forget-item")) setInventory(await privacyRequest<DataInventory>(token, "/api/phone/privacy/inventory"));
      else if (path.endsWith("withdraw")) setInventory(await privacyRequest<DataInventory>(token, "/api/phone/privacy/inventory"));
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Privacy action failed."); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/phone/export", { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Export failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ellie-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      setMessage("Your data export is ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export failed."); }
    finally { setBusy(false); }
  }
  if (erased) return <main className="phone-shell privacy-page"><h1>Everything is erased</h1><p role="status">{message}</p></main>;
  return <main className="phone-shell privacy-page">
    <PhoneViewRenderer view={view} lang={lang} />
    {inventory ? <section className="privacy-controls" aria-label="Privacy controls">
      <h2>{text.controls}</h2>
      <button type="button" disabled={busy} onClick={() => void download()}>{text.download}</button>
      <button type="button" disabled={busy} onClick={() => void act("/api/phone/privacy/withdraw")}>{text.stop}</button>
      <ul>{inventory.items.map((item) => <li key={item.itemId}><span>{item.name}</span>{confirmingItem === item.itemId ? <span><button type="button" disabled={busy} onClick={() => { void act("/api/phone/privacy/forget-item", { itemId: item.itemId }); setConfirmingItem(undefined); }}>{text.confirm}</button><button type="button" onClick={() => setConfirmingItem(undefined)}>{text.cancel}</button></span> : <button type="button" disabled={busy} onClick={() => setConfirmingItem(item.itemId)}>{text.forget}</button>}</li>)}</ul>
      <label>{text.erasePrompt}<input value={eraseText} onChange={(event) => setEraseText(event.target.value)} autoComplete="off" /></label>
      <button type="button" disabled={busy || eraseText.trim().toLowerCase() !== "erase"} onClick={() => { void act("/api/phone/privacy/forget-household", { confirmation: "erase" }); setEraseText(""); }}>{text.erase}</button>
    </section> : null}
    {message ? <p role="status">{message}</p> : null}
  </main>;
}
