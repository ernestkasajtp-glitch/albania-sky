import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";
import { flightsTable } from "./flights";

export const agentFlightRulesTable = pgTable("agent_flight_rules", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("exclude"),
  flightId: integer("flight_id").references(() => flightsTable.id, { onDelete: "cascade" }),
  route: text("route"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AgentFlightRule = typeof agentFlightRulesTable.$inferSelect;
