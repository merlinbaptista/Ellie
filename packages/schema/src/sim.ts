import { z } from "zod";
import { zHouseholdId, zLanguageTag } from "./primitives.js";

// Simulator protocol - not part of the open home-event schema.
export const SimTurnRequest = z.object({
  sessionId: z.string().min(8).max(64),
  householdId: zHouseholdId,
  text: z.string().trim().min(1).max(400),
  lang: zLanguageTag,
  inputMode: z.enum(["voice", "text", "chip"]),
  sttMs: z.number().int().nonnegative().optional(),
}).strict();
export type SimTurnRequest = z.infer<typeof SimTurnRequest>;

export const SimToolCall = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  ms: z.number().nonnegative(),
  ok: z.boolean(),
  result: z.unknown(),
  fragment: z.string().optional(),
}).strict();
export type SimToolCall = z.infer<typeof SimToolCall>;

export const SimTurnResponse = z.object({
  turnId: z.string(),
  speech: z.string(),
  cards: z.array(z.unknown()),
  state: z.enum(["done", "awaiting_answer", "safety_stop", "not_understood"]),
  followUp: z.object({ question: z.string(), defaultValue: z.string().optional() }).optional(),
  calls: z.array(SimToolCall),
  router: z.object({ kind: z.enum(["llm", "deterministic"]), ms: z.number().nonnegative(), fallbackReason: z.string().optional() }).strict(),
  totalMs: z.number().nonnegative(),
  phoneNotified: z.boolean(),
}).strict();
export type SimTurnResponse = z.infer<typeof SimTurnResponse>;