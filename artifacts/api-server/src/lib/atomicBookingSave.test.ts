import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import * as tables from "@workspace/db";
import { saveBookingAtomically } from "./atomicBookingSave.js";
import { bookingSaveVersion } from "./bookingSaveVersion.js";
import { randomUUID } from "node:crypto";

const schema = `atomic_save_test_${Date.now()}`;
const Pool = tables.pool.constructor as { new(options: any): typeof tables.pool };
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const client = drizzle(pool);
const dialect = new PgDialect();
const actor = { userId: 1, userName: "Fixture", role: "admin" };
const { bookingsTable: b, passengersTable: p, paymentsTable: pay, bookingExtrasTable: x, flightsTable: f, agentsTable: a, bookingChangeLogsTable: logs } = tables;
async function snapshot() {
  const [booking] = await client.select().from(b).where(eq(b.id, 1));
  return { booking, pax: await client.select().from(p), payments: await client.select().from(pay), extras: await client.select().from(x) };
}
async function plan(commands: any[]) {
  const s = await snapshot();
  return { requestId: randomUUID(), version: bookingSaveVersion(s.booking, s.pax, s.payments, s.extras), commands };
}
const patchBooking = (body: any) => ({ path: "/bookings/1", method: "PATCH", body });
const patchPax = (body: any) => ({ path: "/passengers/1", method: "PATCH", body });
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await pool.query("CREATE SEQUENCE invoice_code_seq");
  const selected = [b, p, pay, x, f, a, logs, tables.paymentChangeLogsTable, tables.agentCreditTransactionsTable, tables.flightSeatHistoryTable, tables.paymentMethodsTable];
  for (const table of selected) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => {
      let def = "";
      if (c.default !== undefined) {
        if (c.default && typeof c.default === "object" && "getSQL" in c.default) {
          const query = dialect.sqlToQuery((c.default as any).getSQL());
          assert.equal(query.params.length, 0);
          def = ` DEFAULT ${query.sql}`;
        } else def = ` DEFAULT '${String(c.default).replaceAll("'", "''")}'`;
      }
      return `"${c.name}" ${c.getSQLType()}${c.notNull ? " NOT NULL" : ""}${def}`;
    });
    await pool.query(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  await client.insert(f).values({ airline: "W6", flightNumber: "W6000", fromCity: "TIA", toCity: "MXP",
    departureDate: "2099-01-01", departureTime: "10:00", arrivalDate: "2099-01-01", arrivalTime: "12:00",
    adultPrice: "200", childPrice: "200", infantPrice: "30", totalSeats: 5, soldSeats: 1 });
  await client.insert(a).values({ name: "Fixture agency", email: "fixture@example.test" });
  await client.insert(b).values({ bookingRef: "TEST", flightId: 1, agentId: 1, customerName: "Fixture", totalAmount: "200", netPrice: "100", status: "confirmed" });
  await client.insert(p).values({ bookingId: 1, firstName: "TEST", lastName: "PAX", ticketPrice: "200" });
  await client.insert(pay).values({ bookingId: 1, amount: "200", method: "credit", status: "completed" });
  const combined = await plan([patchPax({ ticketPrice: 50 }), patchBooking({ totalAmount: 250, netPrice: 210 })]);
  await saveBookingAtomically(1, combined, actor, {}, client as any);
  let s = await snapshot();
  assert.equal(Number(s.booking.totalAmount) - Number(s.booking.netPrice), 40);
  assert.equal(s.payments.length, 1, "no intermediate refund at passenger price 50");
  const beforeFailure = JSON.stringify(s);
  const auditBefore = (await client.select().from(logs)).length;
  await assert.rejects(saveBookingAtomically(1, await plan([patchBooking({ netPrice: 99 }), patchPax({ ticketPrice: 500 }), { path: "/passengers/999", method: "DELETE" }]), actor, {}, client as any));
  assert.equal(JSON.stringify(await snapshot()), beforeFailure, "rollback ALL changes");
  assert.equal((await client.select().from(logs)).length, auditBefore, "rollback history");
  await assert.rejects(saveBookingAtomically(1, await plan([patchBooking({ netPrice: 99 }), patchPax({ ticketPrice: -1 })]), actor, {}, client as any));
  assert.equal(JSON.stringify(await snapshot()), beforeFailure, "negative ticket rolls back every edit");
  const reduced = await plan([patchPax({ ticketPrice: 120 }), patchBooking({ netPrice: 90 }), { path: "/bookings/1/extras", method: "POST", body: { description: "Extra", amount: 10 } }]);
  await saveBookingAtomically(1, reduced, actor, {}, client as any);
  s = await snapshot();
  assert.equal(Number(s.booking.totalAmount), 130);
  assert.equal(Number(s.booking.netPrice), 90);
  assert.equal(s.payments.filter(v => v.isRefund).length, 1);
  assert.equal(Number(s.payments.find(v => v.isRefund)!.amount), 70);
  const [agent] = await client.select().from(a);
  assert.equal(Number(agent.walletBalance), 70);
  await saveBookingAtomically(1, reduced, actor, {}, client as any);
  assert.equal((await client.select().from(pay)).length, 2, "retry never credits twice");
  const concurrent = await plan([patchBooking({ netPrice: 160 })]);
  const outcomes = await Promise.allSettled([
    saveBookingAtomically(1, concurrent, actor, {}, client as any),
    saveBookingAtomically(1, { ...concurrent, requestId: randomUUID(), commands: [patchBooking({ netPrice: 180 })] }, actor, {}, client as any),
  ]);
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
  await assert.rejects(saveBookingAtomically(1, await plan([patchBooking({ netPrice: 3 })]), { ...actor, role: "manager" }, {}, client as any));
  await assert.rejects(saveBookingAtomically(1, await plan([{ path: "/payments/999", method: "PATCH", body: { amount: 1 } }]), actor, {}, client as any));
  await client.update(b).set({ status: "ticketed", ticketEmailPending: false, airlineTicketUrl: "/old.pdf" }).where(eq(b.id, 1));
  const ticketChange = await saveBookingAtomically(1, await plan([patchPax({ firstName: "NEW", pnr: "ABC123" })]), actor, {}, client as any);
  s = await snapshot();
  assert.equal(s.booking.status, "confirmed");
  assert.equal(s.booking.pnr, "ABC123");
  assert.equal(s.booking.airlineTicketUrl, null);
  assert.ok(ticketChange.revertedEventId);
  assert.ok(ticketChange.ticketChanges.some(c => c.kind === "pnr"));
  const beforeInfant = (await client.select().from(f))[0].soldSeats;
  await saveBookingAtomically(1, await plan([{ path: "/passengers", method: "POST", body: { bookingId: 1, firstName: "BABY", lastName: "TEST", type: "infant", ticketPrice: 30 } }]), actor, {}, client as any);
  assert.equal((await client.select().from(f))[0].soldSeats, beforeInfant);
  const beforeFullFlight = JSON.stringify(await snapshot());
  await assert.rejects(saveBookingAtomically(1, await plan(Array.from({ length: 6 }, (_, n) => ({
    path: "/passengers", method: "POST", body: { bookingId: 1, firstName: `PAX${n}`, lastName: "TEST", type: "adult", ticketPrice: 100 },
  }))), actor, {}, client as any));
  assert.equal(JSON.stringify(await snapshot()), beforeFullFlight, "capacity failure rolls back every passenger");
  const beforeLateFailure = JSON.stringify(await snapshot());
  const walletBeforeLateFailure = (await client.select().from(a))[0].walletBalance;
  const historyBeforeLateFailure = (await client.select().from(logs)).length;
  // Fail at the final receipt insert, AFTER reconciliation already wrote refund,
  // wallet and history. All of these must be rolled back by PostgreSQL.
  await pool.query("ALTER TABLE booking_change_logs ADD CONSTRAINT fixture_late_failure CHECK (action <> 'atomic_save_receipt') NOT VALID");
  try {
    await assert.rejects(saveBookingAtomically(1, await plan([patchPax({ ticketPrice: 10 })]), actor, {}, client as any));
  } finally {
    await pool.query("ALTER TABLE booking_change_logs DROP CONSTRAINT fixture_late_failure");
  }
  assert.equal(JSON.stringify(await snapshot()), beforeLateFailure);
  assert.equal((await client.select().from(a))[0].walletBalance, walletBeforeLateFailure);
  assert.equal((await client.select().from(logs)).length, historyBeforeLateFailure);
  const walletBeforeCancel = (await client.select().from(a))[0].walletBalance;
  await saveBookingAtomically(1, await plan([{ path: "/payments/1", method: "PATCH", body: { status: "cancelled", cancelNote: "Fixture" } }]), actor, {}, client as any);
  assert.equal((await client.select().from(a))[0].walletBalance, walletBeforeCancel, "payment cancellation never credits wallet");
  await client.update(b).set({ status: "cancelled" }).where(eq(b.id, 1));
  await assert.rejects(saveBookingAtomically(1, await plan([patchPax({ ticketPrice: 1 })]), actor, {}, client as any));
  console.log("PASS real PostgreSQL: combined final prices, no intermediate refund, full rollback/audit rollback, final wallet credit, idempotent retry, concurrent edits, permissions and ownership.");
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  await tables.pool.end();
}