import type { ReactNode } from "react";
import type { UiLanguage } from "./i18n/index.js";
import { t } from "./i18n/index.js";

export type StatusKind = "ok" | "due" | "due_soon" | "overdue" | "warning" | "info";
const visuals: Record<StatusKind, { icon: string; key: Parameters<typeof t>[0] }> = {
  ok: { icon: "✓", key: "status.ok" }, due: { icon: "◷", key: "status.due" }, due_soon: { icon: "◷", key: "status.due_soon" },
  overdue: { icon: "!", key: "status.overdue" }, warning: { icon: "⚠", key: "status.warning" }, info: { icon: "i", key: "status.info" },
};
export function StatusPill({ status, lang = "en" }: { status: StatusKind; lang?: UiLanguage }): ReactNode {
  const visual = visuals[status];
  return <span className={`ellie-status ellie-status--${status}`}><span aria-hidden="true">{visual.icon}</span><span>{t(visual.key, lang)}</span></span>;
}
