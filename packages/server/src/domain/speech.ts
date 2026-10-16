import { formatLocalDate } from "@ellie/schema";
import type { RegionPack } from "@ellie/schema";
import { addDays, diffDays } from "@ellie/schema";

export function intervalToPhrase(days: number): string {
  if (days === 40) return "about 6 weeks";
  if (days >= 35 && days < 45 && days % 7 === 0) return `about ${days / 7} weeks`;
  if (days < 40) return `${Math.round(days)} days`;
  if (days < 90) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}
export function relativePhrase(fromLocal: string, toLocal: string): string {
  const days = diffDays(fromLocal, toLocal);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 45) return `about ${Math.round(days / 7)} weeks ago`;
  return `about ${Math.round(days / 30)} months ago`;
}
export function defaultPreviousWhen(intervalDays: number): string {
  return `${intervalToPhrase(intervalDays)} ago`;
}
export function dateSpeech(localDate: string, pack: Pick<RegionPack, "locale">): string {
  return formatLocalDate(localDate, pack, "speech");
}
export function dateAfterDays(todayLocal: string, days: number): string {
  return addDays(todayLocal, days);
}
