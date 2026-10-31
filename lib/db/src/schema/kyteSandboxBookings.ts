import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Sandbox-only Kyte booking intents. Passenger details are deliberately never
 * persisted here; this table only records the provider outcome needed for safe
 * retries and administrative reconciliation.
 */
export const kyteSandboxBookingsTable = pgTable("kyte_sandbox_booking_attempts", {
  id: uuid("id").primaryKey(),
  actorUserId: integer("actor_user_id").notNull(),
  offerId: text("offer_id").notNull(),
  transactionId: uuid("transaction_id").notNull(),
  currencyCode: text("currency_code").notNull(),
  currencyDecimals: integer("currency_decimals").notNull(),
  offerPriceMinor: numeric("offer_price_minor", { precision: 18, scale: 0 }).notNull(),
  status: text("status").notNull().default("creating"),
  providerBookingId: text("provider_booking_id"),
  providerStatus: text("provider_status"),
  providerTotalCost: numeric("provider_total_cost", { precision: 18, scale: 4 }),
  providerCurrentBalance: numeric("provider_current_balance", { precision: 18, scale: 4 }),
  providerCurrency: text("provider_currency"),
  ticketTimeLimit: timestamp("ticket_time_limit", { withTimezone: true }),
  safeMessage: text("safe_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    "kyte_sandbox_booking_status_check",
    sql`${table.status} IN ('creating', 'created', 'failed', 'unknown')`,
  ),
  uniqueIndex("kyte_sandbox_booking_intent_uniq")
    .on(table.transactionId, table.offerId),
  uniqueIndex("kyte_sandbox_provider_booking_uniq")
    .on(table.providerBookingId)
    .where(sql`${table.providerBookingId} IS NOT NULL`),
  index("kyte_sandbox_booking_created_idx").on(table.createdAt),
  index("kyte_sandbox_booking_status_idx").on(table.status, table.createdAt),
]);

export type KyteSandboxBooking = typeof kyteSandboxBookingsTable.$inferSelect;
export type InsertKyteSandboxBooking = typeof kyteSandboxBookingsTable.$inferInsert;