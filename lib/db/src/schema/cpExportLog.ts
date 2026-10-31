import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const cpExportLogTable = pgTable("cp_export_log", {
  id: serial("id").primaryKey(),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
  flightsExported: integer("flights_exported").notNull().default(0),
  status: text("status").notNull().default("success"),
  errors: text("errors"),
  source: text("source").notNull().default("cron"),
});

export type CpExportLog = typeof cpExportLogTable.$inferSelect;
