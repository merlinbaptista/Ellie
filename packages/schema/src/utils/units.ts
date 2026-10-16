import type { TempUnit, VolumeUnit, WeightUnit } from "../enums.js";
type Money = { amount: number; currency: string };
export function convertVolume(value: number, from: VolumeUnit, to: VolumeUnit): number {
  if (from === to) return value;
  return from === "gal" ? value * 3.785411784 : value / 3.785411784;
}
export function convertTemp(value: number, from: TempUnit, to: TempUnit): number {
  if (from === to) return value;
  return from === "F" ? (value - 32) * 5 / 9 : value * 9 / 5 + 32;
}
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return from === "lb" ? value * 0.45359237 : value / 0.45359237;
}
export function formatQuantity(value: number, unit: string, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}
export function formatMoney(money: Money, locale: string): string {
  const fractionDigits = money.currency === "INR" ? 0 : 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency: money.currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(money.amount);
}
