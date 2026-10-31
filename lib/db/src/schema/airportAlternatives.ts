import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const airportAlternativesTable = pgTable("airport_alternatives", {
  id: serial("id").primaryKey(),
  mainAirport: text("main_airport").notNull(),
  alternativeAirport: text("alternative_airport").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AirportAlternative = typeof airportAlternativesTable.$inferSelect;
export type InsertAirportAlternative = typeof airportAlternativesTable.$inferInsert;
