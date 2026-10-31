import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const assistantActionsTable = pgTable(
  "assistant_actions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull(),
    actionType: text("action_type").notNull(),
    module: text("module").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    warning: text("warning").notNull(),
    path: text("path").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    precondition: jsonb("precondition")
      .$type<Record<string, unknown>>()
      .notNull(),
    status: text("status").notNull().default("pending"),
    resultMessage: text("result_message"),
    errorMessage: text("error_message"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("assistant_actions_user_status_idx").on(t.userId, t.status),
    index("assistant_actions_expires_idx").on(t.expiresAt),
  ],
);

export type AssistantAction = typeof assistantActionsTable.$inferSelect;