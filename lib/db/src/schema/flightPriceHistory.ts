import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { flightsTable } from "./flights";

// One row per change to a flight's own ("our") price. We snapshot the Google
// Flights price at the moment of the change so the history can show both
// side-by-side (our price vs Google) over time, plus who changed it and when.
export const flightPriceHistoryTable = pgTable("flight_price_history", {
  id: serial("id").primaryKey(),
  flightId: integer("flight_id").notNull().references(() => flightsTable.id, { onDelete: "cascade" }),
  oldAdultPrice: numeric("old_adult_price", { precision: 10, scale: 2 }),
  newAdultPrice: numeric("new_adult_price", { precision: 10, scale: 2 }).notNull(),
  googlePrice: numeric("google_price", { precision: 10, scale: 2 }),
  userId: integer("user_id"),
  userName: text("user_name").notNull().default("System"),
  userRole: text("user_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FlightPriceHistory = typeof flightPriceHistoryTable.$inferSelect;
