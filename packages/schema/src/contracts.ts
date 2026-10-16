import { z } from "zod";
import { EventType } from "./enums.js";
import { zHouseholdId } from "./primitives.js";

const householdId = zHouseholdId.optional().describe("Household identifier, if already known");
const item = z.string().describe("What the user called the thing, such as gas, purifier, or AC filter");
const schemas = {
  setup_household: z.object({ householdId, displayName: z.string().max(60).optional().describe("A short name for the home"), country: z.string().length(2).optional().describe("Two-letter country code"), region: z.string().max(80).optional().describe("City or postcode only, never a full address"), timeZone: z.string().optional().describe("Household IANA time zone"), language: z.string().optional().describe("Spoken language tag"), phoneLanguage: z.string().optional().describe("Phone page language tag"), phone: z.string().optional().describe("Phone number, only with consent"), email: z.string().email().optional().describe("Email address, only with consent"), consent: z.boolean().optional().describe("Whether the person consents to saving contact details"), confirm: z.boolean().optional().describe("True when the user confirmed the suggested country") }).strict(),
  log_event: z.object({ householdId, item, type: EventType.describe("What happened to the household item"), component: z.string().optional().describe("Part of the item if the user named one, e.g. filter or membrane."), when: z.string().optional().describe("When it happened, as a date or relative phrase"), previousWhen: z.string().optional().describe("When the item was changed/serviced the time before, e.g. 'about five weeks ago'. Only send this when Ellie asked for it."), itemName: z.string().max(60).optional().describe("A nickname to tell items apart, e.g. 'bedroom AC'."), brand: z.string().max(60).optional().describe("Item brand"), model: z.string().max(60).optional().describe("Item model"), purchaseDate: z.string().optional().describe("When it was bought; ISO date or phrase like 'last December'."), warrantyUntil: z.string().optional().describe("Warranty expiry as an ISO date or relative phrase."), requestId: z.string().max(64).optional().describe("Idempotency key if the client retries."), notes: z.string().max(500).optional().describe("Additional details"), cost: z.number().nonnegative().optional().describe("Amount spent"), symptom: z.string().optional().describe("Problem or symptom reported"), providerKey: z.string().optional().describe("Known provider identifier") }).strict(),
  get_history: z.object({ householdId, item: item.optional(), period: z.enum(["30d", "90d", "1y", "all"]).default("1y").describe("How far back to search"), types: z.array(EventType).optional().describe("Limit to these event types") }).strict(),
  predict_next: z.object({ householdId, item, component: z.string().optional().describe("Specific item part, such as sediment filter or membrane") }).strict(),
  diagnose: z.object({ householdId, item, symptom: z.string().describe("Reported problem"), answers: z.record(z.string(), z.string()).optional().describe("Answers already supplied to diagnosis questions") }).strict(),
  send_to_phone: z.object({ householdId, item: item.optional(), contentType: z.enum(["fix", "booking", "summary"]).describe("Kind of phone handoff") }).strict(),
  log_resolution: z.object({ householdId, item, cause: z.string().max(200).describe("Confirmed cause"), fix: z.string().max(500).describe("What fixed the issue"), cost: z.number().nonnegative().optional().describe("Cost of the fix") }).strict(),
  due_this_week: z.object({ householdId, days: z.number().int().min(1).max(31).default(7).describe("Number of days to look ahead"), includeOk: z.boolean().default(false).describe("Include items that are not due soon") }).strict(),
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
