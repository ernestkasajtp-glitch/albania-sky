import { check, date, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { isNotNull, isNull, sql } from "drizzle-orm";
import { agentsTable } from "./agents";
import { flightsTable } from "./flights";

// Global Booking Engine allowlist. Agency-specific rules are stored separately
// and add to (rather than replace) these rules unless the agency is excluded.
export const agentFlightDefaultRulesTable = pgTable("agent_flight_default_rules", {
  id: serial("id").primaryKey(),
  fromAirport: text("from_airport"),
  toAirport: text("to_airport"),
  dateFrom: date("date_from", { mode: "string" }),
  dateTo: date("date_to", { mode: "string" }),
  // Do not silently delete an access rule when its flight is deleted. Removing
  // the last rule would otherwise switch every agency back to legacy access.
  flightId: integer("flight_id").references(() => flightsTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("agent_flight_default_route_uniq")
    .on(sql`coalesce(${table.fromAirport}, '')`, sql`coalesce(${table.toAirport}, '')`, table.dateFrom, table.dateTo)
    .where(isNull(table.flightId)),
  uniqueIndex("agent_flight_default_flight_uniq")
    .on(table.flightId).where(isNotNull(table.flightId)),
  check("agent_flight_default_shape", sql`(
    (${table.flightId} IS NOT NULL AND ${table.fromAirport} IS NULL AND ${table.toAirport} IS NULL AND ${table.dateFrom} IS NULL AND ${table.dateTo} IS NULL)
    OR (${table.flightId} IS NULL AND (${table.fromAirport} IS NOT NULL OR ${table.toAirport} IS NOT NULL) AND ${table.dateFrom} IS NOT NULL AND ${table.dateTo} IS NOT NULL AND ${table.dateFrom} <= ${table.dateTo})
  )`),
]);

export const agentFlightDefaultExclusionsTable = pgTable("agent_flight_default_exclusions", {
  agentId: integer("agent_id").primaryKey().references(() => agentsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});