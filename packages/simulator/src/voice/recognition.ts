export interface RecognitionResult { transcript: string; final: boolean }
export interface RecognitionOptions { lang: string; onResult: (result: RecognitionResult) => void; onError: (message: string) => void; onEnd: (sttMs: number) => void }
interface SpeechRecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> }
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type RecognitionWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
export function recognitionSupported(): boolean {
  const browser = window as RecognitionWindow;
  return Boolean(browser.SpeechRecognition ?? browser.webkitSpeechRecognition);
}
export function startRecognition(options: RecognitionOptions): { stop: () => void; abort: () => void } | null {
  const browser = window as RecognitionWindow;
  const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  if (!Constructor) return null;
  const recognition = new Constructor();
  const started = performance.now();
  recognition.lang = options.lang;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index]!;
      options.onResult({ transcript: result[0].transcript, final: result.isFinal });
    }
  };
  recognition.onerror = (event) => options.onError(event.error === "not-allowed" ? "Microphone permission was denied. Type instead." : "Voice recognition stopped. Type instead.");
  recognition.onend = () => options.onEnd(Math.round(performance.now() - started));
  recognition.start();
  return { stop: () => recognition.stop(), abort: () => recognition.abort() };
}
