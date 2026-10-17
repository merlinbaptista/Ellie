// A separator may not be a sentence-ending period, so one candidate never spans two sentences.
const phonePattern = /(?<!\w)\+?\d(?:(?:[-()\s]|\.(?!\s)){0,2}\d){7,14}(?!\w)/g;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const linkTokenPattern = /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{30,}\b/g;
const queryTokenPattern = /([?&]t=)[^&#\s]+/gi;
const namePattern = /\b(my name is|their name is|his name is|her name is)\s+[\p{L}'’-]+/giu;

export function maskPhone(value: string): string { return `•••• ${value.slice(-4)}`; }
export function maskEmail(value: string): string { return value.replace(/^([^@]).*(@.*)$/, "$1***$2"); }
function redactPhoneCandidate(value: string): string {
  if (/\d{4}-\d{2}-\d{2}/.test(value)) return value;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/.test(value)) return value;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return value;
  return "[REDACTED_PHONE]";
}
export function redactText(value: string): string {
  return value
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(jwtPattern, "[REDACTED_TOKEN]")
    .replace(linkTokenPattern, "[REDACTED_LINK]")
    .replace(queryTokenPattern, "$1[REDACTED]")
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(phonePattern, redactPhoneCandidate)
    .replace(namePattern, "$1 [REDACTED_NAME]");
}

export function redactObject(value: unknown, key = ""): unknown {
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (typeof value === "string") {
    if (/^(?:phone|email|token|authorization|contact|to)$/i.test(key)) return "[REDACTED]";
    return redactText(value);
  }
  if (Array.isArray(value)) return value.map((entry) => redactObject(entry));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entry]) => [entryKey, redactObject(entry, entryKey)]));
  return value;
}
