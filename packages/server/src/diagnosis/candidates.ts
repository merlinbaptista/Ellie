import type { Candidate, CatalogEntry, Evidence } from "@ellie/schema";
type SymptomType = CatalogEntry["symptoms"][number];

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function normalize(candidates: Candidate[]): Candidate[] {
  const max = Math.max(0, ...candidates.map((candidate) => candidate.score));
  const scale = max > 0.95 ? 0.95 / max : 1;
  return candidates
    .map((candidate) => ({ ...candidate, score: Math.round(clamp(candidate.score * scale) * 1000) / 1000 }))
    .sort((left, right) => right.score - left.score);
}

export function buildCandidates(symptom: SymptomType | undefined, catalog: CatalogEntry | undefined, evidence: Evidence[], answers: Record<string, string> = {}): Candidate[] {
  if (!symptom) {
    const generic: Candidate[] = evidence.filter((item) => item.kind === "component_overdue" || item.kind === "item_overdue").map((item) => ({
      causeKey: item.refId ? `${item.refId}_overdue` : "item_overdue",
      description: "Check the overdue maintenance item",
      diy: true,
      score: clamp(0.3 + item.weight),
      evidenceIds: [item.evidenceId],
    }));
    return normalize(generic);
  }
  const candidates = symptom.likelyCauses.map((cause, index) => {
    let score = 0.3 + Math.max(0, 0.05 - index * 0.025);
    const evidenceIds: string[] = [];
    for (const item of evidence) {
      if (item.kind === "answer") continue;
      if (item.causeKeys.includes(cause.key)) {
        score += item.weight;
        evidenceIds.push(item.evidenceId);
      }
    }
    for (const [questionId, answer] of Object.entries(answers)) score += cause.evidenceHints.answers[questionId]?.[answer] ?? 0;
    return { causeKey: cause.key, description: cause.description, diy: cause.diy, score, evidenceIds };
  });
  return normalize(candidates);
}