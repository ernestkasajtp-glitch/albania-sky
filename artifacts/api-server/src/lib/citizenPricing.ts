import { db, settingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

// -----------------------------------------------------------------------
// CitizenPlane pricing.
//
// The price sent to the CitizenPlane marketplace is DIFFERENT from the
// internal system (base) price. It is the base ADULT price plus a global
// markup configured in Settings, OR a per-flight MANUAL override stored in
// flights.citizen_price.
//
//   effective = override (flights.citizen_price) ?? round2(base + markup)
//
// Markup can be a percentage ("percent") or a flat euro amount ("fixed").
// Default markup value is 0 => Citizen price equals base until an admin sets
// a markup. The override is ADULT-only; infant price is never marked up.
// -----------------------------------------------------------------------

export type CitizenMarkupType = "percent" | "fixed";

export interface CitizenPricingSettings {
  type: CitizenMarkupType;
  value: number;
}

export const CITIZEN_MARKUP_TYPE_KEY = "citizen_markup_type";
export const CITIZEN_MARKUP_VALUE_KEY = "citizen_markup_value";
export const CITIZEN_PRICING_KEYS = [CITIZEN_MARKUP_TYPE_KEY, CITIZEN_MARKUP_VALUE_KEY];

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Strict numeric parse. Drizzle `numeric` columns arrive as strings, so always
// parse defensively. Returns null for null/empty/non-finite/malformed input.
// Unlike parseFloat, trailing garbage is rejected: "215.50abc" and "10,5" → null.
export function parseMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "") return null;
  // Strict: optional sign + digits + optional single decimal part only. No
  // thousands separators, no trailing characters.
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function getCitizenPricingSettings(): Promise<CitizenPricingSettings> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(inArray(settingsTable.key, CITIZEN_PRICING_KEYS));
  const map: Record<string, string | null> = {};
  for (const r of rows) map[r.key] = r.value;
  const type: CitizenMarkupType = map[CITIZEN_MARKUP_TYPE_KEY] === "fixed" ? "fixed" : "percent";
  const raw = parseMoney(map[CITIZEN_MARKUP_VALUE_KEY]) ?? 0;
  // Negative markup is rejected (no accidental discounts to the marketplace).
  return { type, value: raw < 0 ? 0 : raw };
}

export interface CitizenPriceInput {
  adultPrice: number | string | null | undefined;
  citizenPrice?: number | string | null;
}

// Auto default: base adult price + configured markup, rounded to 2dp.
export function computeCitizenDefault(
  adultPrice: number | string | null | undefined,
  settings: CitizenPricingSettings,
): number {
  const base = parseMoney(adultPrice) ?? 0;
  const out = settings.type === "percent"
    ? base + (base * settings.value) / 100
    : base + settings.value;
  return round2(out < 0 ? 0 : out);
}

// Effective Citizen adult price: manual override if set, else auto default.
export function computeCitizenAdultPrice(
  flight: CitizenPriceInput,
  settings: CitizenPricingSettings,
): number {
  const override = parseMoney(flight.citizenPrice);
  if (override != null) return round2(override < 0 ? 0 : override);
  return computeCitizenDefault(flight.adultPrice, settings);
}

// Whether the effective price comes from a manual override ("manual") or the
// auto markup default ("auto").
export function citizenPriceSource(flight: CitizenPriceInput): "auto" | "manual" {
  return parseMoney(flight.citizenPrice) != null ? "manual" : "auto";
}
