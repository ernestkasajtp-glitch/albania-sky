import { pgTable, serial, integer, text, numeric, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";

export const priceChangeRequestsTable = pgTable("price_change_requests", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  bookingRef: text("booking_ref").notNull(),
  requestedBy: integer("requested_by").notNull(),
  requestedByName: text("requested_by_name").notNull(),
  currentAmount: numeric("current_amount", { precision: 10, scale: 2 }).notNull(),
  suggestedAmount: numeric("suggested_amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by"),
  reviewNote: text("review_note"),
  requestType: text("request_type").notNull().default("sell"),
  splitIndex: integer("split_index"),
  unreadByManager: boolean("unread_by_manager").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_price_change_requests_booking_id").on(t.bookingId),
]);

export const priceRequestMessagesTable = pgTable("price_request_messages", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => priceChangeRequestsTable.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_price_request_messages_request_id").on(t.requestId),
]);

export type PriceChangeRequest = typeof priceChangeRequestsTable.$inferSelect;
export type PriceRequestMessage = typeof priceRequestMessagesTable.$inferSelect;
