import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { flightsTable } from "./flights";

// Historiku i detajuar i ndryshimeve të fluturimit — një rresht për çdo ngjarje
// (krijim, editim, sinkronizim orari, dublikim, ndryshim masiv, etj.). Fusha
// `changes` mban listën e fushave të ndryshuara me vlerën e vjetër → të re,
// kështu që çdo ndryshim shfaqet i detajuar: kush, kur, çfarë.
export type FlightFieldChange = { field: string; old: string | null; new: string | null };

export const flightChangeHistoryTable = pgTable("flight_change_history", {
  id: serial("id").primaryKey(),
  flightId: integer("flight_id").notNull().references(() => flightsTable.id, { onDelete: "cascade" }),
  // Burimi i ndryshimit: create | edit | sync-schedule | duplicate | bulk |
  // toggle-sales | citizen-price | extend | import | auto
  source: text("source").notNull(),
  changes: jsonb("changes").$type<FlightFieldChange[]>().notNull().default([]),
  note: text("note"),
  userId: integer("user_id"),
  userName: text("user_name").notNull().default("Sistemi"),
  userRole: text("user_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_flight_change_history_flight").on(t.flightId),
]);

export type FlightChangeHistory = typeof flightChangeHistoryTable.$inferSelect;
