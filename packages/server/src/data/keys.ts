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
export const phoneChatPrefix = (tokenHash: string) => `${tokenHash}#CHAT#`;
export const phoneChatSk = (tokenHash: string, timestamp: string, id: string) => `${phoneChatPrefix(tokenHash)}${timestamp}#${id}`;
export const phoneChatDisabledSk = (tokenHash: string) => `${tokenHash}#CHAT_DISABLED`;
export const phoneChatCountSk = (tokenHash: string) => `${tokenHash}#CHAT_COUNT`;
export const consentPrefix = () => "CONSENT#";
export const consentSk = (purpose: string, at: string, id: string) => `CONSENT#${purpose}#${at}#${id}`;
export const auditPk = () => "AUDIT";
export const auditSk = (householdId: string, at: string, id: string) => `${householdId}#${at}#${id}`;
export const confirmSk = (id: string) => `CONFIRM#${id}`;
export const subjectPk = () => "SUB";
export const subjectSk = (hash: string) => `SUB#${hash}`;
export const translationPk = () => "TRANSLATION";
export const translationSk = (hash: string, language: string) => `${hash}#${language}`;
export function ttlClockForKey(pk: string, sk: string): "app" | "wall" {
  if (pk === "AUDIT" || sk.startsWith("CONFIRM#")) return "wall";
  if (pk === linkPk() && (sk.length === 8 || sk.includes("#ACTION#") || sk.includes("#CHAT#") || sk.includes("#CHAT_COUNT") || sk.includes("#CHAT_DISABLED"))) return "wall";
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
