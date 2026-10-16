import { addDays, diffDays } from "@ellie/schema";
import type { Prediction } from "@ellie/schema";

export type PredictionStatus = Prediction["status"];
export function predictionStatus(todayLocal: string, nextDueLocal: string | null, remindOnLocal: string | null, windowDays = 7): { status: PredictionStatus; daysUntilDue: number } {
  if (!nextDueLocal || !remindOnLocal) return { status: "unknown", daysUntilDue: 0 };
  const daysUntilDue = diffDays(todayLocal, nextDueLocal);
  if (daysUntilDue < 0) return { status: "overdue", daysUntilDue };
  if (remindOnLocal <= todayLocal) return { status: "due", daysUntilDue };
  if (remindOnLocal <= addDays(todayLocal, windowDays)) return { status: "due_soon", daysUntilDue };
  return { status: "ok", daysUntilDue };
}
