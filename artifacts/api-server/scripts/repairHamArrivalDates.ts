import { db, flightsTable, bookingsTable } from "@workspace/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { recordFlightChange } from "../src/routes/flights";
import { recordScheduleChange } from "../src/lib/scheduleChangeNotify";

const ids = [10423, 10424, 10425, 10426, 10427];
const apply = process.argv.includes("--apply");
const repaired = await db.transaction(async tx => {
  const rows = await tx.select().from(flightsTable).where(inArray(flightsTable.id, ids)).for("update");
  if (rows.length !== 5) throw Error("Expected exactly five known flights");
  const active = await tx.select({ id: bookingsTable.id }).from(bookingsTable)
    .where(and(inArray(bookingsTable.flightId, ids), ne(bookingsTable.status, "cancelled")));
  if (active.length) throw Error("Bookings now exist: stop for reassessment");
  const output = [];
  for (const row of rows) {
    if (row.fromCity !== "HAM" || row.toCity !== "PRN" || row.flightNumber !== "W62968"
      || row.soldSeats !== 0 || row.arrivalTime <= row.departureTime) throw Error("Flight changed; stop");
    if (row.arrivalDate === row.departureDate) continue;
    const days = (Date.parse(row.arrivalDate) - Date.parse(row.departureDate)) / 86400000;
    if (days !== 2) throw Error("Unexpected arrival offset");
    console.log(JSON.stringify({ id: row.id, old: row.arrivalDate, new: row.departureDate, apply }));
    if (apply) {
      const [after] = await tx.update(flightsTable).set({ arrivalDate: row.departureDate, updatedAt: new Date() })
        .where(eq(flightsTable.id, row.id)).returning();
      output.push({ before: row, after });
    }
  }
  return output;
});
for (const { before, after } of repaired) {
  await recordFlightChange({ req: null, flightId: after.id, source: "edit", before, after,
    note: "Korrigjim i autorizuar: mbërritja +2 ditë ishte gabim; fluturimi mbërrin brenda ditës." });
  await recordScheduleChange(before, after, "manual");
}
// Allow the existing change-email digest to flush before exiting.
if (repaired.length) await new Promise(resolve => setTimeout(resolve, 75000));
process.exit(0);
