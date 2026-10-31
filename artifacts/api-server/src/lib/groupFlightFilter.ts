import { eq, sql, type SQL } from "drizzle-orm";
import { db, agencyGroupsTable, agencyGroupRulesTable, flightsTable } from "@workspace/db";

// Internal Flights inventory filter. It describes group rules, not agency-specific exceptions.
export function groupFlightCondition(groupId?: number): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${agencyGroupRulesTable}
    WHERE ${groupId === undefined ? sql`TRUE` : sql`${agencyGroupRulesTable.groupId} = ${groupId}`}
      AND (
        (${agencyGroupRulesTable.direction} IN ('either', 'from')
          AND upper(trim(${flightsTable.fromCity})) = ${agencyGroupRulesTable.airport})
        OR (${agencyGroupRulesTable.direction} IN ('either', 'to')
          AND upper(trim(${flightsTable.toCity})) = ${agencyGroupRulesTable.airport})
      )
      -- Flight departure_date is ISO text; YYYY-MM-DD sorts identically to date values.
      AND (${agencyGroupRulesTable.dateFrom} IS NULL OR ${flightsTable.departureDate} >= ${agencyGroupRulesTable.dateFrom}::text)
      AND (${agencyGroupRulesTable.dateTo} IS NULL OR ${flightsTable.departureDate} <= ${agencyGroupRulesTable.dateTo}::text)
  )`;
}

export async function resolveGroupFlightFilter(
  value: unknown,
  role: string | undefined,
): Promise<{ condition?: SQL; groupId?: number; error?: { status: number; message: string } }> {
  if (value === undefined) return {};
  if (role !== "admin") return { error: { status: 403, message: "Vetëm administratori mund të filtrojë sipas grupit" } };
  if (value === "none") return { condition: sql`NOT (${groupFlightCondition()})`, groupId: 0 };
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return { error: { status: 400, message: "ID e grupit nuk është e vlefshme" } };
  }
  const groupId = Number(value);
  const [group] = await db.select({ id: agencyGroupsTable.id })
    .from(agencyGroupsTable).where(eq(agencyGroupsTable.id, groupId)).limit(1);
  if (!group) return { error: { status: 400, message: "Grupi nuk ekziston" } };
  return { condition: groupFlightCondition(groupId), groupId };
}