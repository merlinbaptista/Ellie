import type { EventType } from "@ellie/schema";

export const householdPk = (householdId: string) => `HH#${householdId}`;
export const householdProfileSk = () => "PROFILE";
export const itemSk = (itemId: string) => `ITEM#${itemId}`;
export const itemPrefix = () => "ITEM#";
export const aliasSk = (phrase: string) => `ALIAS#${normalizePhrase(phrase)}`;
export const aliasPrefix = () => "ALIAS#";
export const eventSk = (itemId: string, timestampUtc: string, eventId: string) => `EVENT#${itemId}#${timestampUtc}#${eventId}`;
export const eventPrefix = (itemId?: string) => itemId ? `EVENT#${itemId}#` : "EVENT#";
export const pendingSk = (scopeKey: string) => `PENDING#${scopeKey}`;
export const dedupeSk = (hash: string) => `DEDUPE#${hash}`;
export const householdIndexPk = () => "INDEX";
export const householdIndexSk = (householdId: string) => `HH#${householdId}`;
export const householdIndexPrefix = () => "HH#";
export const resolutionSk = (itemId: string, localDate: string, resolutionId: string) => `RES#${itemId}#${localDate}#${resolutionId}`;
export const resolutionPrefix = (itemId?: string) => itemId ? `RES#${itemId}#` : "RES#";
export const diagnosisSk = (diagnosisId: string) => `DIAG#${diagnosisId}`;
export const diagnosisPrefix = () => "DIAG#";
export const predictionSk = (itemId: string, component?: string) => component ? `PRED#${itemId}#${component}` : `PRED#${itemId}`;
export const predictionPrefix = (itemId?: string) => itemId ? `PRED#${itemId}` : "PRED#";
export const outboxPk = () => "OUTBOX";
export const outboxMessageSk = (timestampUtc: string, messageId: string) => `MSG#${timestampUtc}#${messageId}`;
export const outboxMessagePrefix = () => "MSG#";
export const schedulePk = () => "SCHEDULE";
export const scheduleSk = (jobId: string) => jobId;
export const scheduleFiredSk = (jobId: string, runAtUtc: string) => `FIRED#${jobId}#${runAtUtc}`;
export const linkPk = () => "LINK";
export const shortLinkSk = (code: string) => code;
export const phoneSendSk = (dedupeId: string, sentAtEpoch: number, id: string) => `${dedupeId}#${sentAtEpoch}#${id}`;
export const phoneSendPrefix = (householdId: string) => `SEND#${householdId}#`;
export const phoneActionSk = (tokenHash: string, action: string) => `${tokenHash}#ACTION#${action}`;
export function ttlClockForKey(pk: string, sk: string): "app" | "wall" {
  if (pk === linkPk()) return "wall";
  if (pk === schedulePk() && sk.startsWith("FIRED#")) return "wall";
  return "app";
}
export const eventType = (type: EventType) => type;

export function normalizePhrase(text: string): string {
  return text.toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|our|my)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word)
    .join(" ");
}
