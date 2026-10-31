import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const webhookLogsTable = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("external"),
  status: text("status").notNull().default("pending"),
  bookingId: integer("booking_id"),
  bookingRef: text("booking_ref"),
  rawPayload: text("raw_payload").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WebhookLog = typeof webhookLogsTable.$inferSelect;
