import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";

// Njoftimet e ndryshimit të fluturimit nga email-i i kompanisë ajrore.
// Kur në inbox-in e biletave vjen një email me subjektin
// "Important changes to your flight" dhe trupi përmban një PNR që ekziston
// në sistem, krijohet një rresht këtu: rezervimi shënjohet me alarm në listë
// dhe email-i ruhet si PDF te rezervimi.
export const bookingEmailAlertsTable = pgTable("booking_email_alerts", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  pnr: text("pnr"),
  // Message-ID i email-it — parandalon përpunimin e dyfishtë të të njëjtit email
  messageId: text("message_id").notNull(),
  subject: text("subject"),
  emailDate: timestamp("email_date", { withTimezone: true }),
  pdfUrl: text("pdf_url"),
  // Kur njoftimi shënohet si i lexuar (null = aktiv/i palexuar)
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Dedupe për ÇIFT (rezervim, email) — jo vetëm messageId, që një crash në mes
  // të përpunimit të mos lërë rezervime të tjera pa njoftim përgjithmonë.
  uniqueIndex("booking_email_alerts_booking_msg_uq").on(t.bookingId, t.messageId),
]);

export type BookingEmailAlert = typeof bookingEmailAlertsTable.$inferSelect;
