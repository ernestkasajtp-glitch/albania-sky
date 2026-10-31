import { pgTable, serial, text, integer, numeric, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const flightsTable = pgTable("flights", {
  id: serial("id").primaryKey(),
  airline: text("airline").notNull(),
  flightNumber: text("flight_number").notNull(),
  fromCity: text("from_city").notNull(),
  toCity: text("to_city").notNull(),
  departureDate: text("departure_date").notNull(),
  departureTime: text("departure_time").notNull(),
  arrivalDate: text("arrival_date").notNull(),
  arrivalTime: text("arrival_time").notNull(),
  adultPrice: numeric("adult_price", { precision: 10, scale: 2 }).notNull(),
  childPrice: numeric("child_price", { precision: 10, scale: 2 }).notNull(),
  infantPrice: numeric("infant_price", { precision: 10, scale: 2 }).notNull(),
  // CitizenPlane marketplace price (adult). null = use auto markup default;
  // non-null = manual per-flight override. See lib/citizenPricing in api-server.
  citizenPrice: numeric("citizen_price", { precision: 10, scale: 2 }),
  // Çmim neto informativ, plotësohet manualisht nga admini. NUK përdoret në
  // asnjë llogaritje (shitje, komisione, rregulla Google, booking-engine,
  // partner API, CP export) — shfaqet VETËM te lista e fluturimeve për admin.
  netPrice: numeric("net_price", { precision: 10, scale: 2 }),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  totalSeats: integer("total_seats").notNull(),
  soldSeats: integer("sold_seats").notNull().default(0),
  status: text("status").notNull().default("open"),
  isConfirmed: boolean("is_confirmed").notNull().default(false),
  cabinBaggageKg: numeric("cabin_baggage_kg", { precision: 5, scale: 1 }),
  checkedBaggageCount: integer("checked_baggage_count"),
  checkedBaggageKg: numeric("checked_baggage_kg", { precision: 5, scale: 1 }),
  checkedBaggagePrice: numeric("checked_baggage_price", { precision: 10, scale: 2 }),
  seatSelectionPrice: numeric("seat_selection_price", { precision: 10, scale: 2 }),
  priorityBoardingPrice: numeric("priority_boarding_price", { precision: 10, scale: 2 }),
  insurancePrice: numeric("insurance_price", { precision: 10, scale: 2 }),
  notes: text("notes"),
  sellCutoffHours: integer("sell_cutoff_hours"),
  showInBookingEngine: boolean("show_in_booking_engine").notNull().default(true),
  // When true, this flight is BLOCKED for all EXTERNAL sales channels: the
  // public booking-engine shows it as sold out (0 seats), the partner API
  // (/v1/*) reports status "closed" + 0 available seats, and the CitizenPlane
  // export sends 0 available seats. Internal (flight-system) bookings are
  // NOT affected. Toggled via the flights list bulk action / side panel.
  externalSalesBlocked: boolean("external_sales_blocked").notNull().default(false),
  // When true, this flight is SKIPPED by the automated Google price-rules writer
  // (applyGooglePriceRulesToFlights), so its adult/child price never changes
  // automatically — manual prices stick. Default false = normal automation.
  excludeFromGoogleRule: boolean("exclude_from_google_rule").notNull().default(false),
  scheduleAlert: text("schedule_alert"),
  scheduleAlertDetail: text("schedule_alert_detail"),
  scheduleCheckedAt: timestamp("schedule_checked_at", { withTimezone: true }),
  scheduleMissCount: integer("schedule_miss_count").notNull().default(0),
  seatAlert: text("seat_alert"),
  seatAlertDetail: text("seat_alert_detail"),
  seatGooglePrice: numeric("seat_google_price", { precision: 10, scale: 2 }),
  seatCheckedAt: timestamp("seat_checked_at", { withTimezone: true }),
  seatMissCount: integer("seat_miss_count").notNull().default(0),
  seatMissLastAt: timestamp("seat_miss_last_at", { withTimezone: true }),
  // Set when a user acknowledges ("Confirm") a flight's Njoftime alert — powers
  // the "Konfirmuar" tab. Cleared alerts leave Njoftime; this preserves the record.
  alertDismissedAt: timestamp("alert_dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_flights_departure_date").on(t.departureDate),
  index("idx_flights_status").on(t.status),
  index("idx_flights_from_city").on(t.fromCity),
  index("idx_flights_to_city").on(t.toCity),
  index("idx_flights_from_to").on(t.fromCity, t.toCity),
]);

export const insertFlightSchema = createInsertSchema(flightsTable).omit({ id: true, soldSeats: true, scheduleAlert: true, scheduleAlertDetail: true, scheduleCheckedAt: true, scheduleMissCount: true, seatAlert: true, seatAlertDetail: true, seatGooglePrice: true, seatCheckedAt: true, seatMissCount: true, seatMissLastAt: true, alertDismissedAt: true, createdAt: true, updatedAt: true });
export type InsertFlight = z.infer<typeof insertFlightSchema>;
export type Flight = typeof flightsTable.$inferSelect;
