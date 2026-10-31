import { check, date, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const agencyGroupsTable = pgTable("agency_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const agencyGroupRulesTable = pgTable("agency_group_rules", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => agencyGroupsTable.id, { onDelete: "cascade" }),
  airport: text("airport").notNull(),
  direction: text("direction").notNull(),
  dateFrom: date("date_from", { mode: "string" }),
  dateTo: date("date_to", { mode: "string" }),
}, (table) => [
  uniqueIndex("agency_group_rules_unique").on(table.groupId, table.airport, table.direction,
    sql`coalesce(${table.dateFrom}, '-infinity'::date)`, sql`coalesce(${table.dateTo}, 'infinity'::date)`),
  check("agency_group_rules_airport_check", sql`${table.airport} ~ '^[A-Z]{3}$'`),
  check("agency_group_rules_direction_check", sql`${table.direction} IN ('either', 'from', 'to')`),
  check("agency_group_rules_dates_check", sql`(${table.dateFrom} IS NULL AND ${table.dateTo} IS NULL) OR
    (${table.dateFrom} IS NOT NULL AND ${table.dateTo} IS NOT NULL AND ${table.dateFrom} <= ${table.dateTo})`),
]);