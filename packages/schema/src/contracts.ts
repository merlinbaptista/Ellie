import { z } from "zod";
import { EventType } from "./enums.js";
import { zHouseholdId } from "./primitives.js";

const householdId = zHouseholdId.optional().describe("Household identifier, if already known");
const item = z.string().describe("What the user called the thing, such as gas, purifier, or AC filter");
const schemas = {
  setup_household: z.object({ householdId, country: z.string().length(2).optional().describe("Two-letter country code"), region: z.string().max(80).optional().describe("City or postcode only, never a full address"), timeZone: z.string().optional().describe("Household IANA time zone"), language: z.string().optional().describe("Spoken language tag"), phoneLanguage: z.string().optional().describe("Phone page language tag"), phone: z.string().optional().describe("Phone number, only with consent"), email: z.string().email().optional().describe("Email address, only with consent"), consent: z.boolean().optional().describe("Whether the person consents to saving contact details") }).strict(),
  log_event: z.object({ householdId, item, type: EventType.describe("What happened to the household item"), when: z.string().optional().describe("When it happened, as a date or relative phrase"), notes: z.string().max(500).optional().describe("Additional details"), cost: z.number().nonnegative().optional().describe("Amount spent"), symptom: z.string().optional().describe("Problem or symptom reported"), providerKey: z.string().optional().describe("Known provider identifier") }).strict(),
  get_history: z.object({ householdId, item: item.optional(), period: z.enum(["30d", "90d", "1y", "all"]).default("1y").describe("How far back to search"), types: z.array(EventType).optional().describe("Limit to these event types") }).strict(),
  predict_next: z.object({ householdId, item }).strict(),
  diagnose: z.object({ householdId, item, symptom: z.string().describe("Reported problem"), answers: z.record(z.string(), z.string()).optional().describe("Answers already supplied to diagnosis questions") }).strict(),
  send_to_phone: z.object({ householdId, item: item.optional(), contentType: z.enum(["fix", "booking", "summary"]).describe("Kind of phone handoff") }).strict(),
  log_resolution: z.object({ householdId, item, cause: z.string().max(200).describe("Confirmed cause"), fix: z.string().max(500).describe("What fixed the issue"), cost: z.number().nonnegative().optional().describe("Cost of the fix") }).strict(),
  due_this_week: z.object({ householdId, days: z.number().int().min(1).max(31).default(7).describe("Number of days to look ahead") }).strict(),
} as const;

export const SetupHouseholdInput = schemas.setup_household;
export type SetupHouseholdInput = z.infer<typeof SetupHouseholdInput>;
export const LogEventInput = schemas.log_event;
export type LogEventInput = z.infer<typeof LogEventInput>;
export const GetHistoryInput = schemas.get_history;
export type GetHistoryInput = z.infer<typeof GetHistoryInput>;
export const PredictNextInput = schemas.predict_next;
export type PredictNextInput = z.infer<typeof PredictNextInput>;
export const DiagnoseInput = schemas.diagnose;
export type DiagnoseInput = z.infer<typeof DiagnoseInput>;
export const SendToPhoneInput = schemas.send_to_phone;
export type SendToPhoneInput = z.infer<typeof SendToPhoneInput>;
export const LogResolutionInput = schemas.log_resolution;
export type LogResolutionInput = z.infer<typeof LogResolutionInput>;
export const DueThisWeekInput = schemas.due_this_week;
export type DueThisWeekInput = z.infer<typeof DueThisWeekInput>;
export const ToolContracts = schemas;
export const ToolContractShapes = {
  setup_household: SetupHouseholdInput.shape,
  log_event: LogEventInput.shape,
  get_history: GetHistoryInput.shape,
  predict_next: PredictNextInput.shape,
  diagnose: DiagnoseInput.shape,
  send_to_phone: SendToPhoneInput.shape,
  log_resolution: LogResolutionInput.shape,
  due_this_week: DueThisWeekInput.shape,
} as const;
