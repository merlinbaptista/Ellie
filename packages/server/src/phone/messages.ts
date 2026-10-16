import type { PhoneContentKind, PhoneView } from "@ellie/schema";

const gsm7Characters = new Set(Array.from("£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
function gsmSafe(value: string): string {
  const normalized = value.replace(/[₹]/g, "Rs ").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(normalized).map((character) => gsm7Characters.has(character) ? character : " ").join("").replace(/\s+/g, " ").trim();
}
function briefName(value: string): string { return value.length > 24 ? `${value.slice(0, 21).trimEnd()}...` : value; }

export function buildSmsMessage(kind: PhoneContentKind, input: { item?: string; detail?: string; shortUrl: string }): string {
  const name = briefName(input.item ?? "home");
  const text = kind === "fix" ? `Ellie: Steps to fix your ${name}${input.detail ? ` (${input.detail})` : ""}: ${input.shortUrl}`
    : kind === "booking" ? `Ellie: Book your ${name}${input.detail ? ` (${input.detail})` : ""}: ${input.shortUrl}`
    : `Ellie: This week at home - ${input.detail ?? "your update"}: ${input.shortUrl}`;
  const safe = gsmSafe(text);
  if (safe.length > 160) {
    const suffix = ` ${input.shortUrl}`;
    return `${safe.slice(0, Math.max(0, 160 - suffix.length - 3)).trimEnd()}...${suffix}`;
  }
  return safe;
}

export function buildReminderSms(kind: "reminder" | "delivery_check", input: { item: string; date?: string; shortUrl: string }): string {
  const name = briefName(input.item);
  const message = kind === "delivery_check"
    ? `Ellie: Did your ${name} arrive? Tell Alexa "the ${name} came". ${input.shortUrl}`
    : `Ellie: Your ${name} runs out around ${input.date ?? "soon"}. Bookings are open: ${input.shortUrl}`;
  const safe = gsmSafe(message);
  return safe.length <= 160 ? safe : `${safe.slice(0, 156 - input.shortUrl.length).trimEnd()}... ${input.shortUrl}`;
}

export function buildEmailMessage(view: PhoneView, shortUrl: string): { subject: string; body: string } {
  const lines = view.sections.flatMap((section) => [section.heading, ...(section.body ? [section.body] : []), ...(section.list ?? []).slice(0, 3).map((line) => `- ${line}`)]);
  return { subject: `Ellie: ${view.title}`.slice(0, 100), body: `${lines.join("\n")}\n\nOpen: ${shortUrl}` };
}

export function isGsm7(value: string): boolean { return Array.from(value).every((character) => gsm7Characters.has(character)); }

export function formatSmsDate(localDate: string, language: string, dateOrder: "DMY" | "MDY" | "YMD"): string {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(date).map((part) => [part.type, part.value]));
  const datePart = dateOrder === "MDY" ? `${parts.month} ${parts.day}` : `${parts.day} ${parts.month}`;
  return `${parts.weekday} ${datePart}`;
}
