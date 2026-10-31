import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const teamChatMessagesTable = pgTable("team_chat_messages", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamChatMessage = typeof teamChatMessagesTable.$inferSelect;
