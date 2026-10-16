export type IdKind = "hh" | "itm" | "evt" | "prd" | "res" | "dgn";
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
function randomBase36(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % 36]).join("");
}
export function newId(prefix: IdKind): string {
  return `${prefix}_${randomBase36(20)}`;
}
export function newSortableId(prefix: IdKind, date: Date): string {
  const time = Math.max(0, date.getTime()).toString(36).padStart(9, "0").slice(-9);
  return `${prefix}_${time}-${randomBase36(10)}`;
}
