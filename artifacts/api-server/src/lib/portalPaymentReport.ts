import { db, agentsTable, bookingsTable, flightsTable, paymentsTable, agentCreditTransactionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { renderAgencyReportHTML, paymentMethodLabel } from "@workspace/agency-report";
import { agencyReportPDF } from "./agencyReportPdf.js";
import { wholeEuroDue, formatWholeEuro } from "./money.js";

export type ReportOptions = { kind: "full" | "debt"; dateFrom?: string; dateTo?: string };
export function parseReportOptions(input: unknown): ReportOptions {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid report");
  const b = input as Record<string, unknown>;
  if (Object.keys(b).some(k => !["kind", "dateFrom", "dateTo"].includes(k))) throw new Error("Invalid field");
  if (b.kind !== "full" && b.kind !== "debt") throw new Error("Invalid kind");
  for (const k of ["dateFrom", "dateTo"]) {
    const v = b[k];
    if (v !== undefined && (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
      !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) throw new Error("Invalid date");
  }
  if (b.dateFrom && b.dateTo && String(b.dateFrom) > String(b.dateTo)) throw new Error("Invalid period");
  return b as ReportOptions;
}
const method = paymentMethodLabel;
const date = (v: Date | string) => new Date(v).toLocaleDateString("en-GB", { timeZone: "Europe/Tirane" });
const money = (v: number) => `€${formatWholeEuro(v)}`;
export function paymentAmounts(total: number, payments: { status: string; isRefund: boolean; amount: string }[]) {
  const net = Math.max(0, payments.filter(p => p.status === "completed").reduce((n, p) => n + Number(p.amount) * (p.isRefund ? -1 : 1), 0));
  return { paid: Math.min(net, total), due: wholeEuroDue(total, net) };
}

/** Server-owned agency scope. No prices, notes, net cost or report data supplied by the browser. */
export async function loadPortalPaymentReport(agentId: number, opts: ReportOptions, client = db) {
  return client.transaction(async tx => {
    // One consistent accounting snapshot across all queries.
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const [agent] = await tx.select().from(agentsTable).where(eq(agentsTable.id, agentId));
    if (!agent || agent.status !== "active") throw new Error("Agency unavailable");
    const bounds = (column: any) => [
      ...(opts.dateFrom ? [sql`${column} >= (${opts.dateFrom}::timestamp AT TIME ZONE 'Europe/Tirane')`] : []),
      ...(opts.dateTo ? [sql`${column} < ((${opts.dateTo}::date + 1)::timestamp AT TIME ZONE 'Europe/Tirane')`] : []),
    ];
    const bookings = await tx.select({ b: bookingsTable, f: flightsTable }).from(bookingsTable)
      .leftJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
      .where(and(eq(bookingsTable.agentId, agentId), sql`${bookingsTable.status} != 'cancelled'`, ...bounds(bookingsTable.createdAt)))
      .orderBy(bookingsTable.createdAt);
    const payments = await tx.select({ p: paymentsTable, ref: bookingsTable.bookingRef }).from(paymentsTable)
      .innerJoin(bookingsTable, eq(paymentsTable.bookingId, bookingsTable.id))
      .where(eq(bookingsTable.agentId, agentId)).orderBy(paymentsTable.createdAt);
    const wallet = await tx.select().from(agentCreditTransactionsTable)
      .where(and(eq(agentCreditTransactionsTable.agentId, agentId), ...bounds(agentCreditTransactionsTable.createdAt)))
      .orderBy(agentCreditTransactionsTable.createdAt);
    const byBooking = new Map<number, typeof payments>();
    for (const p of payments) {
      const list = byBooking.get(p.p.bookingId) ?? [];
      list.push(p); byBooking.set(p.p.bookingId, list);
    }
    const allRows = bookings.map(({ b, f }) => {
      const history = (byBooking.get(b.id) ?? []).map(x => x.p);
      return {
        ref: b.bookingRef, pnr: b.pnr || "—", customer: b.customerName,
        cp: /ONLINE\s*TRAVEL/i.test(agent.name) ? b.notes?.match(/\[CP:([^\]]+)\]/i)?.[1] || "" : "",
        from: f?.fromCity || "—", to: f?.toCity || "—", departure: f?.departureDate || "—",
        created: date(b.createdAt), status: b.status, total: Number(b.totalAmount),
        ...paymentAmounts(Number(b.totalAmount), history),
        payments: history.filter(p => p.status === "completed").map(p =>
          `${p.isRefund ? "Rimb. " : ""}${method(p.method)} ${date(p.createdAt).slice(0, 5)} ${p.isRefund ? "-" : ""}${money(Number(p.amount))}`).join(" + ") || "—",
      };
    });
    const rows = allRows.filter(r => opts.kind !== "debt" || r.due > 0);
    const inPeriod = (d: Date) => {
      const day = d.toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
      return (!opts.dateFrom || day >= opts.dateFrom) && (!opts.dateTo || day <= opts.dateTo);
    };
    const direct = payments.filter(({ p }) => p.status === "completed" && p.method !== "credit" &&
      !(p.isRefund && p.reference === "KREDIT-AUTO"))
      .map(({ p, ref }) => ({ created: p.createdAt, type: p.isRefund ? "refund" : "payment", method: method(p.method),
        ref, reference: p.reference || "", amount: Number(p.amount), source: "payment", batch: p.batchId, count: 1 }));
    const grouped: typeof direct = [];
    const batches = new Map<string, (typeof direct)[number]>();
    for (const row of direct) {
      const existing = row.batch ? batches.get(row.batch) : undefined;
      if (existing) {
        existing.amount += row.amount; existing.count++;
        existing.ref = `${existing.count} rezervime`;
      } else {
        grouped.push(row);
        if (row.batch) { row.ref = "1 rezervime"; batches.set(row.batch, row); }
      }
    }
    const ledger = [
      ...wallet.map(w => ({ created: w.createdAt, type: w.type, method: "Wallet", ref: w.bookingRef || "", reference: w.reference || "", amount: Number(w.amount), source: "wallet" })),
      ...grouped.filter(p => inPeriod(p.created)),
    ].sort((a, b) => b.created.getTime() - a.created.getTime());
    const grossDebt = wholeEuroDue(bookings.reduce((n, { b }) => n + Number(b.totalAmount), 0),
      bookings.reduce((n, { b }) => n + Math.min(Number(b.paidAmount), Number(b.totalAmount)), 0));
    const netCredit = Math.max(0, Number(agent.walletBalance) - grossDebt);
    const credit = opts.dateFrom || opts.dateTo
      ? wallet.reduce((n, w) => n + (w.type === "payment" || Number(w.amount) < 0 ? -1 : 1) * Math.abs(Number(w.amount)), 0)
      : netCredit > 0 ? netCredit : Math.max(0, Number(agent.walletBalance));
    return { agent: { name: agent.name, email: agent.email, company: agent.company, phone: agent.phone },
      rows, ledger: opts.kind === "debt" ? [] : ledger, credit, opts };
  });
}

const timestamp = (value: Date) => `${date(value)} ${value.toLocaleTimeString("en-US", {
  timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true,
})}`;

export function portalPaymentReportHTML(data: Awaited<ReturnType<typeof loadPortalPaymentReport>>) {
  return renderAgencyReportHTML({
    agent: data.agent, rows: data.rows, credit: data.credit,
    reportLabel: data.opts.kind === "debt" ? "Raport Detyrimet" : "Raport i Detajuar",
    creditLabel: data.opts.kind === "debt" ? "Kredit Gjendje (Info)" : "Balanca Kredit",
    generated: timestamp(new Date()), today: date(new Date()),
    period: data.opts.dateFrom || data.opts.dateTo
      ? `${data.opts.dateFrom || "Fillimi"} – ${data.opts.dateTo || "Sot"}` : undefined,
    ledger: data.ledger.map(l => ({ ...l, created: timestamp(l.created) })),
  });
}

/** Render the very same HTML template used by both internal agency reports. */
export async function renderPortalPaymentReport(data: Awaited<ReturnType<typeof loadPortalPaymentReport>>) {
  return agencyReportPDF(portalPaymentReportHTML(data));
}
