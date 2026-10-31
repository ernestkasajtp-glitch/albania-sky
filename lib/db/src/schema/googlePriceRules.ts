import { pgTable, serial, text, boolean, jsonb, numeric, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type GooglePriceRuleTier = {
  minPrice: number;
  maxPrice: number | null;
  value: number;
  // Per-tier sale-price floor: the computed price for THIS tier never drops
  // below this value. null = no floor for this tier.
  minSalePrice?: number | null;
  // Per-tier sale-price cap: the computed price for THIS tier never rises
  // above this value. null = no cap for this tier.
  maxSalePrice?: number | null;
};

// Google-based dynamic pricing rules. When ≥1 rule is active, the system
// derives each matching flight's REAL sale price from its cached Google
// Flights price (tier value applied to the Google price), never letting the
// result drop below the rule's `minPrice` floor. Applied automatically by the
// Google price warmer (every cycle) and immediately after any rule change.
export const googlePriceRulesTable = pgTable("google_price_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  // "percent" | "fixed" — how each tier value is interpreted against the Google price.
  discountType: text("discount_type").notNull().default("percent"),
  // [{ minPrice, maxPrice, value }] — matched against the GOOGLE price.
  tiers: jsonb("tiers").$type<GooglePriceRuleTier[]>().notNull().default(sql`'[]'::jsonb`),
  // Sale-price floor: the computed price never drops below this value.
  minPrice: numeric("min_price", { precision: 10, scale: 2 }),
  // When false, the computed sale price is NOT rounded to the nearest 5 — the
  // exact ("fixed") number is kept (e.g. 132 instead of 130). Default = round.
  roundToFive: boolean("round_to_five").notNull().default(true),
  // When true, this rule ALSO computes the OFFLINE (Citizen) price and writes it
  // to flights.citizen_price — using its OWN independent discount config
  // (offlineTiers / offlineDiscountType / offlineRoundToFive), SEPARATE from the
  // internal adult/child discount above. Flights flagged excludeFromGoogleRule
  // are skipped. (Legacy: if offlineTiers is empty it falls back to `tiers`.)
  applyOffline: boolean("apply_offline").notNull().default(false),
  // When true (default), this rule drives the internal adult/child SALE price
  // from `tiers`. Set false to make a rule target ONLY the offline price.
  // A single rule can therefore drive flights AND offline independently.
  applyInternal: boolean("apply_internal").notNull().default(true),
  // Offline (Citizen) discount config — fully INDEPENDENT from `tiers` above.
  // [{ minPrice, maxPrice, value, minSalePrice?, maxSalePrice? }] matched against
  // the GOOGLE price, used only when applyOffline is true.
  offlineTiers: jsonb("offline_tiers").$type<GooglePriceRuleTier[]>().notNull().default(sql`'[]'::jsonb`),
  // "percent" | "fixed" — how each offline tier value is interpreted.
  offlineDiscountType: text("offline_discount_type").notNull().default("percent"),
  // When false, the computed offline price is NOT rounded to the nearest 5.
  offlineRoundToFive: boolean("offline_round_to_five").notNull().default(true),
  // Flight scope: all flights, or only the listed flight ids.
  applyAllFlights: boolean("apply_all_flights").notNull().default(true),
  flightIds: jsonb("flight_ids").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  // Optional filters (empty/null = no constraint).
  fromCity: text("from_city"),
  toCity: text("to_city"),
  airline: text("airline"),
  departureFrom: text("departure_from"), // YYYY-MM-DD inclusive
  departureTo: text("departure_to"), // YYYY-MM-DD inclusive
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type GooglePriceRule = typeof googlePriceRulesTable.$inferSelect;
export type NewGooglePriceRule = typeof googlePriceRulesTable.$inferInsert;
