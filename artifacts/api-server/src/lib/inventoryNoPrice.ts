import { sql, and } from "drizzle-orm";
import { flightsTable as f, googlePriceCacheTable as g } from "@workspace/db";
import { googleMonitoringEnabledSql } from "./googleMonitoringPolicy";

const match = sql`${g.cacheKey} = UPPER(${f.fromCity}) || '|' || UPPER(${f.toCity}) || '|' || ${f.departureDate} || '|' || UPPER(REGEXP_REPLACE(COALESCE(${f.flightNumber}, ''), '[[:space:]]', '', 'g'))`;
// Inventory-only predicate. Never reuse in cancellation detection or warmers.
export function inventoryNoPriceSql() {
  return and(googleMonitoringEnabledSql(), sql`${f.status} NOT IN ('soldout','cancelled')`,
    sql`NOT EXISTS (SELECT 1 FROM ${g} WHERE ${match} AND ${g.price} IS NOT NULL AND ${g.stale} = FALSE)`);
}
export function inventoryNoPriceReasonSql() {
  return sql<string>`CASE
    WHEN ${f.scheduleAlert} = 'verified_no_price' THEN 'Mungesë çmimi e konfirmuar'
    WHEN ${f.scheduleAlert} = 'price_retry' OR EXISTS (SELECT 1 FROM ${g} WHERE ${match} AND ${g.stale} = TRUE) THEN 'Kontrolli dështoi'
    WHEN NOT EXISTS (SELECT 1 FROM ${g} WHERE ${match}) THEN 'Ende pa kontroll'
    ELSE 'Pa çmim të disponueshëm' END`;
}
