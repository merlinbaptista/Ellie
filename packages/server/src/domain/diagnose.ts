import { Diagnosis, matchCatalog, matchSymptom, newSortableId, toLocalDate, warrantyStatus } from "@ellie/schema";
import type { Candidate, Diagnosis as DiagnosisRecord, DiagnoseInput } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { resolveHouseholdId, getOrCreateHousehold } from "./households.js";
import { resolveItem } from "./items.js";
import { checkSafety } from "../diagnosis/safety.js";
import { buildEvidence } from "../diagnosis/evidence.js";
import { buildCandidates } from "../diagnosis/candidates.js";
import { pickQuestion } from "../diagnosis/questions.js";
import { buildFixPlan } from "../diagnosis/fixPlan.js";
import { rankDiagnosis } from "../diagnosis/llmRanker.js";
import { logEvent } from "./events.js";
import { loadHouseholdSnapshot } from "./snapshot.js";
import { recomputeItem } from "./predictions.js";

export interface DiagnoseOutcome {
  diagnosis: DiagnosisRecord;
  item: Awaited<ReturnType<typeof resolveItem>>["item"];
  speech: string;
  followUp?: { field: string; question: string; defaultValue?: string; retry: { tool: string; argName: string; args: Record<string, unknown> } };
  safety?: { level: "stop"; message: string; emergencyNumber: string };
}

function normalizeAnswer(raw: string, choices: string[]): string {
  const normalized = raw.trim().toLowerCase();
  const exact = choices.find((choice) => choice.toLowerCase() === normalized);
  if (exact) return exact;
  const matches = choices.filter((choice) => {
    const pattern = choice.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${pattern}\\b`, "i").test(normalized);
  });
  if (matches.length === 1) return matches[0]!;
  return choices.find((choice) => choice.toLowerCase() === "not sure") ?? choices[0]!;
}

export async function diagnose(ctx: AppContext, input: DiagnoseInput): Promise<DiagnoseOutcome> {
  const householdId = resolveHouseholdId(input.householdId, ctx);
  const existingHousehold = await ctx.repositories.households.get(householdId);
  const pack = ctx.regions.get(existingHousehold?.regionPackId ?? "DEFAULT");

  // Safety uses the spoken phrase and catalog match before any item creation or LLM work.
  const possibleItem = matchCatalog(input.item, pack)[0];
  const possibleEntry = possibleItem ? pack.catalog[possibleItem.catalogKey] : undefined;
  const safety = checkSafety(`${input.item} ${input.symptom}`, possibleEntry, pack);
  if (safety) {
    const logged = await logEvent({ householdId, item: input.item, type: "symptom", symptom: input.symptom }, ctx);
    const now = ctx.clock.now().toISOString();
    const diagnosisId = input.diagnosisId ?? newSortableId("dgn", ctx.clock.now());
    const diagnosis = Diagnosis.parse({
      diagnosisId, householdId, itemId: logged.item.itemId, symptomKey: safety.symptomKey ?? "safety_stop", status: "safety_stop",
      candidates: [], evidence: [], answers: {}, createdAt: now, updatedAt: now,
    });
    await ctx.repositories.diagnoses.put(householdId, diagnosis, ctx.env.DIAGNOSIS_SESSION_TTL_HOURS);
    return { diagnosis, item: logged.item, speech: safety.message, safety: { level: "stop", message: safety.message, emergencyNumber: safety.emergencyNumber } };
  }

  const household = existingHousehold ?? await getOrCreateHousehold(householdId, ctx);
  const resolved = await resolveItem(household, input.item, {}, ctx);
  const item = resolved.item;
  const catalog = pack.catalog[item.catalogKey];
  const matchedSymptom = catalog ? matchSymptom(input.symptom, catalog) : null;
  const symptom = matchedSymptom ? catalog?.symptoms.find((candidate) => candidate.key === matchedSymptom.key) : undefined;
  const now = ctx.clock.now();
  const nowIso = now.toISOString();
  const timezone = household.timeZone ?? pack.locale.defaultTimeZone;
  const todayLocal = toLocalDate(nowIso, timezone);
  let session = input.diagnosisId ? await ctx.repositories.diagnoses.get(householdId, input.diagnosisId) : null;
  if (!session) session = await ctx.repositories.diagnoses.findOpen(householdId, item.itemId, symptom?.key ?? input.symptom, new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString());
  const diagnosisId = session?.diagnosisId ?? newSortableId("dgn", now);
  const answers: Record<string, string> = { ...(session?.answers ?? {}) };
  for (const question of symptom?.questions ?? []) {
    const answer = input.answers?.[question.id];
    if (answer) answers[question.id] = normalizeAnswer(answer, question.answers);
  }
  if (input.answer && session?.pendingQuestionId) {
    const pendingQuestion = symptom?.questions.find((question) => question.id === session.pendingQuestionId);
    if (pendingQuestion) answers[pendingQuestion.id] = normalizeAnswer(input.answer, pendingQuestion.answers);
  }

  let symptomEventId = session?.symptomEventId;
  if (!symptomEventId) {
    const logged = await logEvent({ householdId, item: input.item, type: "symptom", symptom: input.symptom }, ctx);
    symptomEventId = logged.event?.eventId;
  }
  const snapshot = await loadHouseholdSnapshot(householdId, ctx);
  const events = snapshot.eventsByItem.get(item.itemId) ?? [];
  const priorEvents = events.filter((event) => event.eventId !== symptomEventId);
  const resolutions = snapshot.resolutions.filter((resolution) => resolution.itemId === item.itemId);
  const livePredictions = await recomputeItem(ctx, householdId, item.itemId, { schedule: false });
  const predictions = [livePredictions.main, ...livePredictions.components].filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction));
  const warranty = item.warrantyUntil ? warrantyStatus(item, todayLocal) : { status: "unknown" as const };
  const evidence = buildEvidence({ item, ...(catalog ? { catalog } : {}), symptomKey: symptom?.key ?? input.symptom, events: priorEvents, resolutions, predictions, warranty, answers, todayLocal, pack });
  const candidates = buildCandidates(symptom, catalog, evidence, answers);
  const askedFields = (await ctx.repositories.households.get(householdId))?.askedFields ?? [];
  const question = symptom ? pickQuestion(symptom, candidates, answers, askedFields, item.itemId, session?.questionCount ?? 0) : null;
  const base = {
    diagnosisId, householdId, itemId: item.itemId, symptomKey: symptom?.key ?? input.symptom,
    candidates, evidence, answers, ...(symptomEventId ? { symptomEventId } : {}),
    createdAt: session?.createdAt ?? nowIso, updatedAt: nowIso, questionCount: session?.questionCount ?? 0,
  };
  if (question) {
    const diagnosis = Diagnosis.parse({ ...base, status: "needs_answer", pendingQuestionId: question.id, questionCount: (session?.questionCount ?? 0) + 1 });
    await ctx.repositories.diagnoses.put(householdId, diagnosis, ctx.env.DIAGNOSIS_SESSION_TTL_HOURS);
    const askedKey = `${item.itemId}:diag:${question.id}`;
    if (!askedFields.includes(askedKey)) await ctx.repositories.households.put({ ...household, askedFields: [...askedFields, askedKey] });
    return {
      diagnosis, item, speech: `Let's check one thing. ${question.text}`,
      followUp: { field: "answer", question: question.text, defaultValue: question.defaultValue, retry: { tool: "diagnose", argName: "answer", args: { householdId, diagnosisId, item: input.item, symptom: input.symptom } } },
    };
  }

  const ranked = await rankDiagnosis({
    ctx, householdId, item: catalog?.displayName ?? "home item", symptomKey: symptom?.key ?? "other_symptom", language: household.language ?? pack.locale.defaultLanguage, candidates, evidence,
    onBackgroundResult: async (refined) => {
      const current = await ctx.repositories.diagnoses.get(householdId, diagnosisId);
      if (current?.status === "diagnosed") await ctx.repositories.diagnoses.put(householdId, { ...current, explanation: { text: refined.explanation, citedEvidenceIds: refined.citedEvidenceIds, source: "llm", model: refined.model }, updatedAt: ctx.clock.now().toISOString() }, ctx.env.DIAGNOSIS_SESSION_TTL_HOURS);
    },
  });
  const topCause = ranked.ranking.map((key) => candidates.find((candidate) => candidate.causeKey === key)).find(Boolean) as Candidate | undefined;
  const rankedCandidates = ranked.ranking.map((key) => candidates.find((candidate) => candidate.causeKey === key)).filter((candidate): candidate is Candidate => Boolean(candidate));
  const fixPlan = topCause ? buildFixPlan({ causeKey: topCause.causeKey, item, ...(catalog ? { catalog } : {}), pack, todayLocal, prediction: predictions.find((prediction) => prediction.component === catalog?.symptoms.find((entry) => entry.key === symptom?.key)?.likelyCauses.find((cause) => cause.key === topCause.causeKey)?.relatedComponent) }) : undefined;
  const explanation = { text: ranked.explanation, citedEvidenceIds: ranked.citedEvidenceIds, source: ranked.source, ...(ranked.model ? { model: ranked.model } : {}) };
  const diagnosis = Diagnosis.parse({ ...base, candidates: rankedCandidates, status: candidates.length ? "diagnosed" : "unknown_symptom", ...(fixPlan ? { fixPlan } : {}), explanation, pendingQuestionId: undefined });
  await ctx.repositories.diagnoses.put(householdId, diagnosis, ctx.env.DIAGNOSIS_SESSION_TTL_HOURS);
  return { diagnosis, item, speech: ranked.explanation };
}
