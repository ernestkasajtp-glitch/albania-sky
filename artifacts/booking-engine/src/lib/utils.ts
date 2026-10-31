import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize a newly calculated monetary amount to the nearest whole euro. */
export function roundWholeEuro(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * DISPLAY-ONLY helper: convert a stored 24h time string ("HH:mm" or "HH:mm:ss")
 * into a 12-hour label with English AM/PM: "13:45" → "1:45 PM", "00:30" → "12:30 AM".
 * Values are never stored/transmitted in this form. Empty → "", invalid → original.
 */
export function fmtAmPm(t: string | null | undefined): string {
  // NOTE (2026-07-31): flight times must stay 24h (user request) — returns value unchanged.
  if (t == null) return "";
  return String(t).trim();
}

/** Format a monetary value as a whole euro, rounding historical fractional data. */
export function fmtM(n: number | string | null | undefined): string {
  if (n == null || n === "") return "0";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return String(roundWholeEuro(num));
}
