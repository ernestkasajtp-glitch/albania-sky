import { pgTable, serial, text, integer, numeric, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { flightsTable } from "./flights";
import { agentsTable } from "./agents";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  bookingRef: text("booking_ref").notNull().unique(),
  flightId: integer("flight_id").notNull().references(() => flightsTable.id),
  agentId: integer("agent_id").references(() => agentsTable.id),
  bookingUserId: integer("booking_user_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default("draft"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  markup: numeric("markup", { precision: 10, scale: 2 }).notNull().default("0"),
  commission: numeric("commission", { precision: 10, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  pnr: text("pnr"),
  // PDF i biletës së konfirmuar nga email-i i Wizzair (auto-gjetur në inbox-in e biletave)
  airlineTicketUrl: text("airline_ticket_url"),
  // Përjashto këtë rezervim nga kërkimi i biletës në email (skaner + manual + badge)
  ticketSearchExcluded: boolean("ticket_search_excluded").notNull().default(false),
  // Rezultati i fundit i kërkimit të biletës në email — shënim i përhershëm afër butonit
  ticketSearchNote: text("ticket_search_note"),
  ticketSearchNoteAt: timestamp("ticket_search_note_at", { withTimezone: true }),
  // Bileta është lëshuar, por emaili i statusit "ticketed" është lënë për t'u dërguar më vonë.
  ticketEmailPending: boolean("ticket_email_pending").notNull().default(false),
  ticketEmailSentAt: timestamp("ticket_email_sent_at", { withTimezone: true }),
  netPrice: numeric("net_price", { precision: 10, scale: 2 }),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_bookings_status").on(t.status),
  index("idx_bookings_agent_id").on(t.agentId),
  index("idx_bookings_flight_id").on(t.flightId),
  index("idx_bookings_created_at").on(t.createdAt),
  index("idx_bookings_customer_name").on(t.customerName),
  index("idx_bookings_booking_user_id").on(t.bookingUserId),
]);

export const bookingExtrasTable = pgTable("booking_extras", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_booking_extras_booking_id").on(t.bookingId),
]);

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, bookingRef: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
export type BookingExtra = typeof bookingExtrasTable.$inferSelect;
