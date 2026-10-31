import { sql } from "drizzle-orm";
import { flightsTable as f, settingsTable as s } from "@workspace/db";
import { googleMonitoringEnabledSql } from "./googleMonitoringPolicy.js";

// Use the same evidence and identity as loadSuspectRechecks. No new writer,
// timer or counter; malformed settings must never count as cancellation proof.
export function possibleCancellationSql() {
  const record = sql`(CASE WHEN ${s.value} IS JSON OBJECT THEN ${s.value}::jsonb ELSE NULL END)`;
  const text = sql`(${record}->>'identity')`;
  const identity = sql`(CASE WHEN ${text} IS JSON ARRAY THEN ${text}::jsonb ELSE NULL END)`;
  const misses = sql`(CASE WHEN (${record}->>'missingChecks') ~ '^[0-9]+$'
    THEN (${record}->>'missingChecks')::numeric ELSE 0 END)`;
  return sql`(${googleMonitoringEnabledSql()}
    AND ${f.status} NOT IN ('soldout', 'cancelled')
    AND ${f.scheduleAlert} = 'not_found'
    AND EXISTS (SELECT 1 FROM ${s}
      WHERE ${s.key} = 'suspectFlightRecheck.' || ${f.id}::text
      AND ${record}->>'outcome' = 'missing' AND ${misses} >= 5
      AND ${identity} = jsonb_build_array(
        ${f.fromCity}, ${f.toCity}, ${f.departureDate}, ${f.departureTime},
        UPPER(REGEXP_REPLACE(COALESCE(${f.flightNumber}, ''), '[[:space:]]', '', 'g')),
        ${f.scheduleAlert}, ${f.scheduleAlertDetail},
        CASE WHEN ${f.alertDismissedAt} IS NULL THEN NULL
          ELSE to_char(${f.alertDismissedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        ${f.arrivalTime}, ${f.arrivalDate}
      )
    ))`;
}
