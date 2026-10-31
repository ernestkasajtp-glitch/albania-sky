import { db, flightsTable, googlePriceRulesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { GooglePriceRule, GooglePriceRuleTier } from "@workspace/db";
import { flightTypeIdentity } from "./flightIdentifiers.js";

// Minimal flight shape needed to match a Google price rule against a flight.
export type GoogleRuleFlightLike = {
  id: number;
  fromCity: string;
  toCity: string;
  airline: string;
  flightNumber: string;
  departureDate: string; // YYYY-MM-DD
};

export type ResolvedGooglePriceRule = GooglePriceRule & {
  selectedFlightKeys: string[];
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Round a sale price to the NEAREST multiple of 5 (e.g. 121 → 120, 133 → 135).
// User requirement: the final REAL sale price must always end on a clean 5-step,
// rounded to whichever 5 is closest (not always up).
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

// Fetch all active Google price rules, ordered by id (first match wins).
export async function getActiveGooglePriceRules(): Promise<ResolvedGooglePriceRule[]> {
  const rules = await db
    .select()
    .from(googlePriceRulesTable)
    .where(eq(googlePriceRulesTable.active, true))
    .orderBy(googlePriceRulesTable.id);

  const selectedIds = [...new Set(
    rules.flatMap(rule =>
      Array.isArray(rule.flightIds)
        ? (rule.flightIds as number[]).filter(id => Number.isInteger(id))
        : [],
    ),
  )];
  if (selectedIds.length === 0) {
    return rules.map(rule => ({ ...rule, selectedFlightKeys: [] }));
  }

  const selectedFlights = await db
    .select({
      id: flightsTable.id,
      fromCity: flightsTable.fromCity,
      toCity: flightsTable.toCity,
      flightNumber: flightsTable.flightNumber,
    })
    .from(flightsTable)
    .where(inArray(flightsTable.id, selectedIds));
  const keyById = new Map(
    selectedFlights.map(flight => [flight.id, flightTypeIdentity(flight)]),
  );

  return rules.map(rule => ({
    ...rule,
    selectedFlightKeys: Array.isArray(rule.flightIds)
      ? (rule.flightIds as number[])
          .map(id => keyById.get(id))
          .filter((key): key is string => !!key)
      : [],
  }));
}

// Does a rule apply to a given flight? (route / airline / date / scope filters)
export function googleRuleMatchesFlight(rule: GooglePriceRule | ResolvedGooglePriceRule, f: GoogleRuleFlightLike): boolean {
  if (!rule.applyAllFlights) {
    const ids = Array.isArray(rule.flightIds) ? (rule.flightIds as number[]) : [];
    const selectedFlightKeys = "selectedFlightKeys" in rule && Array.isArray(rule.selectedFlightKeys)
      ? rule.selectedFlightKeys
      : [];
    if (!ids.includes(f.id) && !selectedFlightKeys.includes(flightTypeIdentity(f))) return false;
  }
  if (rule.fromCity && rule.fromCity.trim() && rule.fromCity.trim().toUpperCase() !== (f.fromCity || "").toUpperCase()) return false;
  if (rule.toCity && rule.toCity.trim() && rule.toCity.trim().toUpperCase() !== (f.toCity || "").toUpperCase()) return false;
  if (rule.airline && rule.airline.trim() && !(f.airline || "").toUpperCase().includes(rule.airline.trim().toUpperCase())) return false;
  if (rule.departureFrom && rule.departureFrom.trim() && f.departureDate < rule.departureFrom.trim()) return false;
  if (rule.departureTo && rule.departureTo.trim() && f.departureDate > rule.departureTo.trim()) return false;
  return true;
}

// First active rule (by id) that matches the flight, or null.
export function findGoogleRuleForFlight<T extends GooglePriceRule>(rules: T[], f: GoogleRuleFlightLike): T | null {
  for (const rule of rules) {
    if (googleRuleMatchesFlight(rule, f)) return rule;
  }
  return null;
}

// Compute our sale price from a flight's Google price using the rule.
//   - Finds the tier whose [minPrice, maxPrice] range contains the Google price.
//   - Applies the tier value (percent or fixed) to the Google price.
//   - Clamps the result to the rule's `minPrice` floor (never below it).
// Returns null when there is no Google price or no tier matches it (→ no change).
// Core: compute a sale price from an explicit tier set + discount type + rounding
// option (+ a legacy rule-level floor). Both the internal and the offline price
// reuse this so their math stays identical while their inputs are INDEPENDENT.
export function computeFromTiers(
  googlePrice: number | null,
  tiers: GooglePriceRuleTier[],
  discountType: string,
  roundToFive: boolean,
  legacyMinPrice: number | null,
): number | null {
  if (googlePrice == null || !Number.isFinite(googlePrice)) return null;
  const tierList = Array.isArray(tiers) ? tiers : [];
  let matched: GooglePriceRuleTier | null = null;
  for (const t of tierList) {
    const min = Number(t.minPrice) || 0;
    const max = t.maxPrice == null || (t.maxPrice as any) === "" ? Infinity : Number(t.maxPrice);
    if (googlePrice >= min && googlePrice <= max) { matched = t; break; }
  }
  if (!matched) return null;
  const v = Number(matched.value) || 0;
  let price = discountType === "fixed" ? googlePrice - v : googlePrice * (1 - v / 100);
  // Floor precedence: the matched tier's own minSalePrice wins; fall back to the
  // legacy rule-level minPrice (for rules created before per-tier floors), else 0.
  const tierFloor =
    matched.minSalePrice != null && (matched.minSalePrice as any) !== ""
      ? Number(matched.minSalePrice)
      : null;
  const ruleFloor = legacyMinPrice != null ? Number(legacyMinPrice) : null;
  const floor = tierFloor != null ? tierFloor : ruleFloor != null ? ruleFloor : 0;
  // Per-tier sale-price CAP: the computed price for this tier never rises above
  // this value. null/empty = no cap. The cap is applied BEFORE the floor so that
  // on a conflicting (cap < floor) config the floor always wins — we never sell
  // below the minimum sale price.
  const tierCap =
    matched.maxSalePrice != null && (matched.maxSalePrice as any) !== "" && Number.isFinite(Number(matched.maxSalePrice))
      ? Number(matched.maxSalePrice)
      : null;
  if (tierCap != null && price > tierCap) price = tierCap;
  if (Number.isFinite(floor) && price < floor) price = floor;
  // "Fixed price" mode: rule disables 5-rounding, keep the exact computed value.
  if (roundToFive === false) return r2(Math.max(0, price));
  // Round the final sale price to the NEAREST 5, then re-clamp: rounding up must
  // not exceed the cap, and rounding down must never drop below the floor
  // (e.g. floor 122 → 120 would violate it). Floor wins on a cap/floor conflict.
  let result = round5(Math.max(0, price));
  if (tierCap != null && result > tierCap) result = Math.floor(tierCap / 5) * 5;
  if (Number.isFinite(floor) && result < floor) result = Math.ceil(floor / 5) * 5;
  // If floor-up pushed us back above the cap, there is no multiple of 5 inside
  // [floor, cap] (e.g. floor 121, cap 122). Fall back to the exact clamped price
  // (already constrained to the band above) so neither the floor nor the cap is
  // violated. On a genuine cap < floor conflict this returns the floor (min wins).
  if (tierCap != null && result > tierCap) result = r2(Math.max(0, price));
  return result;
}

// Internal adult/child sale price — driven by the rule's main `tiers`.
export function computeGoogleSalePrice(googlePrice: number | null, rule: GooglePriceRule): number | null {
  return computeFromTiers(
    googlePrice,
    Array.isArray(rule.tiers) ? (rule.tiers as GooglePriceRuleTier[]) : [],
    rule.discountType,
    rule.roundToFive,
    rule.minPrice != null ? Number(rule.minPrice) : null,
  );
}

// The rule's guaranteed MINIMUM (floor) sale price, used when a flight has NO
// Google price at all (neither live nor stale): instead of freezing at its last
// value, the flight falls back to the rule minimum. Returns the LOWEST per-tier
// `minSalePrice`, or the legacy rule-level `minPrice` when no tier defines its
// own floor, else null (no floor configured → caller leaves the price unchanged,
// never zeroes it).
export function computeRuleFloorFromTiers(
  tiers: GooglePriceRuleTier[],
  legacyMinPrice: number | null,
): number | null {
  const tierList = Array.isArray(tiers) ? tiers : [];
  const tierFloors: number[] = [];
  for (const t of tierList) {
    if (t.minSalePrice != null && (t.minSalePrice as any) !== "" && Number.isFinite(Number(t.minSalePrice))) {
      tierFloors.push(Number(t.minSalePrice));
    }
  }
  if (tierFloors.length) return r2(Math.max(0, Math.min(...tierFloors)));
  if (legacyMinPrice != null && Number.isFinite(Number(legacyMinPrice))) return r2(Math.max(0, Number(legacyMinPrice)));
  return null;
}

// Internal (adult/child) floor — driven by the rule's main `tiers`.
export function computeGoogleSaleFloor(rule: GooglePriceRule): number | null {
  return computeRuleFloorFromTiers(
    Array.isArray(rule.tiers) ? (rule.tiers as GooglePriceRuleTier[]) : [],
    rule.minPrice != null ? Number(rule.minPrice) : null,
  );
}

// Offline (Citizen) floor — driven by `offlineTiers`, falling back to `tiers`
// for legacy rules whose offlineTiers were never set (mirrors computeGoogleOfflinePrice).
export function computeGoogleOfflineFloor(rule: GooglePriceRule): number | null {
  const offlineTiers = Array.isArray(rule.offlineTiers) ? (rule.offlineTiers as GooglePriceRuleTier[]) : [];
  if (offlineTiers.length > 0) {
    return computeRuleFloorFromTiers(offlineTiers, rule.minPrice != null ? Number(rule.minPrice) : null);
  }
  return computeRuleFloorFromTiers(
    Array.isArray(rule.tiers) ? (rule.tiers as GooglePriceRuleTier[]) : [],
    rule.minPrice != null ? Number(rule.minPrice) : null,
  );
}

// Offline (Citizen) price — driven by the rule's INDEPENDENT `offlineTiers`.
// Falls back to the internal `tiers`/`discountType`/`roundToFive` only for legacy
// rules whose offlineTiers were never set (empty), so old offline rules keep
// computing exactly as before until they are re-saved/migrated.
export function computeGoogleOfflinePrice(googlePrice: number | null, rule: GooglePriceRule): number | null {
  const offlineTiers = Array.isArray(rule.offlineTiers) ? (rule.offlineTiers as GooglePriceRuleTier[]) : [];
  if (offlineTiers.length > 0) {
    // Keep the legacy rule-level minPrice as a fallback floor: migrated offline
    // rules had offlineTiers copied from `tiers` (which may lack per-tier
    // minSalePrice) while their floor lived in rule.minPrice. Per-tier
    // minSalePrice still wins; this only applies when a tier has no own floor.
    return computeFromTiers(
      googlePrice,
      offlineTiers,
      rule.offlineDiscountType,
      rule.offlineRoundToFive,
      rule.minPrice != null ? Number(rule.minPrice) : null,
    );
  }
  return computeFromTiers(
    googlePrice,
    Array.isArray(rule.tiers) ? (rule.tiers as GooglePriceRuleTier[]) : [],
    rule.discountType,
    rule.roundToFive,
    rule.minPrice != null ? Number(rule.minPrice) : null,
  );
}
