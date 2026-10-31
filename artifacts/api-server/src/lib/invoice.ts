// Central helper: build + email a payment invoice (PDF) to the agent and the
// company/admin address. Used on payment creation and on ledger confirmation.
import { db, paymentsTable, agentsTable, bookingsTable, agentCreditTransactionsTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { getFullBooking } from "./getFullBooking.js";
import { generateInvoicePdf, generateBatchInvoicePdf, generateCreditInvoicePdf, type InvoiceInput, type BatchInvoiceLineItem } from "./invoicePdf.js";
import { sendEmail } from "./gmail.js";
import { logger } from "./logger.js";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Transfer Bankar",
  card: "Kartë",
  online: "Online",
  credit: "Kredit (Wallet)",
};

/** Çdo mënyrë pagese që përmban "cash" shfaqet vetëm "Cash", jo me emrin e plotë të sistemit. */
function methodLabelInv(m: string): string {
  if (m && /cash/i.test(m)) return "Cash";
  return METHOD_LABELS[m] ?? m;
}

function escInv(v: any): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** dd/MM/yyyy in Albania wall-clock time. */
function fmtDateAL(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", { timeZone: "Europe/Tirane", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "/");
}

/** €-amount: no decimals when whole, otherwise 2 decimals (matches frontend fmtM). */
function fmtMoneyInv(n: number): string {
  return String(Math.round(n));
}

/** One booking row in the payment-report email table. */
interface PaymentReportRow {
  bookingRef: string | null;
  pnr: string | null;
  customerName: string | null;
  route: string | null;        // "Tirana → Londër"
  flightInfo: string | null;   // small line under route: date · airline · flight no
  payText: string;             // e.g. "Bankë 13/07/2026" or "Rimb. Cash 13/07/2026"
  amount: number;              // the just-made payment amount (positive)
  isRefund: boolean;
  total: number | null;
  paid: number | null;
  due: number | null;
}

/**
 * Payment email in the compact zebra report design (same look as the agent
 * debt/detailed report): one row per booking with the just-made payment,
 * summary strip on top, TOTALI footer for multi-row (batch) payments.
 * Email-safe: tables + inline styles only (no flexbox).
 */
function paymentReportEmailHtml(opts: {
  reportLabel: string;         // "Faturë Pagese", "Notë Krediti", "Faturë Masive"
  invoiceCode: string;
  agentName?: string | null;
  agentCompany?: string | null;
  rows: PaymentReportRow[];
  confirmed?: boolean;
}): string {
  const { reportLabel, invoiceCode, agentName, agentCompany, rows, confirmed } = opts;
  const today = fmtDateAL(new Date());
  const totalPayNow = rows.reduce((s, r) => s + (r.isRefund ? -r.amount : r.amount), 0);
  const totalDue = rows.reduce((s, r) => s + Number(r.due ?? 0), 0);
  const agentBits = [agentName, agentCompany].filter(Boolean).map(escInv).join(" &nbsp;·&nbsp; ");

  const th = (label: string, align: "left" | "right" = "left") =>
    `<th style="padding:6px 8px;text-align:${align};font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;border-bottom:2px solid #1e293b">${label}</th>`;

  const bodyRows = rows.map((r, i) => {
    const zebra = i % 2 === 1 ? "background:#f8fafc;" : "";
    const dueNum = Number(r.due ?? 0);
    const dueColor = dueNum > 0 ? "#dc2626" : "#16a34a";
    const payColor = r.isRefund ? "#2563eb" : "#16a34a";
    const paySign = r.isRefund ? "-" : "+";
    return `<tr style="${zebra}">
      <td style="padding:6px 8px;font-weight:700;font-size:11px;white-space:nowrap;border-bottom:1px solid #e5e7eb">${escInv(r.bookingRef || "—")}</td>
      <td style="padding:6px 8px;font-family:monospace;font-size:11px;color:#64748b;border-bottom:1px solid #e5e7eb">${escInv(r.pnr || "—")}</td>
      <td style="padding:6px 8px;font-size:11px;white-space:nowrap;border-bottom:1px solid #e5e7eb">${escInv(r.customerName || "—")}</td>
      <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #e5e7eb">${escInv(r.route || "—")}${r.flightInfo ? `<br/><span style="font-size:9px;color:#94a3b8">${escInv(r.flightInfo)}</span>` : ""}</td>
      <td style="padding:6px 8px;font-size:10px;color:#475569;white-space:nowrap;border-bottom:1px solid #e5e7eb">${escInv(r.payText)}<br/><span style="font-weight:700;font-size:11px;color:${payColor}">${paySign}€${fmtMoneyInv(r.amount)}</span></td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;white-space:nowrap;border-bottom:1px solid #e5e7eb">€${fmtMoneyInv(Number(r.total ?? 0))}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;white-space:nowrap;border-bottom:1px solid #e5e7eb">€${fmtMoneyInv(Number(r.paid ?? 0))}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;font-weight:700;color:${dueColor};white-space:nowrap;border-bottom:1px solid #e5e7eb">€${fmtMoneyInv(dueNum)}</td>
    </tr>`;
  }).join("");

  const totalsFoot = rows.length > 1 ? `<tfoot>
    <tr style="background:#1e293b">
      <td colspan="4" style="padding:7px 8px;color:#fff;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:1px">TOTALI</td>
      <td style="padding:7px 8px;color:#4ade80;font-weight:800;font-size:11px;white-space:nowrap">${totalPayNow < 0 ? "-" : "+"}€${fmtMoneyInv(Math.abs(totalPayNow))}</td>
      <td style="padding:7px 8px"></td>
      <td style="padding:7px 8px"></td>
      <td style="padding:7px 8px;text-align:right;color:${totalDue > 0 ? "#fca5a5" : "#4ade80"};font-weight:800;font-size:11px;white-space:nowrap">€${fmtMoneyInv(totalDue)}</td>
    </tr>
  </tfoot>` : "";

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:0 auto;color:#1e293b;padding:8px">
  <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #e5e7eb">
    <tr>
      <td style="padding:0 0 10px">
        <span style="font-size:19px;font-weight:800;color:#1e3a5f;letter-spacing:0.5px">KINGS TRAVEL</span>
        <span style="font-size:12px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase">&nbsp;&nbsp;${escInv(reportLabel)}</span>
      </td>
      <td style="padding:0 0 10px;text-align:right;font-size:10px;color:#475569;font-family:monospace">${agentBits}</td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin:10px 0 14px">
    <tr>
      <td style="font-size:10px;color:#64748b;font-family:monospace">
        Nr. Fature: <strong style="color:#1e293b">${escInv(invoiceCode)}</strong>
        &nbsp;·&nbsp; Data: <strong style="color:#1e293b">${today}</strong>
        &nbsp;·&nbsp; ${rows.length} rezervim${rows.length === 1 ? "" : "e"}
      </td>
      <td style="text-align:right">
        <span style="font-size:10px;color:#64748b;font-family:monospace">Paguar tani:&nbsp;</span>
        <span style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:3px 10px;color:#16a34a;font-weight:700;font-size:13px">${totalPayNow < 0 ? "-" : "+"}€${fmtMoneyInv(Math.abs(totalPayNow))}</span>
        ${totalDue > 0 ? `&nbsp;<span style="font-size:10px;color:#64748b;font-family:monospace">Detyrim i mbetur:&nbsp;</span><span style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:3px 10px;color:#dc2626;font-weight:700;font-size:13px">€${fmtMoneyInv(totalDue)}</span>` : ""}
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>
        ${th("Rezervimi")}${th("PNR")}${th("Klienti")}${th("Fluturimi")}${th("Pagesa")}${th("Total", "right")}${th("Paguar", "right")}${th("Detyrim", "right")}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    ${totalsFoot}
  </table>

  ${confirmed ? `<div style="margin-top:14px;padding:10px 12px;background:#eafaef;border:1px solid #bfe6cb;border-radius:8px;color:#1f7a3d;font-weight:600;font-size:13px">✓ Pagesë e konfirmuar</div>` : ""}

  <div style="margin-top:22px;border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:9px;color:#94a3b8;font-family:monospace;letter-spacing:1px">KINGS TRAVEL &nbsp;·&nbsp; ${escInv(reportLabel.toUpperCase())} &nbsp;·&nbsp; ${today} &nbsp;·&nbsp; Gjeneruar automatikisht</div>
</div>`;
}

/**
 * Build the invoice input (booking + agent + payment data) for a payment.
 * Returns null if the payment or its booking can't be found.
 */
async function buildInvoiceInput(
  paymentId: number,
  opts: { confirmed?: boolean } = {},
): Promise<{ input: InvoiceInput; agentEmail: string | null } | null> {
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
  if (!payment) {
    logger.warn({ paymentId }, "[invoice] payment not found");
    return null;
  }

  const full: any = await getFullBooking(payment.bookingId);
  if (!full) {
    logger.warn({ paymentId, bookingId: payment.bookingId }, "[invoice] booking not found");
    return null;
  }

  // Agent details (email is the primary recipient)
  let agentEmail: string | null = null;
  let agentCompany: string | null = null;
  if (full.agentId) {
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, full.agentId));
    // Payment invoices go to the agency's FINANCE email (user choice, 2026-08-07);
    // fall back to the main agent email only when no finance email is set.
    agentEmail = agent?.financeEmail || agent?.email || null;
    agentCompany = agent?.company ?? null;
  }

  const flight = full.flight ?? {};
  const amount = Number(payment.amount);

  const input: InvoiceInput = {
    invoiceCode: payment.invoiceCode ?? `PAY-${payment.id}`,
    date: opts.confirmed ? new Date() : payment.createdAt,
    paymentDate: payment.createdAt,
    amount,
    method: payment.method,
    reference: payment.reference,
    isRefund: payment.isRefund,
    confirmed: opts.confirmed ?? payment.confirmed,
    bookingRef: full.bookingRef,
    pnr: full.pnr,
    customerName: full.customerName,
    agentName: full.agentName,
    agentCompany,
    agentEmail,
    airline: flight.airline ?? null,
    flightNumber: flight.flightNumber ?? null,
    routeFrom: flight.fromCity ?? null,
    routeTo: flight.toCity ?? null,
    departureDate: flight.departureDate ?? null,
    total: full.totalAmount ?? null,
    paid: full.paidAmount ?? null,
    due: full.dueAmount ?? null,
  };

  return { input, agentEmail };
}

/**
 * Generate the next CRD invoice code for a credit transaction: INV-YYMMDD-CRDNN.
 * The NN counter resets per day (counts that day's existing credit invoice codes).
 */
export async function nextCreditInvoiceCode(): Promise<string> {
  const res: any = await db.execute(sql`
    SELECT 'INV-' || to_char(now(),'YYMMDD') || '-CRD' || lpad((
      COALESCE((
        SELECT MAX(substring(invoice_code from '-CRD([0-9]+)$')::int)
        FROM agent_credit_transactions
        WHERE invoice_code LIKE 'INV-' || to_char(now(),'YYMMDD') || '-CRD%'
      ), 0) + 1
    )::text, 2, '0') AS code
  `);
  const code = (res.rows ?? res)?.[0]?.code;
  return code ?? `INV-CRD-${Date.now()}`;
}

/**
 * Build the credit invoice PDF for an agent credit transaction (deposit or
 * surplus/tepricë). Returns null if the transaction or agent can't be found.
 */
export async function buildCreditInvoicePdf(
  txnId: number,
): Promise<{ buffer: Buffer; filename: string; invoiceCode: string } | null> {
  const [txn] = await db.select().from(agentCreditTransactionsTable)
    .where(eq(agentCreditTransactionsTable.id, txnId));
  if (!txn) {
    logger.warn({ txnId }, "[invoice] credit txn not found");
    return null;
  }
  // Only deposits and surplus credits get a credit invoice.
  if (txn.type !== "deposit" && txn.type !== "credit") {
    logger.warn({ txnId, type: txn.type }, "[invoice] credit txn not invoiceable");
    return null;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, txn.agentId));
  const invoiceCode = txn.invoiceCode ?? `CRD-${txn.id}`;
  const visibleNotes = (txn.notes ?? "")
    .replace(/\u2063bulk-intent:[^\]]+\]/g, "")
    .trim() || null;

  const pdf = await generateCreditInvoicePdf({
    invoiceCode,
    date: txn.createdAt,
    paymentDate: txn.createdAt,
    amount: Number(txn.amount),
    kind: txn.type === "deposit" ? "deposit" : "credit",
    paymentMethod: txn.paymentMethod ?? null,
    agentName: agent?.name ?? null,
    agentCompany: agent?.company ?? null,
    agentEmail: agent?.email ?? null,
    bookingRef: txn.bookingRef ?? null,
    reference: txn.reference ?? null,
    notes: visibleNotes,
    balanceAfter: agent ? Number(agent.walletBalance) : null,
  });

  return {
    buffer: Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf),
    filename: `${invoiceCode}.pdf`,
    invoiceCode,
  };
}

/**
 * Build the invoice PDF for a payment (for direct download). Returns the PDF
 * bytes + suggested filename + invoice code, or null if payment/booking missing.
 */
export async function buildPaymentInvoicePdf(
  paymentId: number,
  opts: { confirmed?: boolean } = {},
): Promise<{ buffer: Buffer; filename: string; invoiceCode: string } | null> {
  const built = await buildInvoiceInput(paymentId, opts);
  if (!built) return null;
  const pdf = await generateInvoicePdf(built.input);
  return {
    buffer: Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf),
    filename: `${built.input.invoiceCode}.pdf`,
    invoiceCode: built.input.invoiceCode,
  };
}

/**
 * Build a single batch-invoice PDF for all payments that share a batchId (a mass
 * payment). Lists each ticket + its amount with a grand total. The batch's
 * "invoice code" is the earliest member payment's invoiceCode (stable + unique).
 */
export async function buildBatchInvoicePdf(
  batchId: string,
): Promise<{ buffer: Buffer; filename: string; invoiceCode: string } | null> {
  const rows = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.batchId, batchId))
    .orderBy(asc(paymentsTable.id));
  if (rows.length === 0) return null;

  const first = rows[0];
  const invoiceCode = first.invoiceCode ?? `BATCH-${batchId.slice(0, 8)}`;

  // Resolve agent from the first booking that has one.
  let agentName: string | null = null;
  let agentCompany: string | null = null;
  let agentEmail: string | null = null;

  const lineItems: BatchInvoiceLineItem[] = [];
  for (const p of rows) {
    // Pull the full booking so each split carries the same detail as a single
    // ticket invoice: flight, customer, and the booking financials (total/paid/due).
    const full: any = await getFullBooking(p.bookingId);
    if (!full) continue;
    if (!agentName && full.agentId) {
      const [ag] = await db.select().from(agentsTable).where(eq(agentsTable.id, full.agentId));
      if (ag) { agentName = ag.name ?? null; agentCompany = ag.company ?? null; agentEmail = ag.email ?? null; }
    }
    const flight = full.flight ?? {};
    const route = [flight.fromCity, flight.toCity].filter(Boolean).join(" -> ") || null;
    // paidAmount includes THIS payment (the PDF is built after the payment is
    // recorded), so what was paid before = paidAmount - this payment's amount.
    const paidTotal = full.paidAmount != null ? Number(full.paidAmount) : null;
    const prevPaid = paidTotal != null ? Math.max(0, Math.round((paidTotal - Number(p.amount)) * 100) / 100) : null;
    lineItems.push({
      bookingRef: full.bookingRef,
      customerName: full.customerName ?? null,
      route,
      amount: Number(p.amount),
      prevPaid,
      method: p.method,
      airline: flight.airline ?? null,
      flightNumber: flight.flightNumber ?? null,
      departureDate: flight.departureDate ?? null,
      total: full.totalAmount ?? null,
      paid: paidTotal,
      due: full.dueAmount ?? null,
    });
  }

  if (lineItems.length === 0) return null;

  const total = lineItems.reduce((s, li) => s + li.amount, 0);
  // Surplus (tepricë) credited to the agent wallet is recorded in the shared
  // summary note stamped on every batch row ("… | Tepricë €25.00 | …") — the
  // credit transaction itself carries no batchId, so parse it from the note.
  const creditMatch = String(first.notes ?? "").match(/Tepricë\s*€\s*([\d.]+)/i);
  const creditAmount = creditMatch ? Number(creditMatch[1]) : null;
  const pdf = await generateBatchInvoicePdf({
    invoiceCode,
    date: first.createdAt,
    paymentDate: first.createdAt,
    method: first.method,
    reference: first.reference,
    agentName,
    agentCompany,
    agentEmail,
    lineItems,
    total,
    creditAmount,
  });

  return {
    buffer: Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf),
    filename: `${invoiceCode}-masive.pdf`,
    invoiceCode,
  };
}

/**
 * Build + email ONE invoice for an entire mass/bulk payment (a batch). The whole
 * payment is a single invoice covering several tickets, so we send one batch PDF
 * with the per-ticket breakdown + grand total — never one invoice per ticket.
 * Fire-and-forget safe: never throws.
 */
export async function sendBatchInvoice(batchId: string): Promise<void> {
  try {
    const built = await buildBatchInvoicePdf(batchId);
    if (!built) return;

    const rows = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.batchId, batchId)).orderBy(asc(paymentsTable.id));
    const total = rows.reduce((s, p) => s + Number(p.amount), 0);

    // Build one report row per payment + resolve agent (email/name/company) from
    // the first booking in the batch that has an agent.
    let agentEmail: string | null = null;
    let agentName: string | null = null;
    let agentCompany: string | null = null;
    const reportRows: PaymentReportRow[] = [];
    for (const p of rows) {
      const full: any = await getFullBooking(p.bookingId);
      if (!full) continue;
      if (!agentEmail && full.agentId) {
        const [ag] = await db.select().from(agentsTable).where(eq(agentsTable.id, full.agentId));
        // Batch invoices go to the agency's FINANCE email (user choice, 2026-08-07);
        // fall back to the main agent email only when no finance email is set.
        if (ag) { agentEmail = ag.financeEmail || ag.email || null; agentName = ag.name ?? null; agentCompany = ag.company ?? null; }
      }
      const flight = full.flight ?? {};
      const route = [flight.fromCity, flight.toCity].filter(Boolean).join(" → ") || null;
      const flightInfo = [
        flight.departureDate ? fmtDateAL(flight.departureDate) : null,
        [flight.airline, flight.flightNumber].filter(Boolean).join(" ") || null,
      ].filter(Boolean).join(" · ") || null;
      const methodLabel = methodLabelInv(p.method);
      reportRows.push({
        bookingRef: full.bookingRef ?? null,
        pnr: full.pnr ?? null,
        customerName: full.customerName ?? null,
        route,
        flightInfo,
        payText: `${p.isRefund ? "Rimb. " : ""}${methodLabel} ${fmtDateAL(p.createdAt)}`,
        amount: Number(p.amount),
        isRefund: !!p.isRefund,
        total: full.totalAmount != null ? Number(full.totalAmount) : null,
        paid: full.paidAmount != null ? Number(full.paidAmount) : null,
        due: full.dueAmount != null ? Number(full.dueAmount) : null,
      });
    }

    const adminTo = process.env.NOTIFY_EMAIL || process.env.SMTP_USER || null;
    const recipients = [...new Set([agentEmail, adminTo].filter((x): x is string => !!x && x.includes("@")))];
    if (recipients.length === 0) {
      logger.warn({ batchId }, "[invoice] batch: no recipients — skipping");
      return;
    }

    const subject = `Faturë Masive ${built.invoiceCode} — ${rows.length} bileta — €${Math.round(total)}`;
    const html = paymentReportEmailHtml({
      reportLabel: "Faturë Masive",
      invoiceCode: built.invoiceCode,
      agentName,
      agentCompany,
      rows: reportRows,
    });

    await sendEmail(recipients.join(", "), subject, html, [
      { filename: built.filename, content: built.buffer, mimeType: "application/pdf" },
    ]);
    logger.info({ batchId, invoiceCode: built.invoiceCode, recipients }, "[invoice] batch sent");
  } catch (err) {
    logger.error({ err, batchId }, "[invoice] failed to send batch invoice");
  }
}

/**
 * Generate the invoice PDF for a payment and email it to the agent + admin.
 * Fire-and-forget safe: never throws (logs and returns on any failure).
 *
 * @param paymentId the payment row id
 * @param opts.confirmed when true, marks the invoice as a confirmation re-send
 */
export async function sendPaymentInvoice(
  paymentId: number,
  opts: { confirmed?: boolean } = {},
): Promise<void> {
  try {
    const built = await buildInvoiceInput(paymentId, opts);
    if (!built) return;
    const { input, agentEmail } = built;
    const amount = input.amount;

    const pdf = await generateInvoicePdf(input);

    // Recipients: agent + company/admin (NOTIFY_EMAIL), de-duplicated.
    const adminTo = process.env.NOTIFY_EMAIL || process.env.SMTP_USER || null;
    const recipients = [...new Set([agentEmail, adminTo].filter((x): x is string => !!x && x.includes("@")))];
    if (recipients.length === 0) {
      logger.warn({ paymentId }, "[invoice] no recipients (agent email + NOTIFY_EMAIL both missing) — skipping");
      return;
    }

    const docLabel = input.isRefund ? "Notë Krediti" : "Faturë";
    const confirmTag = opts.confirmed ? " (Konfirmuar)" : "";
    const subject = `${docLabel}${confirmTag} ${input.invoiceCode} — ${input.bookingRef} — €${Math.round(amount)}`;

    const methodLabel = methodLabelInv(input.method);
    const route = [input.routeFrom, input.routeTo].filter(Boolean).join(" → ") || null;
    const flightInfo = [
      input.departureDate ? fmtDateAL(input.departureDate) : null,
      [input.airline, input.flightNumber].filter(Boolean).join(" ") || null,
    ].filter(Boolean).join(" · ") || null;
    const html = paymentReportEmailHtml({
      reportLabel: input.isRefund ? "Notë Krediti" : "Faturë Pagese",
      invoiceCode: input.invoiceCode,
      agentName: input.agentName,
      agentCompany: input.agentCompany,
      confirmed: opts.confirmed ?? false,
      rows: [{
        bookingRef: input.bookingRef ?? null,
        pnr: input.pnr ?? null,
        customerName: input.customerName ?? null,
        route,
        flightInfo,
        payText: `${input.isRefund ? "Rimb. " : ""}${methodLabel} ${fmtDateAL(input.date)}`,
        amount: input.amount,
        isRefund: !!input.isRefund,
        total: input.total != null ? Number(input.total) : null,
        paid: input.paid != null ? Number(input.paid) : null,
        due: input.due != null ? Number(input.due) : null,
      }],
    });

    await sendEmail(recipients.join(", "), subject, html, [
      { filename: `${input.invoiceCode}.pdf`, content: pdf, mimeType: "application/pdf" },
    ]);

    logger.info({ paymentId, invoiceCode: input.invoiceCode, recipients, confirmed: !!opts.confirmed }, "[invoice] sent");
  } catch (err) {
    logger.error({ err, paymentId }, "[invoice] failed to send payment invoice");
  }
}

