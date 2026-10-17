import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { CardAction } from "@ellie/ui";
import type { SimTurnResponse } from "@ellie/schema";
import { createSession, getIdleCard, reseed, sendTurn, setAccessCode, switchHousehold, timeTravel, type SimSessionResponse } from "./api.js";
import { EchoShow } from "./echo/EchoShow.js";
import type { LightState } from "./echo/LightBar.js";
import { PhoneFrame } from "./phone/PhoneFrame.js";
import { HouseholdSwitcher } from "./controls/HouseholdSwitcher.js";
import { Suggestions } from "./controls/Suggestions.js";
import { TimeControls } from "./controls/TimeControls.js";
import { Timeline } from "./dev/Timeline.js";
import { DevDrawer } from "./dev/DevDrawer.js";
import { McpAppHost } from "./host/McpAppHost.js";
import { recognitionSupported, startRecognition } from "./voice/recognition.js";
import { cancelSpeech, speak } from "./voice/synthesis.js";
import "@ellie/ui/tokens.css";
import "@ellie/ui/ui.css";
import "./simulator.css";
import "./simulator-theme.css";

function loadCodeFromUrl(): string | undefined {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("access");
  if (code) { setAccessCode(code); url.searchParams.delete("access"); history.replaceState(null, "", url.pathname + url.search + url.hash); }
  return code ?? undefined;
}

export default function App() {
  useState(loadCodeFromUrl);
  const [session, setSession] = useState<SimSessionResponse>();
  const [cards, setCards] = useState<unknown[]>([]);
  const [idleCard, setIdleCard] = useState<unknown>();
  const [turns, setTurns] = useState<SimTurnResponse[]>([]);
  const [speech, setSpeech] = useState("");
  const [draft, setDraft] = useState("");
  const [listeningText, setListeningText] = useState("");
  const [captionCharIndex, setCaptionCharIndex] = useState(-1);
  const [light, setLight] = useState<LightState>("idle");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [browserUrl, setBrowserUrl] = useState<string>();
  const [devOpen, setDevOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const [demoNow, setDemoNow] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const recognition = useRef<ReturnType<typeof startRecognition>>();
  const recognizedText = useRef("");
  const [micOkay] = useState(recognitionSupported);
  const [elapsedStart, setElapsedStart] = useState(0);

  useEffect(() => {
    void createSession("demo-blr").then((value) => { setSession(value); void getIdleCard(value.sessionId).then((idle) => setIdleCard(idle.card ?? undefined)).catch(() => undefined); }).catch((failure: Error) => setError(failure.message));
    void fetch("/api/status").then((response) => response.json()).then((status: { env?: { NODE_ENV?: string }; production?: boolean; clockNow?: string }) => { setControlsEnabled(status.production !== true && status.env?.NODE_ENV !== "production"); if (status.clockNow) setDemoNow(status.clockNow); }).catch(() => undefined);
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "`" && !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) { setDevOpen((current) => !current); return; }
      if (event.code === "Space" && !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName) && !event.repeat) { event.preventDefault(); beginListen(); }
    };
    const keyup = (event: globalThis.KeyboardEvent) => { if (event.code === "Space") recognition.current?.stop(); };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); recognition.current?.abort(); cancelSpeech(); };
  }, []);

  const submitText = useCallback(async (value: string, inputMode: "voice" | "text" | "chip" = "text", sttMs?: number): Promise<SimTurnResponse | undefined> => {
    const text = value.trim();
    if (!text || !session || busy) return undefined;
    setBusy(true); setError(""); setDraft(""); setListeningText(""); setLight("thinking"); setElapsedStart(performance.now()); cancelSpeech();
    try {
      const turn = await sendTurn({ sessionId: session.sessionId, householdId: session.household.householdId, text, lang: session.voiceLang, inputMode, ...(sttMs === undefined ? {} : { sttMs }) });
      setTurns((prior) => [...prior, turn].slice(-10)); setCards(turn.cards); setSpeech(turn.speech); setLight(turn.state as LightState);
      if (turn.phoneNotified) setRefreshKey((key) => key + 1);
      setCaptionCharIndex(-1);
      if (turn.state !== "safety_stop") speak(turn.speech, session.voiceLang, muted, setCaptionCharIndex, () => setLight(turn.state === "awaiting_answer" ? "awaiting_answer" : turn.state === "not_understood" ? "not_understood" : "idle"));
      void getIdleCard(session.sessionId).then((idle) => setIdleCard(idle.card ?? undefined)).catch(() => undefined);
      if (turn.state === "awaiting_answer") window.setTimeout(() => { if (!busy && micOkay) beginListen(); }, 1200);
      return turn;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Simulator turn failed."); setLight("not_understood"); }
    finally { setBusy(false); }
    return undefined;
  }, [busy, micOkay, muted, session]);

  function beginListen() {
    if (!micOkay) { setError("Voice needs Chrome or Edge. Type instead."); return; }
    if (light === "speaking") cancelSpeech();
    setError(""); setLight("listening"); setListeningText("");
    const started = performance.now();
    recognizedText.current = "";
    recognition.current = startRecognition({ lang: session?.voiceLang ?? "en-IN", onResult: (result) => { recognizedText.current = result.transcript; setListeningText(result.final ? "" : result.transcript); if (result.final) setDraft(result.transcript); }, onError: setError, onEnd: (sttMs) => { setLight("thinking"); const phrase = recognizedText.current; if (phrase.trim()) void submitText(phrase, "voice", Math.max(sttMs, Math.round(performance.now() - started))); else setLight("idle"); } });
  }

  async function changeHousehold(id: string) {
    if (!session) return;
    setBusy(true); setCards([]); setSpeech(""); setBrowserUrl(undefined); setError("");
    try {
      const switched = await switchHousehold(session.sessionId, id);
      setSession({ ...session, household: switched.household, suggestions: switched.suggestions, voiceLang: switched.voiceLang });
      void getIdleCard(session.sessionId).then((idle) => setIdleCard(idle.card ?? undefined)).catch(() => setIdleCard(undefined));
      setTurns([]); setLight("idle");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not switch household."); }
    finally { setBusy(false); }
  }

  async function sendForm(event: FormEvent) { event.preventDefault(); await submitText(draft, "text"); }
  function keyboardSend(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "Enter") void submitText(draft, "text"); }
  async function runTimeTravel(mode: "now" | "week" | "day30" | "reset") {
    const input = mode === "week" ? { days: 7 } : mode === "day30" ? { days: 30 } : mode === "reset" ? { reset: true } : { to: "2026-10-16" };
    try { const result = await timeTravel(input); setDemoNow(result.now); setToast(`${result.firedJobs} reminder${result.firedJobs === 1 ? "" : "s"} sent`); setRefreshKey((key) => key + 1); window.setTimeout(() => setToast(""), 4000); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Time travel failed."); }
  }
  async function doReseed() { if (!window.confirm("Reseed the demo households and reset their events?")) return; try { await reseed("2026-10-16"); setToast("Demo households reseeded"); } catch (failure) { setError(failure instanceof Error ? failure.message : "Reseed failed."); } }
  async function cardAction(action: CardAction) {
    if (action.url) { setBrowserUrl(action.url); return; }
    if (action.tool) await submitText(actionText(action.tool, action.args ?? {}), "chip");
  }
  function actionText(tool: string, args: Record<string, unknown>): string {
    const itemName = typeof args.item === "string" ? args.item : session?.household.householdId === "demo-tx" ? "propane tank" : "gas cylinder";
    if (tool === "what_do_you_know") return args.item ? `What do you know about ${itemName}?` : "What do you know about my home?";
    if (tool === "forget_item") return `Forget ${itemName}`;
    if (tool === "forget_household") return "Forget everything";
    if (tool === "manage_consent") return args.action === "grant" ? "You can text me again" : "Stop texting me";
    if (tool === "send_to_phone") return `Send the ${args.contentType === "booking" ? "booking link" : args.contentType === "summary" ? "summary" : "fix steps"} to my phone`;
    if (tool === "log_resolution") return "It's fixed";
    return tool === "get_history" ? `Show ${itemName} history` : tool === "predict_next" ? `When is ${itemName} due?` : tool === "due_this_week" ? "What's due this week?" : `Tell me about ${itemName}`;
  }
  async function hostTool(name: string, args: Record<string, unknown>) {
    const text = actionText(name, args);
    return await submitText(text, "chip") ?? { turnId: "pending", speech, cards, state: "done", calls: [], router: { kind: "deterministic", ms: 0 }, totalMs: 0, phoneNotified: false } as SimTurnResponse;
  }
  if (!session) return <main className="sim-loading"><p>{error || "Waking Ellie…"}</p>{error ? <button onClick={() => { setError(""); void createSession("demo-blr").then(setSession).catch((failure: Error) => setError(failure.message)); }}>Retry</button> : null}{error?.includes("access code") ? <form onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("code"); if (typeof value === "string") { setAccessCode(value); void createSession("demo-blr").then(setSession).catch((failure: Error) => setError(failure.message)); } }}><label>Access code<input name="code" type="password" autoComplete="current-password" /></label><button>Unlock</button></form> : null}</main>;
  const stateLine = elapsedStart ? `Last turn ${Math.round(performance.now() - elapsedStart)} ms` : "Ready when you are";
  return <div className="sim-app">
    <header className="sim-toolbar"><a className="sim-brand" href="/sim/" aria-label="Ellie home simulator"><span className="brand-mark">E</span><span>ELLIE<small>HOME SIMULATOR</small></span></a><HouseholdSwitcher current={session.household.householdId} onChange={(id) => void changeHousehold(id)} disabled={busy} /><div className="home-meta"><strong>{session.household.region || session.household.name}</strong><span>{session.household.language} · {session.household.timeZone}</span></div><div className="toolbar-clock"><span>DEMO CLOCK</span><strong>{new Intl.DateTimeFormat(session.household.language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: session.household.timeZone }).format(new Date(demoNow ?? Date.now()))}</strong></div><button className="toolbar-dev" onClick={() => setDevOpen((value) => !value)} aria-expanded={devOpen}>⌘ <span>Trace</span></button></header>
    {controlsEnabled ? <div className="control-strip"><TimeControls onTravel={(mode) => void runTimeTravel(mode)} onReseed={() => void doReseed()} message={toast} /><span className={`router-badge ${turns.at(-1)?.router.kind === "llm" ? "router-badge--llm" : ""}`}><i />{turns.at(-1)?.router.kind === "llm" ? "LLM · Bedrock" : "Deterministic"}{turns.at(-1)?.router.fallbackReason ? <small>{turns.at(-1)?.router.fallbackReason}</small> : null}</span></div> : null}
    <main className="sim-workspace"><section className="show-column"><EchoShow household={session.household} now={demoNow} idleCard={idleCard} cards={cards} speech={speech} state={light} listeningText={listeningText} charIndex={captionCharIndex} muted={muted} onMute={() => setMuted((value) => !value)} onAction={(action) => void cardAction(action)} onDismiss={() => { setLight("idle"); setCards([]); setSpeech(""); }} /><section className="voice-console" aria-label="Talk to Ellie"><div className="console-row">{micOkay ? <button className={`mic-button${light === "listening" ? " mic-button--active" : ""}`} type="button" aria-label="Hold to talk" aria-pressed={light === "listening"} disabled={busy} onMouseDown={beginListen} onMouseUp={() => recognition.current?.stop()} onMouseLeave={() => recognition.current?.stop()} onTouchStart={(event) => { event.preventDefault(); beginListen(); }} onTouchEnd={() => recognition.current?.stop()}>{light === "listening" ? "■" : "●"}</button> : null}<form onSubmit={(event) => void sendForm(event)}><input ref={input} aria-label="Say something to Ellie" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyboardSend} placeholder="Tell Ellie what's happening at home…" maxLength={400} disabled={busy} /><button type="submit" disabled={!draft.trim() || busy}>Send <span>↗</span></button></form></div>{!micOkay ? <p className="voice-note">Voice needs Chrome or Edge. Type instead.</p> : null}{error ? <p className="sim-error" role="alert">{error}</p> : null}<Suggestions items={session.suggestions} onSelect={(text) => void submitText(text, "chip")} /></section><Timeline turns={turns} /><div className="under-actions"><button onClick={() => setHostOpen(true)} disabled={!cards.length}>◫ Host view</button><button onClick={() => setDevOpen(true)}>⌘ Developer trace</button><span>{stateLine}</span></div></section><PhoneFrame householdId={session.household.householdId} refreshKey={refreshKey} browserUrl={browserUrl} onOpen={(href) => setBrowserUrl(href)} onCloseBrowser={() => setBrowserUrl(undefined)} /></main>
    {hostOpen && turns.at(-1) ? <McpAppHost result={turns.at(-1)!} onToolCall={hostTool} onOpen={(href) => setBrowserUrl(href)} onClose={() => setHostOpen(false)} /> : null}
    <DevDrawer turns={turns} open={devOpen} onClose={() => setDevOpen(false)} />
  </div>;
}
