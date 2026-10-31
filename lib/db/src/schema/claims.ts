import { pgTable, serial, text, integer, timestamp, uuid, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { bookingsTable } from "./bookings";
import { bookingUsersTable } from "./bookingUsers";

export const claimsTable = pgTable("claims", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("open"),
  creatorId: integer("creator_id").references(() => bookingUsersTable.id, { onDelete: "set null" }),
  requestId: uuid("request_id").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("claims_request_id_unique").on(t.requestId), index("claims_created_at_idx").on(t.createdAt)]);

export const claimBookingsTable = pgTable("claim_bookings", {
  claimId: integer("claim_id").notNull().references(() => claimsTable.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.claimId, t.bookingId] }), index("claim_bookings_booking_idx").on(t.bookingId)]);

export const insertClaimSchema = createInsertSchema(claimsTable).omit({ id: true, createdAt: true, updatedAt: true, version: true });
export type Claim = typeof claimsTable.$inferSelect;
export type InsertClaim = typeof claimsTable.$inferInsert;
