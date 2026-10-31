import { pgTable, serial, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type PriceRuleTier = {
  minPrice: number;
  maxPrice: number | null;
  value: number;
};

// Agent Price Rules — condition-based pricing assigned to specific agents.
// When an agent has ≥1 active rule, rules govern their pricing and the per-agent
// flat discount + markup are bypassed for that agent. Agents with no active rule
// keep their existing discount/markup behavior unchanged.
export const priceRulesTable = pgTable("price_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  // "percent" | "fixed" — how each tier value is interpreted.
  discountType: text("discount_type").notNull().default("percent"),
  // [{ minPrice, maxPrice, value }] — matched against each ticket price value.
  tiers: jsonb("tiers").$type<PriceRuleTier[]>().notNull().default(sql`'[]'::jsonb`),
  // Flight scope: all flights, or only the listed flight ids.
  applyAllFlights: boolean("apply_all_flights").notNull().default(true),
  flightIds: jsonb("flight_ids").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  // Optional filters (empty/null = no constraint).
  fromCity: text("from_city"),
  toCity: text("to_city"),
  airline: text("airline"),
  departureFrom: text("departure_from"), // YYYY-MM-DD inclusive
  departureTo: text("departure_to"), // YYYY-MM-DD inclusive
  // Agents this rule applies to.
  agentIds: jsonb("agent_ids").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PriceRule = typeof priceRulesTable.$inferSelect;
export type NewPriceRule = typeof priceRulesTable.$inferInsert;
