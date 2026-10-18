import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { CardAction } from "@ellie/ui";
import type { SimTurnResponse } from "@ellie/schema";
import { createSession, getDemoScript, getIdleCard, getOutbox, hasAccessCode, prepareDemo, reseed, sendTurn, setAccessCode, switchHousehold, timeTravel, type SimSessionResponse } from "./api.js";
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
import { Presenter, type PresenterResult } from "./presenter/Presenter.js";
import { presenterAllowed, type PresenterStep } from "./presenter/types.js";
import "@ellie/ui/tokens.css";
import "@ellie/ui/ui.css";
import "./simulator.css";
import "./simulator-theme.css";
import "./presenter/presenter.css";

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
  const [controlsEnabled, setControlsEnabled] = useState(false);
  const [demoNow, setDemoNow] = useState<string>();
  const [demoScript, setDemoScript] = useState<PresenterStep[]>([]);
  const [presenterOpen, setPresenterOpen] = useState(false);
  const [presenterIndex, setPresenterIndex] = useState(0);
  const [presenterResult, setPresenterResult] = useState<PresenterResult>();
  const [presenterBusy, setPresenterBusy] = useState(false);
  const [presenterPhoneToken, setPresenterPhoneToken] = useState<string>();
  const [presenterLatestLink, setPresenterLatestLink] = useState<string>();
  const [fullScreen, setFullScreen] = useState(false);
  const presenterNext = useRef<() => void>(() => undefined);
  const presenterBack = useRef<() => void>(() => undefined);
  const presenterSpeak = useRef<() => void>(() => undefined);
  const presenterStart = useRef<() => void>(() => undefined);
  const presenterOutboxBefore = useRef(new Map<string, string>());
  const presenterOpenRef = useRef(false);
  const controlsEnabledRef = useRef(true);
  presenterOpenRef.current = presenterOpen;
  controlsEnabledRef.current = controlsEnabled;
  const input = useRef<HTMLInputElement>(null);
  const recognition = useRef<ReturnType<typeof startRecognition>>();
  const recognizedText = useRef("");
  const [micOkay] = useState(recognitionSupported);
  const [elapsedStart, setElapsedStart] = useState(0);

  useEffect(() => {
    void getDemoScript().then(setDemoScript).catch(() => undefined);
    void createSession("demo-blr").then((value) => { setSession(value); void getIdleCard(value.sessionId).then((idle) => setIdleCard(idle.card ?? undefined)).catch(() => undefined); }).catch((failure: Error) => setError(failure.message));
    void fetch("/api/status").then((response) => response.json()).then((status: { env?: { NODE_ENV?: string }; production?: boolean; clockNow?: string }) => { setControlsEnabled(presenterAllowed(status.production === true || status.env?.NODE_ENV === "production", hasAccessCode())); if (status.clockNow) setDemoNow(status.clockNow); }).catch(() => undefined);
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "`" && !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) { setDevOpen((current) => !current); return; }
      if (!/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName) && event.key.toLowerCase() === "p" && controlsEnabledRef.current) { presenterStart.current(); return; }
      if (!/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName) && event.key.toLowerCase() === "f" && controlsEnabledRef.current) { setFullScreen((current) => !current); return; }
      if (!/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName) && presenterOpenRef.current && event.key === "ArrowRight") { event.preventDefault(); presenterNext.current(); return; }
      if (!/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName) && presenterOpenRef.current && event.key === "ArrowLeft") { event.preventDefault(); presenterBack.current(); return; }
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
      if (presenterOpenRef.current && demoScript.filter((step) => !step.hidden)[presenterIndex]?.action.kind === "say") {
        const step = demoScript.filter((entry) => !entry.hidden)[presenterIndex]!;
        const messages = await getOutbox(session.household.householdId);
        const freshMessages = messages.filter((message) => presenterOutboxBefore.current.get(message.id) !== `${message.sentAt}|${message.link ?? ""}`);
        setPresenterResult(await evaluatePresenter(step, { speech: turn.speech, tools: turn.calls.map((call) => call.tool), state: turn.state, cards: turn.cards.length, maxToolMs: Math.max(0, ...turn.calls.map((call) => call.ms)), outboxNew: freshMessages.length }));
        if (turn.phoneNotified && freshMessages[0]?.link) setPresenterLatestLink(freshMessages[0].link);
      }
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
  const visiblePresenterSteps = demoScript.filter((step) => !step.hidden);
  async function evaluatePresenter(step: PresenterStep, result: { speech?: string; tools?: string[]; state?: string; cards?: number; maxToolMs?: number; outboxNew?: number }): Promise<PresenterResult> {
    const expectation = step.expect ?? {};
    let reason = "";
    if (expectation.tools && JSON.stringify(result.tools ?? []) !== JSON.stringify(expectation.tools)) reason = `Expected tools: ${expectation.tools.join(" -> ")}; got ${(result.tools ?? []).join(" -> ") || "none"}`;
    const normalizedSpeech = (result.speech ?? "").toLowerCase();
    if (!reason && expectation.speechIncludes?.some((fragment) => !normalizedSpeech.includes(fragment.toLowerCase()))) reason = `Missing speech: ${expectation.speechIncludes.filter((fragment) => !normalizedSpeech.includes(fragment.toLowerCase())).join(", ")}`;
    if (!reason && expectation.speechExcludes?.some((fragment) => normalizedSpeech.includes(fragment.toLowerCase()))) reason = `Unexpected speech: ${expectation.speechExcludes.filter((fragment) => normalizedSpeech.includes(fragment.toLowerCase())).join(", ")}`;
    if (!reason && expectation.state && result.state !== expectation.state) reason = `Expected state ${expectation.state}; got ${result.state ?? "none"}`;
    if (!reason && expectation.cards !== undefined && result.cards !== expectation.cards) reason = `Expected ${expectation.cards} cards; got ${result.cards ?? 0}`;
    if (!reason && (result.maxToolMs ?? 0) > (expectation.maxToolMs ?? 500)) reason = `Tool time ${result.maxToolMs} ms exceeds ${expectation.maxToolMs ?? 500} ms`;
    if (!reason && expectation.outboxNew !== undefined && result.outboxNew !== expectation.outboxNew) reason = `Expected ${expectation.outboxNew} new messages; got ${result.outboxNew ?? 0}`;
    return { ok: !reason, reason };
  }
  async function executePresenterStep(step: PresenterStep): Promise<void> {
    if (!session) return;
    setPresenterBusy(true); setPresenterResult(undefined); setError("");
    const targetHousehold = step.household === "fresh" ? "fresh" : step.household;
    let targetLang = session.voiceLang;
    try {
      if (targetHousehold !== session.household.householdId) {
        const switched = await switchHousehold(session.sessionId, targetHousehold);
        targetLang = switched.voiceLang;
        setSession({ ...session, household: switched.household, suggestions: switched.suggestions, voiceLang: switched.voiceLang });
      }
      const actualHousehold = targetHousehold === "fresh" ? session.household.householdId : targetHousehold;
      const before = await getOutbox(actualHousehold);
      presenterOutboxBefore.current = new Map(before.map((message) => [message.id, `${message.sentAt}|${message.link ?? ""}`]));
      if (step.action.kind === "reseed") {
        await reseed("2026-10-16");
        if (step.household === "demo-blr") await prepareDemo("demo-blr");
      }
      else if (step.action.kind === "timeTravel") {
        const result = await timeTravel(step.action.to === null ? { reset: true } : { to: step.action.to });
        setDemoNow(result.now); setRefreshKey((key) => key + 1); setToast(`${result.firedJobs} reminders sent`);
        const after = await getOutbox(actualHousehold);
        const freshMessages = after.filter((message) => presenterOutboxBefore.current.get(message.id) !== `${message.sentAt}|${message.link ?? ""}`);
        const fresh = freshMessages.find((message) => message.link);
        if (fresh?.link) setPresenterLatestLink(fresh.link);
        setPresenterResult(await evaluatePresenter(step, { outboxNew: freshMessages.length }));
      } else if (step.action.kind === "say") {
        const turn = await sendTurn({ sessionId: session.sessionId, householdId: targetHousehold, text: step.action.text, lang: targetLang, inputMode: "chip" });
        setTurns((prior) => [...prior, turn].slice(-10)); setCards(turn.cards); setSpeech(turn.speech); setLight(turn.state as LightState); if (turn.phoneNotified) setRefreshKey((key) => key + 1);
        const after = await getOutbox(actualHousehold);
        const freshMessages = after.filter((message) => presenterOutboxBefore.current.get(message.id) !== `${message.sentAt}|${message.link ?? ""}`);
        const fresh = freshMessages.find((message) => message.link);
        if (fresh?.link) setPresenterLatestLink(fresh.link);
        setPresenterResult(await evaluatePresenter(step, { speech: turn.speech, tools: turn.calls.map((call) => call.tool), state: turn.state, cards: turn.cards.length, maxToolMs: Math.max(0, ...turn.calls.map((call) => call.ms)), outboxNew: freshMessages.length }));
      } else if (step.action.kind === "openPhone") {
        const latest = (await getOutbox(targetHousehold)).find((message) => message.link);
        const link = presenterLatestLink ?? latest?.link;
        if (!link) throw new Error("No phone link is available for this household.");
        const redirect = await fetch(link, { redirect: "manual" });
        const location = redirect.headers.get("location");
        if (!location || redirect.status < 300 || redirect.status >= 400) throw new Error("Phone short link did not redirect.");
        const target = new URL(location, link);
        const token = target.searchParams.get("t") ?? (target.pathname.startsWith("/p/") ? decodeURIComponent(target.pathname.slice(3)) : undefined);
        if (!token) throw new Error("Phone link token was unavailable.");
        setPresenterPhoneToken(token); setBrowserUrl(link); setRefreshKey((key) => key + 1);
      } else {
        if (!presenterPhoneToken) throw new Error("Open the phone link before using a phone action.");
        const action = step.action.action === "fixed" ? "fixed" : "booked";
        const response = await fetch(`/api/phone/actions/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: presenterPhoneToken }) });
        if (!response.ok) throw new Error(`Phone action returned HTTP ${response.status}.`);
      }
      if (step.action.kind !== "say" && step.action.kind !== "timeTravel") setPresenterResult(await evaluatePresenter(step, { outboxNew: Math.max(0, (await getOutbox(actualHousehold)).length - before.length) }));
      void getIdleCard(session.sessionId).then((idle) => setIdleCard(idle.card ?? undefined)).catch(() => undefined);
    } catch (failure) {
      setPresenterResult({ ok: false, reason: failure instanceof Error ? failure.message : "Presenter step failed" });
      setError(failure instanceof Error ? failure.message : "Presenter step failed.");
    } finally { setPresenterBusy(false); }
  }
  async function startPresenter(): Promise<void> {
    if (!demoScript.length) return;
    setPresenterOpen(true); setFullScreen(false); setPresenterIndex(0); setPresenterResult(undefined); setPresenterPhoneToken(undefined); setBrowserUrl(undefined);
    for (const hiddenStep of demoScript.filter((step) => step.hidden).slice(0, 2)) await executePresenterStep(hiddenStep);
  }
  async function advancePresenter(): Promise<void> {
    const current = visiblePresenterSteps[presenterIndex];
    if (!current) return;
    if (!presenterResult) { await executePresenterStep(current); return; }
    if (presenterIndex < visiblePresenterSteps.length - 1) {
      const currentScriptIndex = demoScript.findIndex((step) => step.id === current.id);
      const nextStep = visiblePresenterSteps[presenterIndex + 1]!;
      const nextScriptIndex = demoScript.findIndex((step) => step.id === nextStep.id);
      for (const hiddenStep of demoScript.slice(currentScriptIndex + 1, nextScriptIndex).filter((step) => step.hidden)) await executePresenterStep(hiddenStep);
      setPresenterIndex((index) => index + 1); setPresenterResult(undefined); return;
    }
    for (const hiddenStep of demoScript.filter((step) => step.hidden).slice(2)) await executePresenterStep(hiddenStep);
    setPresenterOpen(false); setPresenterResult(undefined); setPresenterPhoneToken(undefined); setBrowserUrl(undefined);
  }
  presenterNext.current = () => { void advancePresenter(); };
  presenterBack.current = () => {
    const previousIndex = Math.max(0, presenterIndex - 1);
    const previous = visiblePresenterSteps[previousIndex];
    setPresenterIndex(previousIndex); setPresenterResult(undefined);
    if (previous) void executePresenterStep(previous);
  };
  presenterSpeak.current = () => {
    void getOutbox(session?.household.householdId ?? "demo-blr").then((messages) => {
      presenterOutboxBefore.current = new Map(messages.map((message) => [message.id, `${message.sentAt}|${message.link ?? ""}`]));
      beginListen();
    });
  };
  presenterStart.current = () => { void startPresenter(); };
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
  if (!session) return <main className="sim-loading"><p>{error || "Waking Headsup…"}</p>{error ? <button onClick={() => { setError(""); void createSession("demo-blr").then(setSession).catch((failure: Error) => setError(failure.message)); }}>Retry</button> : null}{error?.includes("access code") ? <form onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("code"); if (typeof value === "string") { setAccessCode(value); void createSession("demo-blr").then(setSession).catch((failure: Error) => setError(failure.message)); } }}><label>Access code<input name="code" type="password" autoComplete="current-password" /></label><button>Unlock</button></form> : null}</main>;
  const stateLine = elapsedStart ? `Last turn ${Math.round(performance.now() - elapsedStart)} ms` : "Ready when you are";
  return <div className={`sim-app${fullScreen ? " sim-app--full-screen" : ""}`}>
    <header className="sim-toolbar"><a className="sim-brand" href="/sim/" aria-label="Headsup home simulator"><span className="brand-mark">E</span><span>ELLIE<small>HOME SIMULATOR</small></span></a><HouseholdSwitcher current={session.household.householdId} onChange={(id) => void changeHousehold(id)} disabled={busy} /><div className="home-meta"><strong>{session.household.region || session.household.name}</strong><span>{session.household.language} · {session.household.timeZone}</span></div><div className="toolbar-clock"><span>DEMO CLOCK</span><strong>{new Intl.DateTimeFormat(session.household.language, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: session.household.timeZone }).format(new Date(demoNow ?? Date.now()))}</strong></div>{controlsEnabled ? <button className="toolbar-dev" type="button" onClick={() => presenterStart.current()}>Present <kbd>P</kbd></button> : null}{controlsEnabled ? <button className="toolbar-dev" type="button" onClick={() => setFullScreen((value) => !value)}>{fullScreen ? "Exit full screen" : "Full screen"} <kbd>F</kbd></button> : null}<button className="toolbar-dev" onClick={() => setDevOpen((value) => !value)} aria-expanded={devOpen}>⌘ <span>Trace</span></button></header>
    {controlsEnabled ? <div className="control-strip"><TimeControls onTravel={(mode) => void runTimeTravel(mode)} onReseed={() => void doReseed()} message={toast} /><span className={`router-badge ${turns.at(-1)?.router.kind === "llm" ? "router-badge--llm" : ""}`}><i />{turns.at(-1)?.router.kind === "llm" ? "LLM · Bedrock" : "Deterministic"}{turns.at(-1)?.router.fallbackReason ? <small>{turns.at(-1)?.router.fallbackReason}</small> : null}</span></div> : null}
    <main className="sim-workspace"><section className="show-column"><EchoShow household={session.household} now={demoNow} idleCard={idleCard} cards={cards} speech={speech} state={light} listeningText={listeningText} charIndex={captionCharIndex} muted={muted} onMute={() => setMuted((value) => !value)} onAction={(action) => void cardAction(action)} onDismiss={() => { setLight("idle"); setCards([]); setSpeech(""); }} /><section className="voice-console" aria-label="Talk to Headsup"><div className="console-row">{micOkay ? <button className={`mic-button${light === "listening" ? " mic-button--active" : ""}`} type="button" aria-label="Hold to talk" aria-pressed={light === "listening"} disabled={busy} onMouseDown={beginListen} onMouseUp={() => recognition.current?.stop()} onMouseLeave={() => recognition.current?.stop()} onTouchStart={(event) => { event.preventDefault(); beginListen(); }} onTouchEnd={() => recognition.current?.stop()}>{light === "listening" ? "■" : "●"}</button> : null}<form onSubmit={(event) => void sendForm(event)}><input ref={input} aria-label="Say something to Headsup" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyboardSend} placeholder="Tell Headsup what's happening at home…" maxLength={400} disabled={busy} /><button type="submit" disabled={!draft.trim() || busy}>Send <span>↗</span></button></form></div>{!micOkay ? <p className="voice-note">Voice needs Chrome or Edge. Type instead.</p> : null}{error ? <p className="sim-error" role="alert">{error}</p> : null}<Suggestions items={session.suggestions} onSelect={(text) => void submitText(text, "chip")} /></section><Timeline turns={turns} /><div className="under-actions"><button onClick={() => setHostOpen(true)} disabled={!cards.length}>◫ Host view</button><button onClick={() => setDevOpen(true)}>⌘ Developer trace</button><span>{stateLine}</span></div></section><PhoneFrame householdId={session.household.householdId} refreshKey={refreshKey} browserUrl={browserUrl} onOpen={(href) => setBrowserUrl(href)} onCloseBrowser={() => setBrowserUrl(undefined)} /></main>
    {hostOpen && turns.at(-1) ? <McpAppHost result={turns.at(-1)!} onToolCall={hostTool} onOpen={(href) => setBrowserUrl(href)} onClose={() => setHostOpen(false)} /> : null}
    <DevDrawer turns={turns} open={devOpen} onClose={() => setDevOpen(false)} />
    {presenterOpen && visiblePresenterSteps[presenterIndex] ? <Presenter steps={visiblePresenterSteps} index={presenterIndex} result={presenterResult} busy={presenterBusy} onNext={() => void advancePresenter()} onBack={() => presenterBack.current()} onRestart={() => void startPresenter()} onSpeak={() => presenterSpeak.current()} onChip={() => void executePresenterStep(visiblePresenterSteps[presenterIndex]!)} /> : null}
  </div>;
}
