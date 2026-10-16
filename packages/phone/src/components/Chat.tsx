import { useEffect, useState } from "react";
import type { ChatMessage, PhoneView } from "@ellie/schema";
import { t, type UiLanguage } from "@ellie/ui";
import { getChat, postChat } from "../api.js";

export function Chat({ token, view, lang, onClose, ticked = [] }: { token: string; view: PhoneView; lang: UiLanguage; onClose: () => void; ticked?: number[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);
  useEffect(() => { void getChat(token).then((history) => { setMessages(history.messages); if (history.disabled) { setDisabled(true); setError("Chat is unavailable after a safety stop. Ask Alexa for help."); } }).catch(() => setMessages([])); }, [token]);
  async function send(value = text) {
    const message = value.trim();
    if (!message || thinking) return;
    setText(""); setError(""); setThinking(true);
    const userMessage: ChatMessage = { id: `local-${Date.now()}`, role: "user", text: message, citedEvidenceIds: [], createdAt: new Date().toISOString() };
    setMessages((prior) => [...prior, userMessage]);
    try {
      const result = await postChat(token, { message, ticked, language: lang });
      setMessages((prior) => [...prior, result.reply]);
      if (result.safety?.level === "stop") setDisabled(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chat is unavailable."); }
    finally { setThinking(false); }
  }
  const evidenceById = new Map<string, string>(Object.entries(view.citationTexts ?? Object.fromEntries((view.evidence ?? []).map((entry) => [entry.evidenceId, entry.text]))));
  return <div className="chat-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="chat-sheet" role="dialog" aria-modal="true" aria-label="Ask about this fix"><header><div><p className="brand-mark">ELLIE / FIX CHAT</p><h2>{t("chat.placeholder", lang)}</h2></div><button className="icon-button" aria-label="Close chat" onClick={onClose}>×</button></header><div className="chat-quick">{[t("chat.quick_parts", lang), t("chat.quick_time", lang), t("chat.quick_warranty", lang)].map((chip) => <button key={chip} disabled={disabled} onClick={() => void send(chip)}>{chip}</button>)}</div><div className="chat-history" aria-live="polite">{messages.map((message) => <article key={message.id} className={`chat-message chat-message--${message.role}`}><p>{message.text}</p>{message.citedEvidenceIds.length ? <small>Based on: {message.citedEvidenceIds.map((id) => evidenceById.get(id) ?? id).join(" · ")}</small> : null}</article>)}{thinking ? <p className="chat-thinking" role="status">{t("chat.thinking", lang)}</p> : null}{error ? <p className="chat-error" role="alert">{error}</p> : null}</div><form onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea aria-label={t("chat.placeholder", lang)} maxLength={500} disabled={disabled} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("chat.placeholder", lang)} /><button className="ellie-button" disabled={!text.trim() || thinking || disabled}>{t("chat.send", lang)}</button></form></section></div>;
}
