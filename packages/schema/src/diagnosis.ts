import { z } from "zod";
import { zEventId, zHouseholdId, zIsoUtc, zItemId, zLocalDate } from "./primitives.js";
import { SafetyCategory } from "./enums.js";

export const EvidenceKind = z.enum([
  "component_overdue", "item_overdue", "same_symptom_before", "prior_resolution",
  "recent_service", "warranty", "answer", "no_history",
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const Evidence = z.object({
  evidenceId: z.string().regex(/^ev_[a-z0-9_-]{2,64}$/),
  kind: EvidenceKind,
  text: z.string().max(200),
  refId: z.string().optional(),
  localDate: zLocalDate.optional(),
  weight: z.number(),
  causeKeys: z.array(z.string()).default([]),
}).strict();
export type Evidence = z.infer<typeof Evidence>;

export const Candidate = z.object({
  causeKey: z.string(),
  description: z.string(),
  diy: z.boolean(),
  score: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
}).strict();
export type Candidate = z.infer<typeof Candidate>;

export const FixPlan = z.object({
  causeKey: z.string(),
  summary: z.string(),
  steps: z.array(z.string()),
  partsNeeded: z.array(z.string()),
  timeMinutes: z.number().int().positive().optional(),
  callProIf: z.array(z.string()),
  callProNow: z.boolean(),
  warranty: z.object({ status: z.enum(["valid", "expired", "unknown"]), until: zLocalDate.optional(), relevant: z.boolean() }).strict(),
  manualUrl: z.string().url().optional(),
  safetyNote: z.string().optional(),
}).strict();
export type FixPlan = z.infer<typeof FixPlan>;

export const Diagnosis = z.object({
  diagnosisId: z.string().regex(/^dgn_[a-z0-9-]{3,64}$/),
  householdId: zHouseholdId,
  itemId: zItemId,
  symptomKey: z.string(),
  status: z.enum(["needs_answer", "diagnosed", "needs_pro", "safety_stop", "unknown_symptom"]),
  safetyCategory: SafetyCategory.optional(),
  safetyEmergencyNumber: z.string().optional(),
  candidates: z.array(Candidate),
  evidence: z.array(Evidence),
  answers: z.record(z.string(), z.string()).default({}),
  pendingQuestionId: z.string().optional(),
  symptomEventId: zEventId.optional(),
  fixPlan: FixPlan.optional(),
  explanation: z.object({
    text: z.string().max(400),
    citedEvidenceIds: z.array(z.string()),
    source: z.enum(["llm", "deterministic"]),
    model: z.string().optional(),
  }).strict().optional(),
  createdAt: zIsoUtc,
  updatedAt: zIsoUtc,
  resolvedAt: zIsoUtc.optional(),
  questionCount: z.number().int().nonnegative().default(0),
}).strict();
export type Diagnosis = z.infer<typeof Diagnosis>;