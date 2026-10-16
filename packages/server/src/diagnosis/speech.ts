import type { Candidate, Evidence } from "@ellie/schema";

export interface DeterministicExplanation { text: string; citedEvidenceIds: string[] }
export function deterministicExplanation(candidate: Candidate | undefined, evidence: Evidence[]): DeterministicExplanation {
  if (!candidate) return { text: "I've noted the problem. I don't have enough evidence to identify a likely cause yet.", citedEvidenceIds: [] };
  const supporting = candidate.evidenceIds.map((id) => evidence.find((item) => item.evidenceId === id)).filter((item): item is Evidence => Boolean(item));
  const strongest = [...supporting].sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))[0];
  const priorFix = evidence.find((item) => item.kind === "prior_resolution" && item.causeKeys.includes(candidate.causeKey));
  const sameSymptom = priorFix ? evidence.find((item) => item.kind === "same_symptom_before" && item.causeKeys.includes(candidate.causeKey)) : undefined;
  const warranty = evidence.find((item) => item.kind === "warranty");
  const citedEvidenceIds = [strongest?.evidenceId, sameSymptom?.evidenceId, priorFix?.evidenceId, warranty?.evidenceId].filter((id): id is string => Boolean(id));
  const first = strongest ? `Most likely ${candidate.description.toLowerCase()} — ${strongest.text}.` : `Most likely ${candidate.description.toLowerCase()}.`;
  const second = [sameSymptom?.text, priorFix?.text, warranty?.text].filter(Boolean).join("; ");
  return { text: `${first}${second ? ` ${second}.` : ""}`.slice(0, 400), citedEvidenceIds };
}
