import { useState } from "react";
import { t, type UiLanguage } from "@ellie/ui";

function readSteps(key: string, count: number): number[] {
  try { return (JSON.parse(localStorage.getItem(key) ?? "[]") as number[]).filter((value) => Number.isInteger(value) && value >= 0 && value < count); } catch { return []; }
}
export function StepList({ steps, refId, lang }: { steps: string[]; refId: string; lang: UiLanguage }) {
  const key = `ellie.steps.${refId}`;
  const [checked, setChecked] = useState<number[]>(() => readSteps(key, steps.length));
  function toggle(index: number) {
    const next = checked.includes(index) ? checked.filter((value) => value !== index) : [...checked, index].sort((a, b) => a - b);
    setChecked(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  return <section className="phone-section phone-steps"><div className="section-heading"><h2>{t("heading.steps", lang)}</h2><span>{t("progress.steps", lang, { done: checked.length, total: steps.length })}</span></div><ol>{steps.map((step, index) => <li key={`${index}-${step}`} className={checked.includes(index) ? "is-checked" : ""}><label><input type="checkbox" checked={checked.includes(index)} onChange={() => toggle(index)} /><span>{step}</span></label></li>)}</ol></section>;
}
