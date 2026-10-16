import { diffDays, formatLocalDate, type CatalogEntry, type HomeEvent, type Item, type Prediction, type RegionPack, type Resolution } from "@ellie/schema";
import type { Evidence } from "@ellie/schema";

export interface EvidenceInput {
  item: Item;
  catalog?: CatalogEntry;
  symptomKey: string;
  events: HomeEvent[];
  resolutions: Resolution[];
  predictions: Prediction[];
  warranty: { status: "valid" | "expired" | "unknown"; daysLeft?: number };
  answers: Record<string, string>;
  todayLocal: string;
  pack: RegionPack;
}

export function buildEvidence(input: EvidenceInput): Evidence[] {
  const evidence: Evidence[] = [];
  for (const prediction of input.predictions) {
    if (prediction.status !== "overdue" || prediction.daysUntilDue >= 0) continue;
    const component = prediction.component ? input.catalog?.components.find((part) => part.key === prediction.component) : undefined;
    const componentKey = prediction.component;
    const overdueDays = Math.abs(prediction.daysUntilDue);
    const months = Math.max(1, Math.round(overdueDays / 30));
    evidence.push({
      evidenceId: componentKey ? `ev_overdue_${componentKey}` : "ev_overdue_item",
      kind: componentKey ? "component_overdue" : "item_overdue",
      text: `${component?.displayName ?? input.catalog?.displayName ?? "Home item"} is about ${months} months overdue`,
      refId: componentKey ?? input.item.itemId,
      localDate: prediction.nextDueLocal ?? undefined,
      weight: overdueDays > 60 ? 0.45 : 0.35,
      causeKeys: componentKey
        ? (input.catalog?.symptoms.find((symptom) => symptom.key === input.symptomKey)?.likelyCauses.filter((cause) => cause.evidenceHints.componentOverdue === componentKey).map((cause) => cause.key) ?? [])
        : (input.catalog?.symptoms.find((symptom) => symptom.key === input.symptomKey)?.likelyCauses.filter((cause) => cause.key.endsWith("_overdue") && !cause.evidenceHints.componentOverdue).map((cause) => cause.key) ?? []),
    });
  }

  const sameSymptoms = input.events.filter((event) => event.type === "symptom" && event.symptom?.key === input.symptomKey).sort((left, right) => right.localDate.localeCompare(left.localDate));
  const matchingResolutions = input.resolutions.filter((resolution) => resolution.symptomKey === input.symptomKey).sort((left, right) => right.localDate.localeCompare(left.localDate));
  for (const event of sameSymptoms) {
    evidence.push({
      evidenceId: `ev_symptom_${event.eventId}`,
      kind: "same_symptom_before",
      text: `Same ${input.symptomKey.replaceAll("_", " ")} on ${formatLocalDate(event.localDate, input.pack, "speech")}`,
      refId: event.eventId,
      localDate: event.localDate,
      weight: 0.1,
      causeKeys: [],
    });
  }
  for (const resolution of matchingResolutions) {
    const componentPrediction = resolution.component ? input.predictions.find((prediction) => prediction.component === resolution.component) : undefined;
    const replacedDaysAgo = diffDays(resolution.localDate, input.todayLocal);
    const newerAndNotOverdue = Boolean(resolution.component && replacedDaysAgo < 365 && componentPrediction && componentPrediction.status !== "overdue");
      const priorCause = input.catalog?.symptoms.flatMap((symptom) => symptom.likelyCauses).find((cause) => cause.key === resolution.causeKey);
      evidence.push({
      evidenceId: `ev_res_${resolution.resolutionId}`,
      kind: "prior_resolution",
        text: `${priorCause ? `A prior ${priorCause.description.toLowerCase()} was resolved` : "A related issue was resolved"} on ${formatLocalDate(resolution.localDate, input.pack, "speech")}`,
      refId: resolution.resolutionId,
      localDate: resolution.localDate,
      weight: newerAndNotOverdue ? 0 : 0.15,
      causeKeys: resolution.causeKey ? [resolution.causeKey] : [],
    });
  }
  for (const event of input.events.filter((candidate) => ["serviced", "changed"].includes(candidate.type) && diffDays(candidate.localDate, input.todayLocal) >= 0 && diffDays(candidate.localDate, input.todayLocal) < 14)) {
    const affected = input.catalog?.symptoms.find((symptom) => symptom.key === input.symptomKey)?.likelyCauses.filter((cause) => cause.relatedComponent === event.component || (!cause.relatedComponent && !event.component)).map((cause) => cause.key) ?? [];
    evidence.push({
      evidenceId: `ev_recent_${event.eventId}`,
      kind: "recent_service",
      text: `Serviced ${diffDays(event.localDate, input.todayLocal)} days ago`,
      refId: event.eventId,
      localDate: event.localDate,
      weight: -0.2,
      causeKeys: affected,
    });
  }
  if (input.warranty.status !== "unknown") {
    evidence.push({
      evidenceId: "ev_warranty",
      kind: "warranty",
      text: input.warranty.status === "valid" && input.item.warrantyUntil
        ? `Warranty valid until ${formatLocalDate(input.item.warrantyUntil, input.pack, "speech")}`
        : "Warranty has expired",
      localDate: input.item.warrantyUntil,
      weight: 0,
      causeKeys: [],
    });
  }
  for (const [questionId, answer] of Object.entries(input.answers)) {
    const causeKeys = input.catalog?.symptoms.find((symptom) => symptom.key === input.symptomKey)?.likelyCauses.filter((cause) => cause.evidenceHints.answers[questionId]?.[answer] !== undefined).map((cause) => cause.key) ?? [];
    const deltas = input.catalog?.symptoms.find((symptom) => symptom.key === input.symptomKey)?.likelyCauses.flatMap((cause) => {
      const weight = cause.evidenceHints.answers[questionId]?.[answer];
      return weight === undefined ? [] : [weight];
    }) ?? [];
    evidence.push({
      evidenceId: `ev_answer_${questionId}`,
      kind: "answer",
      text: `${questionId.replaceAll("_", " ")}: ${answer}`,
      weight: deltas.length ? Math.max(...deltas.map(Math.abs)) : 0,
      causeKeys,
    });
  }
  if (input.events.length === 0) evidence.push({ evidenceId: "ev_no_history", kind: "no_history", text: "No history for this item yet", weight: 0, causeKeys: [] });
  return evidence;
}
