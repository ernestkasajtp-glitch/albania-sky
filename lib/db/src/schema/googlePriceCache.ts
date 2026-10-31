import { pgTable, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

// Persistent cache of Google Flights prices so they survive API server restarts
// (deploys, crashes). The in-memory Map is still the fast path; this table is the
// warm fallback so a fresh process doesn't have to re-fetch every price live.
// cacheKey format: `FROM|TO|DATE|normFlightNum` (same key as the in-memory cache).
export const googlePriceCacheTable = pgTable("google_price_cache", {
  cacheKey: text("cache_key").primaryKey(),
  price: numeric("price", { precision: 10, scale: 2 }),
  // Previous value of `price` before the most recent overwrite. Lets the price
  // change report show the OLD vs NEW Google price. Set on every upsert to the
  // pre-update value (Postgres evaluates SET right-hand sides against old row).
  prevPrice: numeric("prev_price", { precision: 10, scale: 2 }),
  routePrice: numeric("route_price", { precision: 10, scale: 2 }),
  specific: boolean("specific").notNull().default(false),
  // TRUE when `price` is a kept-from-before ("old") price because the most recent
  // refresh attempt failed (RapidAPI error) or returned no price. Lets the UI show
  // a distinct "Çmim i Vjetër" state instead of either silently-fresh or no-price.
  // Cleared back to FALSE the moment a fresh price is fetched.
  stale: boolean("stale").notNull().default(false),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  // "Çmim i Ri" candidate: the latest LIVE Google price fetched for display/review
  // ONLY. Written by the dedicated new-price warmer and never auto-applied — it does
  // NOT touch `price` (the value the sale-price rules read). The admin promotes it to
  // `price` for selected flights via the bulk "Updato Çmimet" action.
  candidatePrice: numeric("candidate_price", { precision: 10, scale: 2 }),
  candidateAt: timestamp("candidate_at", { withTimezone: true }),
});

export type GooglePriceCache = typeof googlePriceCacheTable.$inferSelect;
