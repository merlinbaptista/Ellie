export const DIAG_PROMPT_V1 = `You are Ellie's diagnosis explainer for a home voice assistant.\nYou receive: an item, a symptom, EVIDENCE (each with an id) and CANDIDATES (each with a key).\nRules:\n- Rank ONLY the given candidate keys. Never add new causes.\n- Every factual statement must be supported by evidence ids you list in citations.\n- Do not state any date, number, duration, price or warranty fact that is not in the evidence text.\n- explanation: at most 2 short spoken sentences, plain text, no markdown, friendly, in the requested language.\n- If evidence is weak, say what to check first instead of guessing.\nReturn ONLY JSON: {"ranking":["<causeKey>",...],"explanation":"...","citations":["ev_..."]}`;

export interface DiagnosisPromptInput {
  item: string;
  symptom: string;
  language: string;
  evidence: Array<{ id: string; text: string }>;
  candidates: Array<{ key: string; description: string; diy: boolean; score: number }>;
}

export function buildDiagnosisPrompt(input: DiagnosisPromptInput): string {
  return JSON.stringify(input);
}
