import { pgTable, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { bookingUsersTable } from "./bookingUsers";

export const bookingColumnPreferencesTable = pgTable("booking_column_preferences", {
  userId: integer("user_id").primaryKey().references(() => bookingUsersTable.id, { onDelete: "cascade" }),
  visibleColumns: text("visible_columns").array().notNull(),
  columnWidths: jsonb("column_widths").$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});