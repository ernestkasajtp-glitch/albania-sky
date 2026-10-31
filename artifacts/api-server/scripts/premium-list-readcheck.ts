// Read-only parity check. Prints counts/timings only, never customer information.
import assert from "node:assert/strict";
import { db, bookingsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { loadPremiumBookingIndex } from "../src/lib/premiumBookingIndex.js";
import { getBatchFullBookings, attachBookingListMetadata } from "../src/routes/bookings.js";
import { premiumListResult } from "../src/lib/premiumBookingListLogic.js";
import { QueryPremiumBookingsBody } from "@workspace/api-zod";
try {
  const start = Date.now();
  const compact = await loadPremiumBookingIndex();
  const compactMs = Date.now()-start;
  const fullStart = Date.now();
  const full = await getBatchFullBookings(await db.select().from(bookingsTable).orderBy(desc(bookingsTable.createdAt)));
  await attachBookingListMetadata(full);
  const fullMs = Date.now()-fullStart;
  const lookup = new Map(compact.map(b=>[b.id,b]));
  for (const b of full) {
    const c = lookup.get(b.id);
    assert.ok(c);
    for (const key of ["paidAmount","dueAmount","creditAmount","commissionAmount","totalAmount","agentName","emailAlertsCount"]) {
      assert.equal(c[key], (b as any)[key], `${key} parity`);
    }
    (b as any).hiddenFromReports = c.hiddenFromReports;
  }
  const queries: any[] = [{}, {paymentFilter:"paid"}, {paymentFilter:"partial"}, {paymentFilter:"unpaid"},
    {statusFilter:"ticketed"},{emailTicketFilter:"with"},{emailTicketFilter:"without"},
    {alertFilter:"with"},{unsentTicketFilter:true},{flightSearch:"TIA"},{search:"KTF"},
    {flightDateFrom:"2026-10-01",flightDateTo:"2026-10-31"}];
  for (const extra of queries) for (const sortBy of ["","pnr","klienti","neto","agjencia","financa"]) {
    const q = QueryPremiumBookingsBody.parse({todayISO:"2026-10-03",loadAll:true,exportAll:true,...extra,sortBy});
    assert.deepEqual(premiumListResult(compact,q,false),premiumListResult(full,q,false),`filter/sort parity ${sortBy}`);
  }
  console.log(JSON.stringify({pass:true, rows:full.length, compactMs, fullMs,
    compactBytes:Buffer.byteLength(JSON.stringify(compact)),fullBytes:Buffer.byteLength(JSON.stringify(full)),
    comparisons:queries.length*6}));
  process.exit(0);
} catch(error) { console.error(error instanceof Error ? error.message : "Read check failed"); process.exit(1); }