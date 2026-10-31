import { check, date, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { isNotNull, isNull, sql } from "drizzle-orm";
import { agentsTable } from "./agents";
import { flightsTable } from "./flights";

// A route/date window, or an explicit exception for a single flight.
export const agentFlightVisibilityTable = pgTable("agent_flight_visibility", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  fromAirport: text("from_airport"),
  toAirport: text("to_airport"),
  dateFrom: date("date_from", { mode: "string" }),
  dateTo: date("date_to", { mode: "string" }),
  flightId: integer("flight_id").references(() => flightsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("agent_flight_visibility_agent_idx").on(table.agentId),
  uniqueIndex("agent_flight_visibility_route_uniq")
    .on(table.agentId, sql`coalesce(${table.fromAirport}, '')`, sql`coalesce(${table.toAirport}, '')`, table.dateFrom, table.dateTo)
    .where(isNull(table.flightId)),
  uniqueIndex("agent_flight_visibility_flight_uniq")
    .on(table.agentId, table.flightId).where(isNotNull(table.flightId)),
  check("agent_flight_visibility_shape", sql`(
    (${table.flightId} IS NOT NULL AND ${table.fromAirport} IS NULL AND ${table.toAirport} IS NULL AND ${table.dateFrom} IS NULL AND ${table.dateTo} IS NULL)
    OR (${table.flightId} IS NULL AND (${table.fromAirport} IS NOT NULL OR ${table.toAirport} IS NOT NULL) AND ${table.dateFrom} IS NOT NULL AND ${table.dateTo} IS NOT NULL AND ${table.dateFrom} <= ${table.dateTo})
  )`),
]);

export type AgentFlightVisibilityRule = typeof agentFlightVisibilityTable.$inferSelect;