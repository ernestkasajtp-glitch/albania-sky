// Exercises the actual route body with isolated dependencies; no DB/SMTP access.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync("artifacts/api-server/src/routes/bookings.ts", "utf8");
const slice = source.slice(source.indexOf('router.patch("/bookings/:id/ticket",'),
  source.indexOf('router.patch("/bookings/:id/ticket-without-email",'));
const code = ts.transpileModule(slice, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const columns = new Proxy({}, { get: (_, name) => name });
async function scenario({ async = true, pending = false, outcome = "sent", editDuringSend = false, throws = false } = {}) {
  let row = { id: 7, status: pending ? "ticketed" : "confirmed", ticketEmailPending: pending,
    updatedAt: new Date("2026-10-03T12:00:00.000Z"), bookingRef: "TEST", customerName: "Test" };
  let handler, active = false, deliveries = 0, notifications = 0, history = 0, errorLogged = false;
  let releaseSend;
  const sendGate = new Promise(resolve => { releaseSend = resolve; });
  const eq = (key, value) => r => String(r[key]) === String(value);
  const and = (...rules) => r => rules.every(rule => rule(r));
  const sql = () => r => !["cancelled", "ticketed"].includes(r.status);
  const res = {
    statusCode: 200, headersSent: false, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { assert.equal(this.headersSent, false, "response must be sent only once"); this.body = body; this.headersSent = true; return this; },
  };
  const req = { params: { id: 7 }, get: () => async ? "respond-async" : undefined,
    log: { error() { errorLogged = true; } }, session: { userId: 1, userName: "Test", role: "admin" } };
  const db = {
    select: () => ({ from: () => ({ where: async () => [{ ...row }] }) }),
    update: () => ({ set: patch => ({ where: condition => {
      const apply = () => {
        if (!condition(row)) return [];
        row = { ...row, ...patch };
        return [{ id: 7 }];
      };
      return { returning: async () => apply(), then: (resolve, reject) => Promise.resolve().then(apply).then(resolve, reject) };
    } }) }),
  };
  const deps = {
    router: { patch: (_, fn) => { handler = fn; } },
    TicketBookingParams: { safeParse: () => ({ success: true, data: { id: 7 } }) },
    db, bookingsTable: columns, eq, and, sql,
    acquireTicketEmailSend: () => {
      if (active) return null;
      active = true;
      return () => { active = false; };
    },
    getFullBooking: async () => ({ ...row, updatedAt: row.updatedAt.toISOString() }),
    logBookingChange: async () => { history++; return history; },
    sendAgentStatusEmail: async () => {
      deliveries++; await sendGate;
      if (throws) throw new Error("SMTP unavailable");
      return outcome;
    },
    shouldKeepTicketEmailPending: value => value !== "sent",
    notifyDataChanged: () => { notifications++; },
    STATUS_LABELS: { confirmed: "Konfirmuar", ticketed: "Biletuar" },
    sendEmail: () => {}, bookingUpdatedEmail: () => "", scheduleExcelSync: () => {}, scheduleGSheetsSync: () => {},
    process: { env: {} },
  };
  Function(...Object.keys(deps), code)(...Object.values(deps));
  const request = handler(req, res);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(deliveries, 1);
  assert.equal(history, 1, "history exists before early response");
  assert.equal(row.status, "ticketed");
  assert.equal(row.ticketEmailPending, true);
  assert.equal(res.headersSent, async);
  if (async) {
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.ticketEmailSending, true);
    assert.equal(res.body.ticketEmailPending, true);
  }
  const duplicate = { ...res, headersSent: false, body: null };
  await handler(req, duplicate);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(deliveries, 1);
  if (editDuringSend) row = { ...row, updatedAt: new Date("2026-10-03T12:01:00.000Z") };
  releaseSend();
  await request;
  assert.equal(active, false);
  assert.ok(notifications > 0);
  assert.equal(row.ticketEmailPending, outcome !== "sent" || throws || editDuringSend);
  assert.equal(errorLogged, throws);
  if (!async) assert.equal(res.statusCode, outcome === "sent" ? 200 : 502);
}
for (const pending of [false, true]) {
  await scenario({ pending });
  await scenario({ pending, outcome: "failed" });
  await scenario({ pending, outcome: "skipped" });
  await scenario({ pending, editDuringSend: true });
  await scenario({ pending, throws: true });
  await scenario({ pending, async: false });
}
console.log("PASS: 12 actual-route cases: early response, honest pending, success/failure, duplicate guard, newer-edit guard, synchronous compatibility.");