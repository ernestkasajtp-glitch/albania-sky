import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const paymentMethodsTable = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
