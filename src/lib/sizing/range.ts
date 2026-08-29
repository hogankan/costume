import type { Range } from "./types";

/** `null` ends are unbounded, not zero. */
export const lo = (r: Range): number => r.min ?? Number.NEGATIVE_INFINITY;
export const hi = (r: Range): number => r.max ?? Number.POSITIVE_INFINITY;

export const contains = (r: Range, v: number): boolean => v >= lo(r) && v <= hi(r);

/** Trim a trailing ".0" so rationales read like a person wrote them. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "\u221e" : "-\u221e";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export function formatRange(r: Range): string {
  if (r.min == null && r.max == null) return "any";
  if (r.min == null) return `up to ${fmt(r.max as number)}"`;
  if (r.max == null) return `${fmt(r.min)}"+`;
  // Charts print a single number where the value is the garment's dimension
  // rather than a range; showing it as "18-18" reads as a mistake.
  if (r.min === r.max) return `${fmt(r.min)}"`;
  return `${fmt(r.min)}-${fmt(r.max)}"`;
}

/** How far `v` sits outside `r`; 0 when inside. */
export function distanceOutside(r: Range, v: number): number {
  if (v < lo(r)) return lo(r) - v;
  if (v > hi(r)) return v - hi(r);
  return 0;
}
