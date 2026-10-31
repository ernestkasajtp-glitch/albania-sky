// Skript një-përdorimësh: kontrollo TË GJITHA rezervimet Wizz "ticketed" me PNR
// që s'kanë ende biletë të ruajtur — kërko email-in për secilin dhe ruaj PDF-të.
// Përdorimi (në VPS, te /root/artifacts/api-server):
//   nohup node --env-file=./.env dist-scripts/wizz-scan-all.mjs > /tmp/wizz-scan.log 2>&1 &
import { db, bookingsTable, flightsTable } from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { fetchWizzTicketForBooking } from "../src/lib/wizzTicket.js";

const scanWhere = and(
  eq(bookingsTable.status, "ticketed"),
  sql`${bookingsTable.pnr} IS NOT NULL AND ${bookingsTable.pnr} <> ''`,
  sql`${bookingsTable.airlineTicketUrl} IS NULL`,
  sql`${bookingsTable.ticketSearchExcluded} IS NOT TRUE`,
  sql`${flightsTable.airline} ILIKE '%wizz%'`,
);

const rows = await db
  .select({
    id: bookingsTable.id,
    ref: bookingsTable.bookingRef,
    pnr: bookingsTable.pnr,
    updatedAt: bookingsTable.updatedAt,
  })
  .from(bookingsTable)
  .innerJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
  .where(scanWhere)
  .orderBy(desc(bookingsTable.updatedAt));

console.log(`Kandidatë PA email (ticketed + PNR + Wizz + pa përjashtim): ${rows.length}`);

let found = 0;
let notFound = 0;
const failures: { ref: string; pnr: string; reason: string }[] = [];

for (const [i, r] of rows.entries()) {
  process.stdout.write(`[${i + 1}/${rows.length}] ${r.ref} (${r.pnr}) ... `);
  try {
    const res = await fetchWizzTicketForBooking(r.id);
    if (res.found) {
      found++;
      console.log(`U GJET ✓ (${res.urls?.length ?? 1} PDF)`);
    } else {
      notFound++;
      failures.push({ ref: r.ref, pnr: String(r.pnr), reason: res.reason ?? "?" });
      console.log(`s'u gjet — ${res.reason ?? "?"}`);
    }
  } catch (e: any) {
    notFound++;
    failures.push({ ref: r.ref, pnr: String(r.pnr), reason: e?.message ?? String(e) });
    console.log(`GABIM — ${e?.message ?? e}`);
  }
}

console.log("\n──────── PËRMBLEDHJE ────────");
console.log(`U gjetën dhe u ruajtën: ${found}`);
console.log(`Mbeten pa email:        ${notFound}`);
if (failures.length > 0) {
  console.log("\nPa email (arsyeja):");
  for (const f of failures) console.log(`  ${f.ref} (${f.pnr}): ${f.reason}`);
}

const [withEmail] = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(bookingsTable)
  .where(sql`${bookingsTable.airlineTicketUrl} IS NOT NULL AND ${bookingsTable.airlineTicketUrl} <> ''`);
console.log(`\nGjithsej rezervime ME biletë nga emaili në sistem: ${withEmail.n}`);
process.exit(0);
