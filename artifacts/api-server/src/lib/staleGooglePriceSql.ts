import { sql } from "drizzle-orm";
import { flightsTable, googlePriceCacheTable, settingsTable } from "@workspace/db";
import { googleMonitoringEnabledSql } from "./googleMonitoringPolicy.js";

export function staleGooglePriceSql() {
  // Settings contain plain text as well as JSON. SQL may evaluate predicates in
  // any order: a WHERE key check cannot protect a cast of value. CASE guards
  // protect BOTH the outer record and its string-encoded identity.
  const record = sql`(CASE WHEN ${settingsTable.value} IS JSON OBJECT
    THEN ${settingsTable.value}::jsonb ELSE NULL END)`;
  const identityText = sql`(${record}->>'identity')`;
  const identity = sql`(CASE WHEN ${identityText} IS JSON ARRAY
    THEN ${identityText}::jsonb ELSE NULL END)`;
  return sql`(
    ${googleMonitoringEnabledSql()} AND
    (${flightsTable.scheduleAlert} = 'price_retry' OR EXISTS (SELECT 1 FROM ${googlePriceCacheTable} WHERE ${googlePriceCacheTable.cacheKey} = UPPER(${flightsTable.fromCity}) || '|' || UPPER(${flightsTable.toCity}) || '|' || ${flightsTable.departureDate} || '|' || UPPER(REGEXP_REPLACE(COALESCE(${flightsTable.flightNumber}, ''), '[[:space:]]', '', 'g')) AND ${googlePriceCacheTable.stale} = TRUE))
    AND NOT (${flightsTable.scheduleAlert} IS NOT DISTINCT FROM 'not_found'
      AND ${flightsTable.scheduleMissCount} >= 5
      AND EXISTS (SELECT 1 FROM ${settingsTable}
        WHERE ${settingsTable.key} = 'stalePriceRetry.' || ${flightsTable.id}::text
        AND ${identity} = jsonb_build_array(
          UPPER(REGEXP_REPLACE(${flightsTable.fromCity}, '[[:space:]]', '', 'g')),
          UPPER(REGEXP_REPLACE(${flightsTable.toCity}, '[[:space:]]', '', 'g')),
          UPPER(REGEXP_REPLACE(COALESCE(${flightsTable.flightNumber}, ''), '[[:space:]]', '', 'g')),
          ${flightsTable.departureDate}, ${flightsTable.departureTime}, ${flightsTable.arrivalTime}, ${flightsTable.arrivalDate})))
  )`;
}
