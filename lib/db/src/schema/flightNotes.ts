import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Shënime brenda fluturimit (si bisedë) — të pandryshueshme pas dërgimit.
// Vetëm për sistemin e brendshëm (FMS); s'dalin kurrë te faqja publike apo API i partnerëve.
export const flightNotesTable = pgTable("flight_notes", {
  id: serial("id").primaryKey(),
  flightId: integer("flight_id").notNull(),
  authorId: integer("author_id"),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FlightNote = typeof flightNotesTable.$inferSelect;
