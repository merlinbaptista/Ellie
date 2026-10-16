import type { ReactNode } from "react";
export function Caption({ text, listeningText, charIndex = -1 }: { text: string; listeningText?: string; charIndex?: number }): ReactNode {
  if (listeningText) return <p className="echo-caption" aria-live="polite">{listeningText}</p>;
  if (!text || charIndex < 0) return <p className="echo-caption" aria-live="polite">{text || "Say what's happening at home."}</p>;
  const start = text.lastIndexOf(" ", charIndex) + 1;
  const end = text.indexOf(" ", charIndex);
  return <p className="echo-caption" aria-live="polite">{text.slice(0, start)}<span className="caption-current-word">{text.slice(start, end < 0 ? text.length : end)}</span>{end < 0 ? "" : text.slice(end)}</p>;
}
