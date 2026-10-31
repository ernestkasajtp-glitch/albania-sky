import { pgTable, serial, integer, text, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";
import { pokAccountsTable } from "./pokAccounts";
import { sql } from "drizzle-orm";

/**
 * Durable provider order state.  This is deliberately separate from payments:
 * an order may be pending for an hour and must retain the account used to
 * create it even if the administrator switches the active account.
 */
export const pokOrdersTable = pgTable("pok_orders", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => pokAccountsTable.id, { onDelete: "restrict" }),
  providerOrderId: text("provider_order_id"),
  confirmUrl: text("confirm_url"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("created"),
  notificationClosedAt: timestamp("notification_closed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pok_orders_provider_order_uniq").on(t.providerOrderId),
  uniqueIndex("pok_orders_one_active_booking_uniq").on(t.bookingId)
    .where(sql`${t.status} IN ('creating', 'unknown', 'created', 'pending')`),
  index("idx_pok_orders_booking_status").on(t.bookingId, t.status),
  index("idx_pok_orders_account").on(t.accountId),
]);

export type PokOrder = typeof pokOrdersTable.$inferSelect;
