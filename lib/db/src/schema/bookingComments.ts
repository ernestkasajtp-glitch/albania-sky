import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

// Shënime brenda rezervimit (si bisedë) — të pandryshueshme pas dërgimit,
// me mundësi reply (parentId) mbi një shënim ekzistues.
export const bookingCommentsTable = pgTable("booking_comments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  parentId: integer("parent_id"),
  authorId: integer("author_id"),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_booking_comments_booking_id").on(t.bookingId),
]);

export type BookingComment = typeof bookingCommentsTable.$inferSelect;
