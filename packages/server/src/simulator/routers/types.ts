export interface PlannedCall { tool: string; args: Record<string, unknown>; fragment: string }
export interface RouterResult { calls: PlannedCall[]; kind: "llm" | "deterministic"; ms: number; fallbackReason?: string; localSpeech?: string; state?: "done" | "not_understood" | "awaiting_answer" }
export interface SimRouterContext {
  householdId: string;
  lastItem?: string;
  lastDiagnosisId?: string;
  lastCauseKey?: string;
  lastTool?: string;
  offeredTool?: PlannedCall;
  lastDiagnosisAt?: number;
  language: string;
  privateValues?: string[];
}
