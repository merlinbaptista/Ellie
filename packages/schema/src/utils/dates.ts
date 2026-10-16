import type { DateOrder } from "../enums.js";
import type { RegionPack } from "../region-pack/schema.js";

export function toLocalDate(utcIso: string, timeZone: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid UTC date");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localTimeOffset(localDate: string, hour: number, timeZone: string): number {
  const [year, month, day] = localDate.split("-").map(Number);
  const targetUtc = Date.UTC(year!, month! - 1, day!, hour);
  let guess = targetUtc;
  for (let attempt = 0; attempt < 4; attempt++) {
    const formatted = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
    const values = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    const delta = targetUtc - represented;
    guess += delta;
    if (delta === 0) break;
  }
  return guess;
}

export function localDateToUtc(localDate: string, timeZone: string, hour = 9): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || hour < 0 || hour > 23) throw new RangeError("Invalid local date or hour");
  const [year, month, day] = localDate.split("-").map(Number);
  const check = new Date(Date.UTC(year!, month! - 1, day!));
  if (check.toISOString().slice(0, 10) !== localDate) throw new RangeError("Invalid calendar date");
  return new Date(localTimeOffset(localDate, hour, timeZone)).toISOString();
}

export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid local date");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00.000Z`);
  const second = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(first) || !Number.isFinite(second)) throw new RangeError("Invalid local date");
  return Math.round((second - first) / 86_400_000);
}

const numberWords: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2 };
function amountFrom(text: string): number | undefined {
  const match = text.match(/^(a couple of|a|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
  if (!match) return undefined;
  const token = match[1]!.toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  return numberWords[token === "a couple of" ? "couple" : token];
}
export function parseRelativeDate(phrase: string, todayLocal: string): { localDate: string; approximate: boolean } | null {
  const text = phrase.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? null : { localDate: text, approximate: false };
  if (text === "today") return { localDate: todayLocal, approximate: false };
  if (text === "yesterday") return { localDate: addDays(todayLocal, -1), approximate: false };
  if (text === "last week") return { localDate: addDays(todayLocal, -7), approximate: false };
  if (text === "last month") return { localDate: addDays(todayLocal, -30), approximate: false };
  const approximate = /^(about|around|roughly)\s+/.test(text);
  const normalized = text.replace(/^(about|around|roughly)\s+/, "");
  const match = normalized.match(/^(.+?)\s+(day|days|week|weeks|month|months)\s+ago$/);
  if (!match) return null;
  const amount = amountFrom(match[1]!);
  if (!amount) return null;
  const unit = match[2]!.startsWith("day") ? 1 : match[2]!.startsWith("week") ? 7 : 30;
  return { localDate: addDays(todayLocal, -amount * unit), approximate };
}

export function formatLocalDate(localDate: string, pack: Pick<RegionPack, "locale"> | DateOrder, style: "speech" | "short" = "speech"): string {
  const dateOrder = typeof pack === "string" ? pack : pack.locale.dateOrder;
  const date = new Date(`${localDate}T12:00:00.000Z`);
  if (style === "short") {
    const options: Intl.DateTimeFormatOptions = dateOrder === "MDY" ? { month: "numeric", day: "numeric", year: "numeric", timeZone: "UTC" } : { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" };
    return new Intl.DateTimeFormat(dateOrder === "MDY" ? "en-US" : "en-GB", options).format(date);
  }
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date);
  return dateOrder === "MDY" ? `${weekday}, ${month} ${day}` : `${weekday}, ${day} ${month}`;
}
export function isInSeason(localDate: string, season: { startMonth: number; endMonth: number }): boolean {
  const month = Number(localDate.slice(5, 7));
  return season.startMonth <= season.endMonth ? month >= season.startMonth && month <= season.endMonth : month >= season.startMonth || month <= season.endMonth;
}
