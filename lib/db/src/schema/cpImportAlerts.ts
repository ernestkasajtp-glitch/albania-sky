import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// In-system, admin-only notifications raised when a CitizenPlane import fails.
// Two kinds:
//   - "booking":    a specific file/booking could not be imported (not enough
//                   seats, flight not found, bad CSV, …). Usually carries a cpCode.
//   - "connection": the whole channel failed to connect (SFTP or email/IMAP).
export const cpImportAlertsTable = pgTable("cp_import_alerts", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // 'booking' | 'connection'
  source: text("source").notNull().default("citizenplane"), // 'sftp' | 'email' | 'citizenplane'
  cpCode: text("cp_code"),
  fileName: text("file_name"),
  reason: text("reason").notNull(),
  // Raw CSV content of the failed file — lets an admin recover passenger data
  // even though the source file is deleted from the SFTP after processing.
  rawCsv: text("raw_csv"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type CpImportAlert = typeof cpImportAlertsTable.$inferSelect;
