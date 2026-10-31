import { googleMonitoringEnabledSql } from "./googleMonitoringPolicy.js";
import { db, flightsTable } from "@workspace/db";
import { and, inArray, sql, type SQL } from "drizzle-orm";
import {
  findGoogleRuleForFlight, getActiveGooglePriceRules,
  type GoogleRuleFlightLike, type ResolvedGooglePriceRule,
} from "./googlePriceRules.js";

export function noGoogleRuleFlightIds(flights: (GoogleRuleFlightLike & { excludeFromGoogleRule?: boolean })[], rules: ResolvedGooglePriceRule[]): number[] {
  const activeRules = rules.filter(rule => rule.active);
  return flights.filter(flight => flight.excludeFromGoogleRule !== true && !findGoogleRuleForFlight(activeRules, flight)).map(flight => flight.id);
}

// Reuse the actual automation matcher, including recurring-flight identity scope.
// No Google requests, price computations or writes are needed for this filter.
export async function noGoogleRuleFlightsSql(tiraneNow: string): Promise<SQL> {
  // Excluded flights never belong here, including when there are no active rules.
  // This predicate is shared by list rows, badge counts and cross-page selection.
  const future = sql`(
    ${googleMonitoringEnabledSql()} AND
    (${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) >= ${tiraneNow}
    AND ${flightsTable.excludeFromGoogleRule} IS NOT TRUE
  )`;
  const rules = await getActiveGooglePriceRules();
  if (!rules.length) return future;
  const flights = await db.select({
    id: flightsTable.id,
    fromCity: flightsTable.fromCity,
    toCity: flightsTable.toCity,
    airline: flightsTable.airline,
    flightNumber: flightsTable.flightNumber,
    departureDate: flightsTable.departureDate,
    excludeFromGoogleRule: flightsTable.excludeFromGoogleRule,
  }).from(flightsTable).where(future);
  const ids = noGoogleRuleFlightIds(flights, rules);
  return and(future, ids.length ? inArray(flightsTable.id, ids) : sql`false`)!;
}
