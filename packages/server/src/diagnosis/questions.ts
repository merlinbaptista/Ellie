import type { Candidate, CatalogEntry } from "@ellie/schema";
type SymptomType = CatalogEntry["symptoms"][number];

export interface DiagnosticQuestion { id: string; text: string; defaultValue: string }

function rankWithAnswer(candidates: Candidate[], symptom: SymptomType, questionId: string, answer: string): Candidate[] {
  return candidates.map((candidate) => {
    const cause = symptom.likelyCauses.find((entry) => entry.key === candidate.causeKey);
    return { ...candidate, score: Math.max(0, Math.min(1, candidate.score + (cause?.evidenceHints.answers[questionId]?.[answer] ?? 0))) };
  }).sort((left, right) => right.score - left.score);
}

export function pickQuestion(
  symptom: SymptomType,
  candidates: Candidate[],
  answers: Record<string, string>,
  askedFields: string[],
  itemId: string,
  questionCount: number,
): DiagnosticQuestion | null {
  if (questionCount >= 2 || candidates.length === 0) return null;
  const top = candidates[0]!;
  const gap = top.score - (candidates[1]?.score ?? 0);
  if (top.score >= 0.7 && gap >= 0.25) return null;
  let selected: { question: DiagnosticQuestion; changes: number } | undefined;
  for (const question of symptom.questions) {
    if (answers[question.id] !== undefined || askedFields.includes(`${itemId}:diag:${question.id}`)) continue;
    const baseline = top.causeKey;
    const changedAnswers = question.answers.filter((answer) => {
      const ranked = rankWithAnswer(candidates, symptom, question.id, answer);
      return ranked[0]?.causeKey !== baseline || (ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0) >= 0.15 && gap < 0.15;
    }).length;
    if (changedAnswers && (!selected || changedAnswers > selected.changes)) selected = { question: { id: question.id, text: question.text, defaultValue: "not sure" }, changes: changedAnswers };
  }
  return selected?.question ?? null;
}