import { pgTable, integer, text, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bookingUsersTable } from "./bookingUsers";
import { agencyGroupsTable } from "./agencyGroups";

// Absence deliberately means a pre-existing account, not pending approval.
export const publicEnrollmentsTable = pgTable("public_enrollments", {
  userId: integer("user_id").primaryKey().references(() => bookingUsersTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").references(() => agencyGroupsTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: integer("approved_by"),
  notificationStatus: text("notification_status").notNull().default("pending"),
  notificationError: text("notification_error"),
  activationStatus: text("activation_status").notNull().default("pending"),
  activationError: text("activation_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("public_enrollment_approval_group", sql`${table.approvedAt} IS NULL OR ${table.groupId} IS NOT NULL`),
  index("public_enrollments_pending_idx").on(table.createdAt).where(sql`${table.approvedAt} IS NULL`),
]);