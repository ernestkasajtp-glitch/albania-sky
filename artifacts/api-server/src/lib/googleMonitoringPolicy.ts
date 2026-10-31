import { db, flightsTable, settingsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { flightsEligibleForGoogleLookup } from "./googleLookupEligibility.js";

// Internal metadata only: no flight-schema/partner-API changes or migration.
export const googleMonitoringKey = (id: number) => `googleMonitoringDisabled.${id}`;
type Reader = Pick<typeof db, "select">;

export function googleMonitoringEnabledSql() {
  return sql`NOT EXISTS (SELECT 1 FROM ${settingsTable}
    WHERE ${settingsTable.key} = 'googleMonitoringDisabled.' || ${flightsTable.id}::text
    AND ${settingsTable.value} = 'true')`;
}

export async function googleMonitoringDisabledIds(ids: number[], database: Reader = db): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await database.select().from(settingsTable)
    .where(inArray(settingsTable.key, ids.map(googleMonitoringKey)));
  const requested = new Set(ids);
  return new Set(rows.filter(row => row.value === "true")
    .map(row => Number(row.key.slice("googleMonitoringDisabled.".length)))
    .filter(id => requested.has(id)));
}

export async function googleMonitoringDisabled(id: number, database: Reader = db): Promise<boolean> {
  return (await googleMonitoringDisabledIds([id], database)).has(id);
}

export async function googleMonitoringFlights<T extends { id: number; status?: string | null }>(
  flights: readonly T[], database: Reader = db,
): Promise<T[]> {
  const disabled = await googleMonitoringDisabledIds(flights.map(f => f.id), database);
  return flightsEligibleForGoogleLookup(flights).filter(f => !disabled.has(f.id));
}

export async function saveGoogleMonitoringDisabled(id: number, disabled: boolean) {
  return db.transaction(async tx => {
    // The same row lock as alert/seat writers prevents late results from
    // recreating Google alerts after the switch has been enabled.
    const [flight] = await tx.select().from(flightsTable).where(eq(flightsTable.id, id)).for("update");
    if (!flight) return false;
    await tx.insert(settingsTable).values({
      key: googleMonitoringKey(id), value: String(disabled),
    }).onConflictDoUpdate({
      target: settingsTable.key, set: { value: String(disabled), updatedAt: new Date() },
    });
    return true;
  });
}
