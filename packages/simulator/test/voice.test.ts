import { afterEach, describe, expect, it, vi } from "vitest";
import { recognitionSupported, startRecognition } from "../src/voice/recognition.js";
import { speak } from "../src/voice/synthesis.js";

afterEach(() => { vi.unstubAllGlobals(); });
describe("simulator voice adapters", () => {
  it("handles interim/final recognition and permission denial", () => {
    class Recognition {
      static current: Recognition;
      lang = ""; interimResults = false; continuous = true; maxAlternatives = 0;
      onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null; onend: (() => void) | null = null;
      constructor() { Recognition.current = this; }
      start() {} stop() {} abort() {}
    }
    vi.stubGlobal("SpeechRecognition", Recognition);
    expect(recognitionSupported()).toBe(true);
    const received: string[] = []; const errors: string[] = []; const ended = vi.fn();
    startRecognition({ lang: "en-IN", onResult: (result) => received.push(`${result.transcript}:${result.final}`), onError: (message) => errors.push(message), onEnd: ended });
    const instance = Recognition.current;
    instance.onerror?.({ error: "not-allowed" });
    expect(errors[0]).toContain("permission was denied");
    instance.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "the gas" } }, { isFinal: true, 0: { transcript: "the gas changed" } }] });
    expect(received).toEqual(["the gas:false", "the gas changed:true"]);
    instance.onend?.();
    expect(ended).toHaveBeenCalledOnce();
  });

  it("selects the matching voice and cancels active speech on a new utterance", () => {
    class Utterance { lang = ""; rate = 0; voice: unknown = null; onboundary: ((event: { charIndex: number }) => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
    const voices = [{ lang: "en-US", default: true }, { lang: "en-IN", default: false }];
    const synthesis = { cancel: vi.fn(), pause: vi.fn(), speak: vi.fn(), getVoices: () => voices };
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    vi.stubGlobal("speechSynthesis", synthesis);
    const boundary = vi.fn(); const ended = vi.fn();
    speak("Hello", "en-IN", false, boundary, ended);
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(synthesis.speak).toHaveBeenCalledOnce();
    const utterance = synthesis.speak.mock.calls[0]?.[0] as Utterance;
    expect(utterance.voice).toBe(voices[1]);
    utterance.onboundary?.({ charIndex: 2 }); utterance.onend?.();
    expect(boundary).toHaveBeenCalledWith(2); expect(ended).toHaveBeenCalledOnce();
  });
});
