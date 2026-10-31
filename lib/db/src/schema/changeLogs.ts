import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { bookingsTable } from "./bookings";

export const bookingChangeLogsTable = pgTable("booking_change_logs", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  userName: text("user_name").notNull().default("System"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  fieldName: text("field_name"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookingChangeLog = typeof bookingChangeLogsTable.$inferSelect;
