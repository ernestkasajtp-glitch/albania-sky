import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { bookingUsersTable } from "./bookingUsers";

export const userPermissionsTable = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => bookingUsersTable.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserPermission = typeof userPermissionsTable.$inferSelect;
