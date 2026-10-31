import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const apiRequire = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const { build } = apiRequire("esbuild");
const uiRequire = createRequire(new URL("../artifacts/flight-system/package.json", import.meta.url));
const { format } = uiRequire("date-fns");
await build({ entryPoints: ["artifacts/api-server/src/lib/premiumBookingListLogic.ts"], bundle: true, platform: "node",
  format: "esm", outfile: "/tmp/premium-list-logic.mjs" });
const { premiumListResult, premiumSearch, premiumPnrs, premiumEmailState } = await import(pathToFileURL("/tmp/premium-list-logic.mjs"));
await build({ stdin: { contents: 'export {QueryPremiumBookingsBody} from "@workspace/api-zod";',
  resolveDir: process.cwd() + "/artifacts/api-server" }, bundle: true, platform: "node", format: "esm", outfile: "/tmp/premium-list-schema.mjs" });
const { QueryPremiumBookingsBody } = await import(pathToFileURL("/tmp/premium-list-schema.mjs"));
const source = fs.readFileSync("scripts/fixtures/premium-list-legacy.txt", "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const legacy = (rows, q) => Function(...Object.keys(q), "useMemo", "useCallback", "bookingMatchesSearch", "bookingPnrList", "ticketEmailState", "dueEuro", "format", "PER_PAGE",
  code + "\nreturn legacyPremiumSelection;")(...Object.values(q), fn => fn(), fn => fn, premiumSearch, premiumPnrs, premiumEmailState,
  n => n < 1 ? 0 : Math.round(n), format, 50)(rows);
const statuses = ["draft", "pending", "confirmed", "ticketed", "cancelled"];
const rows = Array.from({ length: 151 }, (_, i) => ({
  id: i + 1, bookingRef: `KTF${1000+i}`, status: statuses[i % 5], agentId: i % 3,
  agentName: ["Agency 2", "Agency 10", ""][i % 3], hiddenFromReports: i % 3 === 2,
  createdAt: new Date(Date.UTC(2026, 9, 3 - i % 12, i % 24)).toISOString(),
  totalAmount: 100+i, netPrice: i % 4 ? 130 : null, commissionAmount: i % 4 ? i-30 : null,
  paidAmount: i % 3 ? 30 : 0, dueAmount: i % 4 ? 70 : 0, creditAmount: i % 7,
  customerName: "Test Person", notes: i % 2 ? "[CP:ABCD]" : "", pnr: i % 2 ? "ABCDEF" : "",
  passengers: [{firstName: "Test", lastName: "Person", type: i % 6 ? "adult" : "infant",
    cancelled: i % 8 === 0, groupPnr: i % 4 ? "GROUP1" : "", pnr: i % 3 ? "PNR002" : ""}],
  flight: { airline: "Wizz Air", fromCity: "TIA", toCity: i % 2 ? "HAM" : "MXP",
    departureDate: `2026-10-${String(i % 28 + 1).padStart(2, "0")}`, departureTime: "10:20" },
  emailAlertsCount: i % 5 === 0 ? 1 : 0, ticketEmailPending: i % 2 === 0,
  ticketSearchExcluded: i % 7 === 0, airlineTicketUrl: i % 3 ? "" : "/test.pdf",
  ticketSearchNote: i % 9 ? "" : "Emaili më i fundit: 1 biletë ekzistuese, 2 pa email",
})).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
let checked = 0;
for (let n=0; n<360; n++) {
  const q = QueryPremiumBookingsBody.parse({
    todayISO: "2026-10-03", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale, loadAll: true, page: 1,
    search: ["", "test", "ABCD", "Test Person"][n%4],
    statusFilter: ["", "ticketed", "draft"][Math.floor(n/4)%3],
    agentFilter: n%4 ? [] : ["1"], paymentFilter: ["","paid","partial","unpaid"][Math.floor(n/12)%4],
    emailTicketFilter: ["","with","without"][Math.floor(n/48)%3],
    alertFilter: ["","with","without"][n%3], unsentTicketFilter: n%11===0,
    flightDateFrom: n%2 ? "2026-10-10" : "", flightDateTo: n%2 ? "2026-10-20" : "",
    dateFrom: "2026-10-01", dateTo: "2026-10-03",
    sortBy: ["", "date", "ref", "pnr", "klienti", "agjencia", "fluturimi", "flightDate", "flightTime", "pax", "financa", "neto", "commission", "paid", "due", "credit", "statusi"][n%17],
    sortDir: n%2 ? "asc" : "desc",
  });
  const old = legacy(rows, q), current = premiumListResult(rows, q, false);
  assert.deepEqual(current.ids, old.pagedBookings.map(b=>b.id), `page case ${n}`);
  assert.deepEqual(current.statusCounts, old.statusCounts);
  assert.deepEqual(current.emailTicketCounts, old.emailTicketCounts);
  assert.equal(current.matchingCount, old.sortedBookings.length);
  const active = old.sortedBookings.filter(b => b.status !== "cancelled");
  const visible = active.filter(b => !b.hiddenFromReports);
  assert.equal(current.filteredCount, active.length);
  assert.equal(current.stats.periodCount, visible.length);
  assert.equal(current.stats.periodSales, visible.reduce((s,b)=>s+b.totalAmount,0));
  assert.equal(current.stats.periodProfit, visible.reduce((s,b)=>s+Number(b.commissionAmount ?? 0),0));
  assert.equal(current.stats.periodPax, visible.reduce((s,b)=>s+b.passengers.filter(p=>p.type!=="infant" && !p.cancelled).length,0));
  assert.equal(current.filteredUnpaid, visible.reduce((s,b)=>s+(b.dueAmount<1?0:Math.round(b.dueAmount)),0));
  assert.deepEqual(premiumListResult(rows,{...q,exportAll:true},true).ids, old.sortedBookings.map(b=>b.id));
  checked++;
}
const base = QueryPremiumBookingsBody.parse({todayISO:"2026-10-03", loadAll:true});
assert.equal(premiumListResult(rows,base,true).ids.length,50);
assert.equal(premiumListResult(rows,{...base,page:2},true).ids.length,50);
assert.equal(premiumListResult(rows,{...base,exportAll:true},true).ids.length,151);
assert.equal(premiumListResult(rows,{...base,page:999},true).page,4);
console.log(`PASS: ${checked} legacy filter/sort/export comparisons, page size and out-of-range clamping.`);