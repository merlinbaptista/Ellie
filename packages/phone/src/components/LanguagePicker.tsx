import { uiLanguage, type UiLanguage } from "@ellie/ui";

const labels: Record<UiLanguage, string> = { en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ", ta: "தமிழ்", es: "Español" };
export function LanguagePicker({ value, onChange }: { value: UiLanguage; onChange: (language: UiLanguage) => void }) {
  return <label className="language-picker"><span className="sr-only">Language</span><select aria-label="Language" value={value} onChange={(event) => onChange(uiLanguage(event.target.value))}>{Object.entries(labels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><span aria-hidden="true">⌄</span></label>;
}
