import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtFlightNum(num: string | null | undefined): string {
  if (!num) return num ?? "";
  const clean = num.replace(/\s+/g, "");
  if (clean.length <= 2) return clean;
  return clean.slice(0, 2) + " " + clean.slice(2);
}

/**
 * Display-only: konverton një orë të ruajtur si "HH:mm" ose "HH:mm:ss" (24h)
 * në format 12-orësh me prapashtesë AM/PM në anglisht: "13:45" → "1:45 PM",
 * "09:05" → "9:05 AM", "00:30" → "12:30 AM", "12:00" → "12:00 PM".
 * NUK ndryshon asgjë të ruajtur/dërguar — vetëm çfarë lexon përdoruesi.
 * Kthen "" për vlera boshe dhe vlerën origjinale nëse s'është orë e vlefshme.
 */
export function fmtAmPm(t: string | null | undefined): string {
  // KUJDES (31.07.2026): oraret e fluturimit mbeten 24h me kërkesë të userit —
  // ky helper tani kthen vlerën siç është. AM/PM vlen vetëm për timestamps
  // (shih fmtDateTimeAmPm). Mos e rikthe konvertimin pa e pyetur userin.
  if (t == null) return "";
  return String(t).trim();
}

/**
 * Display-only: datë + orë, ku ora shfaqet 12-orëshe me AM/PM (anglisht) dhe
 * data mbetet në formatin shqip si më parë. Përdoret aty ku më parë thirrej
 * `toLocaleString("sq-AL", …)` me orë brenda.
 */
export function fmtDateTimeAmPm(
  value: Date | string | number | null | undefined,
  opts: { dateOptions?: Intl.DateTimeFormatOptions; timeZone?: string } = {},
): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const tz = opts.timeZone ? { timeZone: opts.timeZone } : {};
  const datePart = d.toLocaleDateString("sq-AL", { ...(opts.dateOptions || {}), ...tz });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...tz });
  return `${datePart}, ${timePart}`;
}

/** Format a monetary value as a whole euro, never showing cents/decimals: 50.00 → "50", 236.25 → "236", 142.5 → "143". Display-only — does NOT change stored prices, API responses, or any calculation. */
export function fmtM(n: number | string | null | undefined): string {
  if (n == null || n === "") return "0";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return String(Math.round(num));
}

/** Whole-euro due amount used for payment eligibility and debt displays. */
export function dueEuro(n: number | string | null | undefined): number {
  const value = Number(n ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1 ? 0 : Math.round(value);
}

/** Keeps payment amount inputs in whole euros while preserving an empty or lone minus value during typing. */
export function wholeMoneyInput(value: string): string {
  if (value === "" || value === "-") return value;
  const num = Number(value.replace(",", "."));
  return Number.isFinite(num) ? String(Math.round(num)) : "";
}

/**
 * PNR-të efektive të një rezervimi për shfaqje në listë (display-only).
 * Rregulli i njëjtë si te e-ticket: booking.pnr ka përparësi; kur mungon,
 * mblidhen PNR-të e pasagjerëve (passenger.pnr || groupPnr), pa dublikate.
 * Kthen [] kur s'ka asnjë → shfaqet "NOT ISSUED".
 */
export function bookingPnrList(b: any): string[] {
  // Mbledh TË GJITHA PNR-të e ndryshme të pasagjerëve (jo të anuluar);
  // booking.pnr përdoret vetëm si fallback kur pasagjerët s'kanë PNR.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of (b?.passengers || [])) {
    if (p?.cancelled) continue;
    const v = p?.pnr || p?.groupPnr;
    if (v && !seen.has(String(v))) { seen.add(String(v)); out.push(String(v)); }
  }
  if (out.length === 0 && b?.pnr) return [String(b.pnr)];
  return out;
}
