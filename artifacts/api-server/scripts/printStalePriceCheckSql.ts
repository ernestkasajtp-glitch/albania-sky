// Emit the real shared predicate for a read-only production smoke check.
// This script never connects to, or changes, production.
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { flightsTable, pool } from "@workspace/db";
import { staleGooglePriceSql } from "../src/lib/staleGooglePriceSql.js";

const query = new PgDialect().sqlToQuery(sql`
  SELECT count(*) AS upcoming,
    count(*) FILTER (WHERE ${staleGooglePriceSql()}) AS stale
  FROM ${flightsTable}
  WHERE (${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime})
    >= to_char(NOW() AT TIME ZONE 'Europe/Tirane', 'YYYY-MM-DD HH24:MI')
    AND ${flightsTable.status} != 'soldout'
`);
if (query.params.length) throw new Error("Unexpected query parameters");
console.log(`BEGIN READ ONLY;\nSET LOCAL statement_timeout = '15s';\n${query.sql};\nROLLBACK;`);
await pool.end();
