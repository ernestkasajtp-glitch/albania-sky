import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Saved "new flights" found via Google for selected flight types on the
// Flight Types page. Persists per route/destination until the admin acts on
// each candidate: adding it (creates a real flight) or dismissing it both
// delete the row. Until then the saved list survives reloads.
export const foundFlightsTable = pgTable("found_flights", {
  id: serial("id").primaryKey(),
  flightNumber: text("flight_number").notNull(),
  airline: text("airline").notNull().default(""),
  fromCity: text("from_city").notNull(),
  toCity: text("to_city").notNull(),
  departureDate: text("departure_date").notNull(), // YYYY-MM-DD (the new date found)
  departureTime: text("departure_time").notNull().default(""),
  arrivalTime: text("arrival_time").notNull().default(""),
  googlePrice: numeric("google_price", { precision: 10, scale: 2 }),
  searchStart: text("search_start"), // interval used for the search (metadata)
  searchEnd: text("search_end"),
  foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqCandidate: uniqueIndex("found_flights_uniq").on(t.fromCity, t.toCity, t.flightNumber, t.departureDate),
}));

export type FoundFlight = typeof foundFlightsTable.$inferSelect;
export type NewFoundFlight = typeof foundFlightsTable.$inferInsert;
