// Persist Google Flights prices in localStorage so they render instantly across
// pages (flights list + booking detail) and after a full page reload.
// TTL is configurable from Settings (defaults to 6h).
export const GOOGLE_PRICE_DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export type GooglePriceLS = { price: number | null; specific: boolean; ts: number; stale?: boolean };

export type GooglePriceValue = { price: number | null; specific?: boolean; stale?: boolean };

// Display-only policy. Historical prices may still exist in legacy browser/server
// caches, but neither stale data nor a failed request is a verified Google price.
export function resolveGooglePriceDisplay(value?: GooglePriceValue | null, failed = false) {
  const stale = !!value?.stale;
  const price = !failed && !stale && typeof value?.price === "number" && Number.isFinite(value.price)
    ? value.price
    : null;
  return {
    price,
    specific: !!value?.specific,
    stale,
    unavailableLabel: price != null ? null : "S’ka çmim",
  };
}

export function normalizeGooglePrice(value?: GooglePriceValue | null) {
  const { price, specific, stale } = resolveGooglePriceDisplay(value);
  return { price, specific, stale };
}

// Builds the shared cache key. MUST be identical everywhere so the flights list
// and the booking detail reuse the same stored price.
export function googlePriceLsKey(
  from?: string | null,
  to?: string | null,
  date?: string | null,
  flightNumber?: string | null,
): string | null {
  if (!from || !to || !date) return null;
  return `gfp:${String(from).toUpperCase()}|${String(to).toUpperCase()}|${date}|${flightNumber ?? ""}`;
}

export function readGooglePriceLS(key: string, ttlMs: number = GOOGLE_PRICE_DEFAULT_TTL_MS): GooglePriceLS | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as GooglePriceLS;
    if (typeof o?.ts !== "number" || Date.now() - o.ts > ttlMs) return null;
    return { ...o, ...normalizeGooglePrice(o) };
  } catch { return null; }
}

export function writeGooglePriceLS(key: string, val: GooglePriceLS) {
  try { localStorage.setItem(key, JSON.stringify({ ...val, ...normalizeGooglePrice(val) })); } catch { /* quota / disabled */ }
}
