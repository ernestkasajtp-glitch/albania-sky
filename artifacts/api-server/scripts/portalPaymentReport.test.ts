import assert from "node:assert/strict";
import express from "express";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import * as tables from "@workspace/db";
import { PDFDocument } from "pdf-lib";
import { parseReportOptions, paymentAmounts, loadPortalPaymentReport, renderPortalPaymentReport, portalPaymentReportHTML } from "../src/lib/portalPaymentReport.js";
import { paymentMethodLabel, renderAgencyReportHTML } from "@workspace/agency-report";
import { writeFile } from "node:fs/promises";
import { registerPortalPaymentReports } from "../src/routes/portalPaymentReports.js";

const schema = `portal_report_test_${Date.now()}`;
const Pool = tables.pool.constructor as { new(options: any): typeof tables.pool };
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const client = drizzle(pool) as typeof tables.db;
let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
try {
  for (const bad of [null, { kind: "full", agentId: 2 }, { kind: "full", email: "other@example.test" },
    { kind: "full", dateFrom: "2026-02-30" }, { kind: "full", dateFrom: "2026-10-02", dateTo: "2026-10-01" }]) {
    assert.throws(() => parseReportOptions(bad));
  }
  assert.deepEqual(paymentAmounts(100, [
    { amount: "130", status: "completed", isRefund: false },
    { amount: "50", status: "completed", isRefund: true },
    { amount: "99", status: "pending", isRefund: false },
  ]), { paid: 80, due: 20 });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await pool.query("CREATE SEQUENCE invoice_code_seq");
  const dialect = new PgDialect();
  for (const table of [tables.agentsTable, tables.bookingsTable, tables.flightsTable, tables.paymentsTable, tables.agentCreditTransactionsTable, tables.bookingUsersTable]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => {
      let def = "";
      if (c.default !== undefined) {
        if (c.default && typeof c.default === "object" && "getSQL" in c.default) {
          const query = dialect.sqlToQuery((c.default as any).getSQL());
          assert.equal(query.params.length, 0); def = ` DEFAULT ${query.sql}`;
        } else def = ` DEFAULT '${String(c.default).replaceAll("'", "''")}'`;
      }
      return `"${c.name}" ${c.getSQLType()}${c.notNull ? " NOT NULL" : ""}${def}${c.primary ? " PRIMARY KEY" : ""}`;
    });
    await pool.query(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  await client.insert(tables.agentsTable).values([
    { id: 901, name: "Agency A", email: "agency-a@example.test", walletBalance: "50" },
    { id: 902, name: "Agency B", email: "agency-b@example.test" },
  ]);
  await client.insert(tables.bookingUsersTable).values([
    { id: 901, name: "Agent A", email: "user-a@example.test", role: "agent", agentId: 901, passwordHash: "unused" },
    { id: 902, name: "Agent B", email: "user-b@example.test", role: "agent", agentId: 902, passwordHash: "unused" },
    { id: 903, name: "Client", email: "client@example.test", role: "client", passwordHash: "unused" },
  ]);
  const createdAt = new Date("2026-10-07T22:30:00Z"); // Oct 8 in Albania.
  await client.insert(tables.bookingsTable).values([
    { id: 901, agentId: 901, bookingRef: "KTF0901", flightId: 1, customerName: "Fixture A", totalAmount: "100", paidAmount: "80", createdAt },
    { id: 902, agentId: 902, bookingRef: "KTF0902", flightId: 1, customerName: "PRIVATE OTHER AGENCY", totalAmount: "999", createdAt },
    { id: 903, agentId: 901, bookingRef: "KTF0903", flightId: 1, customerName: "Cancelled", totalAmount: "500", status: "cancelled", createdAt },
    { id: 904, agentId: 901, bookingRef: "KTF0904", flightId: 1, customerName: "Paid", totalAmount: "50", paidAmount: "80", createdAt },
  ]);
  await client.insert(tables.paymentsTable).values([
    { bookingId: 901, amount: "100", method: "MARINELA CASH", status: "completed", createdAt },
    { bookingId: 901, amount: "20", method: "bank", status: "completed", isRefund: true, createdAt },
    { bookingId: 904, amount: "80", method: "card", status: "completed", createdAt },
  ]);
  await client.insert(tables.agentCreditTransactionsTable).values({ agentId: 901, type: "deposit", amount: "50", createdAt });
  const full = await loadPortalPaymentReport(901, { kind: "full" }, client);
  assert.deepEqual(full.rows.map(r => r.ref), ["KTF0901", "KTF0904"]);
  assert.equal(full.rows[0].paid, 80); assert.equal(full.rows[0].due, 20);
  assert.equal(full.rows[1].paid, 50); assert.equal(full.credit, 30);
  assert.match(full.rows[0].payments, /CASH/);
  for (const value of ["cash", "Cash", "MARINELA CASH", "cash_test"]) assert.equal(paymentMethodLabel(value), "CASH");
  const html = portalPaymentReportHTML(full);
  assert.ok(!html.includes("MARINELA"), "Named cash method must never appear in either table");
  assert.ok(html.includes("Total Shuma:") && html.includes("Historia e Krediteve"));
  assert.ok(!html.includes("<script"), "Portal document must not need toolbar/CDN scripts");
  const shared = renderAgencyReportHTML({
    agent: full.agent, rows: full.rows, credit: full.credit,
    generated: "", today: "", reportLabel: "Raport i Detajuar",
  });
  const table = (s: string) => s.slice(s.indexOf("<table><thead>"), s.indexOf("</tfoot></table>"));
  assert.equal(table(html), table(shared));
  await writeFile("/tmp/agency-report-preview.html", html);
  assert.equal(JSON.stringify(full).includes("PRIVATE OTHER AGENCY"), false);
  assert.equal((await loadPortalPaymentReport(901, { kind: "debt" }, client)).rows.length, 1);
  assert.equal((await loadPortalPaymentReport(901, { kind: "full", dateTo: "2026-10-07" }, client)).rows.length, 0);
  assert.equal((await loadPortalPaymentReport(901, { kind: "full", dateFrom: "2026-10-08", dateTo: "2026-10-08" }, client)).rows.length, 2);
  const pdf = await renderPortalPaymentReport(full);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(Math.abs((await PDFDocument.load(pdf)).getPage(0).getWidth() - 842) < 1);
  await writeFile("/tmp/agency-report-preview.pdf", pdf);
  const long = { ...full, rows: Array.from({ length: 100 }, () => ({ ...full.rows[0], payments: "Cash €10 + ".repeat(60) })) };
  assert.ok((await PDFDocument.load(await renderPortalPaymentReport(long))).getPageCount() > 2);
  const sent: { to: string; pdf: Buffer; html: string }[] = [];
  let fail = false;
  const app = express(); app.use(express.json());
  registerPortalPaymentReports(app, (req, res, next) => {
    if (!req.headers["x-test-user"]) { res.sendStatus(401); return; }
    (req as any).session = { userId: Number(req.headers["x-test-user"]) }; next();
  }, { client, systemRecipient: () => "system@example.test", reportFailure: async () => {},
    send: async (to, _subject, html, attachments) => {
      if (fail) throw new Error("Simulated SMTP failure");
      sent.push({ to, html, pdf: attachments![0].content as Buffer });
    },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/public/payment-report`;
  const post = (user?: number, body: any = { kind: "full" }) => fetch(url, { method: "POST",
    headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": String(user) } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post()).status, 401);
  assert.equal((await post(903)).status, 403);
  assert.equal((await post(901, { kind: "full", agentId: 902 })).status, 400);
  const ok = await post(901);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const downloaded = Buffer.from(await ok.arrayBuffer());
  assert.deepEqual(sent.map(s => s.to), ["system@example.test", "agency-a@example.test"]);
  assert.deepEqual(downloaded, sent[0].pdf);
  assert.deepEqual(downloaded, sent[1].pdf);
  assert.equal(sent[1].html.includes("system@example.test"), false);
  assert.equal((await post(901)).status, 429);
  fail = true;
  assert.equal((await post(902)).status, 502);
  fail = false;
  assert.equal((await post(902)).status, 200); // failure releases the lock, retry works
  console.log("Portal payment reports: scope, money, dates, PDF, private copies, failure/retry OK");
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  await tables.pool.end();
}
