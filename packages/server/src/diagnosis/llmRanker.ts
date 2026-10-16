import { z } from "zod";
import type { Candidate, Evidence } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { DIAG_PROMPT_V1, buildDiagnosisPrompt } from "./prompt.js";
import { deterministicExplanation } from "./speech.js";

const LlmDiagnosis = z.object({ ranking: z.array(z.string()), explanation: z.string().max(400), citations: z.array(z.string()) }).strict();
export interface RankedDiagnosis { ranking: string[]; explanation: string; citedEvidenceIds: string[]; source: "llm" | "deterministic"; model?: string; latencyMs?: number; fallbackReason?: string }
const monthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
const numericPattern = /\d+|[$£€₹]/g;
const fallbackTimes: number[] = [];
const backgroundWork = new Set<Promise<void>>();
let lastLlmLatencyMs = 0;
export async function flushBackgroundWork(): Promise<void> {
  await Promise.allSettled([...backgroundWork]);
}

export function getLlmDiagnostics(now = Date.now()): { lastLatencyMs: number; fallbacks24h: number } {
  while (fallbackTimes.length && fallbackTimes[0]! < now - 24 * 60 * 60 * 1000) fallbackTimes.shift();
  return { lastLatencyMs: lastLlmLatencyMs, fallbacks24h: fallbackTimes.length };
}

export function validateLlmDiagnosis(raw: string, candidates: Candidate[], evidence: Evidence[]): { ranking: string[]; explanation: string; citations: string[] } {
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(raw); } catch { throw new Error("invalid_json"); }
  const parsed = LlmDiagnosis.safeParse(parsedJson);
  if (!parsed.success) throw new Error("invalid_shape");
  const candidateKeys = new Set(candidates.map((candidate) => candidate.causeKey));
  if (parsed.data.ranking.some((key) => !candidateKeys.has(key))) throw new Error("invented_candidate");
  if (!parsed.data.ranking.length) throw new Error("empty_ranking");
  const validIds = new Set(evidence.map((item) => item.evidenceId));
  if (!parsed.data.citations.length || parsed.data.citations.some((id) => !validIds.has(id))) throw new Error("invalid_citations");
  const citations = evidence.filter((item) => parsed.data.citations.includes(item.evidenceId));
  const allCitedText = citations.map((item) => item.text.toLowerCase()).join(" ");
  const tokens = [...parsed.data.explanation.matchAll(numericPattern), ...parsed.data.explanation.matchAll(monthPattern)].map((match) => match[0].toLowerCase());
  if (tokens.some((token) => !allCitedText.includes(token))) throw new Error("uncited_fact");
  if ((parsed.data.explanation.match(/[.!?](?:\s|$)/g) ?? []).length > 2) throw new Error("too_many_sentences");
  const top = candidates.find((candidate) => candidate.causeKey === parsed.data.ranking[0]);
  const bestCandidate = [...candidates].sort((left, right) => right.score - left.score)[0];
  if (top && bestCandidate && top.causeKey !== bestCandidate.causeKey && top.score < 0.2) throw new Error("low_score_veto");
  const ranking = [...parsed.data.ranking, ...candidates.map((candidate) => candidate.causeKey).filter((key) => !parsed.data.ranking.includes(key))];
  return { ranking, explanation: parsed.data.explanation, citations: parsed.data.citations };
}

export async function rankDiagnosis(input: {
  ctx: AppContext;
  householdId: string;
  item: string;
  symptomKey: string;
  language: string;
  candidates: Candidate[];
  evidence: Evidence[];
  onBackgroundResult?: (result: RankedDiagnosis) => Promise<void> | void;
}): Promise<RankedDiagnosis> {
  const fallbackCandidate = input.candidates[0];
  const fallback = deterministicExplanation(fallbackCandidate, input.evidence);
  const fallbackResult: RankedDiagnosis = { ranking: input.candidates.map((candidate) => candidate.causeKey), explanation: fallback.text, citedEvidenceIds: fallback.citedEvidenceIds, source: "deterministic" };
  if (!input.candidates.length || !input.evidence.length) return fallbackResult;
  const promptInput = {
    item: input.item,
    symptom: /^[a-z][a-z0-9_]{0,63}$/.test(input.symptomKey) ? input.symptomKey : "other_symptom",
    language: input.language.split("-")[0] || "en",
    evidence: input.evidence.map(({ evidenceId, text }) => ({ id: evidenceId, text })),
    candidates: input.candidates.map(({ causeKey, description, diy, score }) => ({ key: causeKey, description, diy, score })),
  };
  const started = performance.now();
  const request = (signal: AbortSignal) => input.ctx.llm.complete({
    system: DIAG_PROMPT_V1,
    messages: [{ role: "user", content: buildDiagnosisPrompt(promptInput) }],
    responseFormat: "json",
    maxTokens: 300,
    temperature: 0.2,
    signal,
  });
  const voiceController = new AbortController();
  const voicePromise = request(voiceController.signal);
  void voicePromise.catch(() => undefined);
  let voiceTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { voiceTimer = setTimeout(() => reject(new Error("voice_timeout")), input.ctx.env.LLM_VOICE_TIMEOUT_MS); });
    const result = await Promise.race([voicePromise, timeout]);
    lastLlmLatencyMs = result.latencyMs;
    const validated = validateLlmDiagnosis(result.text, input.candidates, input.evidence);
    return { ranking: validated.ranking, explanation: validated.explanation, citedEvidenceIds: validated.citations, source: "llm", model: result.model, latencyMs: result.latencyMs };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : "llm_error";
    fallbackTimes.push(Date.now());
    lastLlmLatencyMs = Math.round(performance.now() - started);
    if (fallbackReason === "voice_timeout") {
      voiceController.abort();
      const backgroundController = new AbortController();
      const backgroundTimer = setTimeout(() => backgroundController.abort(), input.ctx.env.LLM_BACKGROUND_TIMEOUT_MS);
      const work = request(backgroundController.signal).then(async (result) => {
        lastLlmLatencyMs = result.latencyMs;
        const validated = validateLlmDiagnosis(result.text, input.candidates, input.evidence);
        await input.onBackgroundResult?.({ ranking: validated.ranking, explanation: validated.explanation, citedEvidenceIds: validated.citations, source: "llm", model: result.model, latencyMs: result.latencyMs });
      }).catch((backgroundError) => input.ctx.logger.warn({ tool: "diagnose", fallbackReason: backgroundError instanceof Error ? backgroundError.message : "background_error" }, "llm.background_refinement_failed")).finally(() => clearTimeout(backgroundTimer));
      backgroundWork.add(work);
      void work.finally(() => backgroundWork.delete(work));
    } else {
      voiceController.abort();
    }
    input.ctx.logger.warn({ tool: "diagnose", llmMs: Math.round(performance.now() - started), llmUsed: false, fallbackReason }, "llm.rejected");
    return { ...fallbackResult, fallbackReason };
  } finally {
    if (voiceTimer) clearTimeout(voiceTimer);
  }
}
