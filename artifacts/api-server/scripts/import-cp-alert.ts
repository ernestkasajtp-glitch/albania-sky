// Import manual i një rezervimi CitizenPlane nga raw CSV i ruajtur në cp_import_alerts.
// Përdorimi: ALERT_ID=108 [DRY_RUN=1] node dist-scripts/import-cp-alert.mjs
import { db, cpImportAlertsTable, flightsTable, bookingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { importCpBookingsFromText } from "../src/lib/pnlImport.js";

const ALERT_ID = Number(process.env.ALERT_ID || 0);
const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  if (!ALERT_ID) throw new Error("ALERT_ID mungon");
  const [alert] = await db.select().from(cpImportAlertsTable).where(eq(cpImportAlertsTable.id, ALERT_ID));
  if (!alert) throw new Error(`Alert ${ALERT_ID} nuk u gjet`);
  if (!alert.rawCsv) throw new Error(`Alert ${ALERT_ID} s'ka raw CSV`);
  console.log("Alert:", alert.id, alert.cpCode, alert.fileName, "resolved:", alert.resolvedAt);
  console.log("CSV rreshta:", alert.rawCsv.split("\n").length);

  if (DRY_RUN) {
    console.log("DRY_RUN=1 — nuk importohet asgjë. CSV head:");
    console.log(alert.rawCsv.split("\n").slice(0, 3).join("\n"));
    return;
  }

  const result = await importCpBookingsFromText(alert.rawCsv, alert.fileName || `alert_${ALERT_ID}.csv`);
  console.log("Rezultati:", JSON.stringify({ ...result, failedFileRaw: undefined }, null, 2));

  if (result.bookingsCreated > 0 && result.errors.length === 0) {
    await db.update(cpImportAlertsTable).set({ resolvedAt: new Date() }).where(eq(cpImportAlertsTable.id, ALERT_ID));
    console.log("Alert u shënua i zgjidhur.");
    const rows = await db.select({ id: bookingsTable.id, ref: bookingsTable.bookingReference, notes: bookingsTable.notes })
      .from(bookingsTable).where(sql`notes LIKE ${'%' + (alert.cpCode || '') + '%'}`);
    console.log("Rezervimet me këtë kod CP:", rows.map(r => `${r.id}/${r.ref}`).join(", "));
    if (rows.length) {
      const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, rows[0].id));
      const [f] = await db.select({ soldSeats: flightsTable.soldSeats, totalSeats: flightsTable.totalSeats, status: flightsTable.status })
        .from(flightsTable).where(eq(flightsTable.id, b.flightId));
      console.log("Fluturimi pas importit:", JSON.stringify(f));
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("GABIM:", e?.message || e); process.exit(1); });
