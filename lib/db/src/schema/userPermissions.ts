import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { bookingUsersTable } from "./bookingUsers";

export const userPermissionsTable = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => bookingUsersTable.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_user_permissions_user_id").on(t.userId),
]);

export type UserPermission = typeof userPermissionsTable.$inferSelect;
