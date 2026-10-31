import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const bookingUsersTable = pgTable("booking_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone"),
  role: text("role").notNull().default("client"),
  agentId: integer("agent_id"),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookingUser = typeof bookingUsersTable.$inferSelect;

export const bookingUserRoleChangeLogsTable = pgTable(
  "booking_user_role_change_logs",
  {
    id: serial("id").primaryKey(),
    targetUserId: integer("target_user_id").notNull(),
    actorUserId: integer("actor_user_id"),
    actorName: text("actor_name").notNull().default("System"),
    actorRole: text("actor_role"),
    oldRole: text("old_role").notNull(),
    newRole: text("new_role").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_user_role_logs_target_created_idx").on(t.targetUserId, t.createdAt)],
);

export type BookingUserRoleChangeLog = typeof bookingUserRoleChangeLogsTable.$inferSelect;
