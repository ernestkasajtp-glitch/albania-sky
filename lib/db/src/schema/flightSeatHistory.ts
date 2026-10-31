import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { flightsTable } from "./flights";

// Historiku i vendeve: një rresht për çdo ngjarje që prek vendet e një fluturimi
// (vendosje/ndryshim i numrit total, shitje, anulim, rikthim). Ruajmë gjendjen
// PAS ngjarjes (totalSeats/soldSeats) që historiku të tregojë "mbeten X vende".
export const flightSeatHistoryTable = pgTable("flight_seat_history", {
  id: serial("id").primaryKey(),
  flightId: integer("flight_id").notNull().references(() => flightsTable.id, { onDelete: "cascade" }),
  // created | total_changed | sold | cancelled | restored
  eventType: text("event_type").notNull(),
  // sa vende përfshin ngjarja (për created/total_changed = totali i ri)
  seats: integer("seats").notNull(),
  oldTotal: integer("old_total"),
  // gjendja pas ngjarjes
  totalSeats: integer("total_seats").notNull(),
  soldSeats: integer("sold_seats").notNull(),
  userId: integer("user_id"),
  userName: text("user_name").notNull().default("Sistemi"),
  userRole: text("user_role"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FlightSeatHistory = typeof flightSeatHistoryTable.$inferSelect;
