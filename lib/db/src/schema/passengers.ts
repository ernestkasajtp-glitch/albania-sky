import { pgTable, serial, text, integer, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";

export const passengersTable = pgTable("passengers", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("adult"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: text("gender"), // "M" | "F" | null
  dateOfBirth: text("date_of_birth"),
  nationality: text("nationality"),
  passportNumber: text("passport_number"),
  passportExpiry: text("passport_expiry"),
  seatNumber: text("seat_number"),
  baggageOption: text("baggage_option"),
  pnr: text("pnr"),
  hasSeatSelection: boolean("has_seat_selection").notNull().default(false),
  hasPriorityBoarding: boolean("has_priority_boarding").notNull().default(false),
  hasInsurance: boolean("has_insurance").notNull().default(false),
  extraCost: numeric("extra_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  ticketPrice: numeric("ticket_price", { precision: 10, scale: 2 }),
  splitGroup: integer("split_group"),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_passengers_booking_id").on(t.bookingId),
]);

export const bookingSplitsTable = pgTable("booking_splits", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  splitIndex: integer("split_index").notNull(),
  pnr: text("pnr"),
  netPrice: numeric("net_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_booking_splits_booking_id").on(t.bookingId),
]);

export const insertPassengerSchema = createInsertSchema(passengersTable).omit({ id: true, createdAt: true });
export type InsertPassenger = z.infer<typeof insertPassengerSchema>;
export type Passenger = typeof passengersTable.$inferSelect;
