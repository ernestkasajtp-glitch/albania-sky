import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { flightsTable } from "./flights";

// One row per detected schedule change on a flight that has active bookings.
// The admin reviews these in the "Fluturimet me Ndryshime Orari" page and
// chooses which recipients (agencies / customers) get the notification email.
// While a row is still pending, further schedule edits on the same flight
// update the NEW side only (the OLD side keeps the original schedule the
// passengers were sold), so the email always shows the full old → new shift.
export type ScheduleChangeSentEntry = {
  email: string;
  sentAt: string; // ISO
  bookingRefs: string[];
};

export const scheduleChangesTable = pgTable("schedule_changes", {
  id: serial("id").primaryKey(),
  flightId: integer("flight_id").notNull().references(() => flightsTable.id, { onDelete: "cascade" }),
  oldDepartureDate: text("old_departure_date").notNull(),
  oldDepartureTime: text("old_departure_time").notNull(),
  oldArrivalDate: text("old_arrival_date").notNull(),
  oldArrivalTime: text("old_arrival_time").notNull(),
  newDepartureDate: text("new_departure_date").notNull(),
  newDepartureTime: text("new_departure_time").notNull(),
  newArrivalDate: text("new_arrival_date").notNull(),
  newArrivalTime: text("new_arrival_time").notNull(),
  source: text("source").notNull().default("manual"), // 'manual' | 'sync'
  status: text("status").notNull().default("pending"), // 'pending' | 'sent' | 'dismissed'
  sentLog: jsonb("sent_log").$type<ScheduleChangeSentEntry[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_schedule_changes_flight_id").on(t.flightId),
  index("idx_schedule_changes_status").on(t.status),
]);

export type ScheduleChange = typeof scheduleChangesTable.$inferSelect;
