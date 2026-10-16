export interface SpeechHandle { cancel: () => void; pause: () => void }
export function speak(text: string, lang: string, muted: boolean, onBoundary: (charIndex: number) => void, onEnd: () => void): SpeechHandle | null {
  if (muted || !("speechSynthesis" in window)) { onEnd(); return null; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.split("-")[0]?.toLowerCase();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === lang.toLowerCase())
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(`${prefix}-`))
    ?? voices.find((voice) => voice.default)
    ?? null;
  utterance.onboundary = (event) => onBoundary(event.charIndex);
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return { cancel: () => window.speechSynthesis.cancel(), pause: () => window.speechSynthesis.pause() };
}
export function cancelSpeech(): void { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }
