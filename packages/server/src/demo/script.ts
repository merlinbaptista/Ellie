import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const DemoAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("say"), text: z.string() }).strict(),
  z.object({ kind: z.literal("timeTravel"), to: z.string().nullable() }).strict(),
  z.object({ kind: z.literal("openPhone"), which: z.literal("latest") }).strict(),
  z.object({ kind: z.literal("phoneTap"), action: z.enum(["fixed", "booked", "book"]) }).strict(),
  z.object({ kind: z.literal("reseed") }).strict(),
]);

export const DemoStep = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  household: z.enum(["demo-blr", "demo-tx", "fresh"]),
  action: DemoAction,
  expect: z.object({
    tools: z.array(z.string()).optional(),
    speechIncludes: z.array(z.string()).optional(),
    speechExcludes: z.array(z.string()).optional(),
    state: z.enum(["done", "awaiting_answer", "safety_stop", "not_understood"]).optional(),
    cards: z.number().int().nonnegative().optional(),
    maxToolMs: z.number().nonnegative().default(500),
    outboxNew: z.number().int().nonnegative().optional(),
  }).default({}),
  presenterNote: z.string().optional(),
  hidden: z.boolean().default(false),
}).strict();
export const DemoScript = z.array(DemoStep).min(1);
export type DemoStep = z.infer<typeof DemoStep>;

const scriptPath = resolve(fileURLToPath(new URL("../../../../demo/script.json", import.meta.url)));
export const demoScript = DemoScript.parse(JSON.parse(readFileSync(scriptPath, "utf8")));
