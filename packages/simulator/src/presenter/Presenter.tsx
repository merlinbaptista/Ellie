import type { ReactNode } from "react";
import type { PresenterStep } from "./types.js";

export interface PresenterResult { ok: boolean; reason: string }

export function Presenter({ steps, index, result, busy, onNext, onBack, onRestart, onSpeak, onChip }: {
  steps: PresenterStep[];
  index: number;
  result?: PresenterResult;
  busy: boolean;
  onNext: () => void;
  onBack: () => void;
  onRestart: () => void;
  onSpeak: () => void;
  onChip: () => void;
}): ReactNode {
  const step = steps[index];
  if (!step) return null;
  const sayStep = step.action.kind === "say";
  return <aside className="presenter-bar" aria-label="Presenter controls">
    <div className="presenter-context">
      <span className="presenter-count">{index + 1} / {steps.length}</span>
      <strong>{step.title}</strong>
      {step.presenterNote ? <p>{step.presenterNote}</p> : null}
    </div>
    {result ? <span role="img" className={`presenter-result ${result.ok ? "presenter-result--ok" : "presenter-result--fail"}`} title={result.reason || "All expectations met"} aria-label={result.ok ? "Step passed" : `Step failed: ${result.reason}`}>
      {result.ok ? "✔" : "✖"}
    </span> : null}
    <div className="presenter-actions">
      {sayStep ? <>
        <button type="button" disabled={busy} onClick={onSpeak}>Speak now</button>
        <button type="button" disabled={busy} onClick={onChip}>Use chip</button>
      </> : null}
      <button type="button" disabled={busy || index === 0} onClick={onBack}>Back</button>
      <button type="button" disabled={busy} onClick={onNext}>Next <kbd>→</kbd></button>
      <button type="button" disabled={busy} onClick={onRestart}>Restart</button>
    </div>
  </aside>;
}
