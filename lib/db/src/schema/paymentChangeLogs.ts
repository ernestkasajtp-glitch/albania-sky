import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { paymentsTable } from "./payments";

// Historik i plotë për ÇDO pagesë: krijim, ndryshim, anulim, konfirmim, rimbursim…
// Çdo lëvizje ruan kush e bëri (emri i përdoruesit), kur, dhe detajet.
export const paymentChangeLogsTable = pgTable("payment_change_logs", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => paymentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  userName: text("user_name").notNull().default("System"),
  userRole: text("user_role"),
  action: text("action").notNull(), // created | updated | cancelled | confirmed | unconfirmed | refund_created | note
  fieldName: text("field_name"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentChangeLog = typeof paymentChangeLogsTable.$inferSelect;
