import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const agentActivityTable = pgTable(
  "agent_activity",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    type: text("type").notNull(), // "login" | "pageview" | "action"
    method: text("method"),
    path: text("path"),
    description: text("description"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    statusCode: integer("status_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_activity_agent_created_idx").on(t.agentId, t.createdAt)],
);

export type AgentActivity = typeof agentActivityTable.$inferSelect;
