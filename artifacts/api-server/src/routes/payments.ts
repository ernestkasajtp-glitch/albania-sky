import { Router, type IRouter } from "express";
import { roundWholeEuro, formatWholeEuro, wholeEuroDue, wholeEuroOverpay } from "../lib/money.js";
import { eq, sql, gt, and, ilike, inArray } from "drizzle-orm";
import { db, paymentsTable, bookingsTable, agentsTable, agentCreditTransactionsTable, flightsTable, passengersTable, bookingChangeLogsTable, paymentChangeLogsTable } from "@workspace/db";
import { validateManualPaymentMethod } from "../lib/manualPaymentMethod.js";
import { scheduleExcelSync } from "../lib/excelSync.js";
import { scheduleGSheetsSync } from "../lib/googleSheets.js";
import { sendPaymentInvoice, sendBatchInvoice, buildPaymentInvoicePdf, buildBatchInvoicePdf } from "../lib/invoice.js";
import { getSplitNetTotalsMap, calcCombinedNetAndCommission } from "../lib/getFullBooking.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Batch loaders for list endpoints: ONE query per related table instead of one
// (or more) per row. The previous per-row lookups fired thousands of queries on
// every page load once the tables grew, exhausting the connection pool.
// Ids are chunked to stay well below Postgres' 65535 bind-parameter limit.
const ID_CHUNK = 5000;
async function loadByIds<T>(ids: number[], load: (chunk: number[]) => Promise<T[]>): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) out.push(...await load(unique.slice(i, i + ID_CHUNK)));
  return out;
}
function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) { const k = key(row); const list = map.get(k); if (list) list.push(row); else map.set(k, [row]); }
  return map;
}
async function loadAgentNames(ids: number[]): Promise<Map<number, string>> {
  const rows = await loadByIds(ids, chunk =>
    db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable).where(inArray(agentsTable.id, chunk)));
  return new Map(rows.map(r => [r.id, r.name]));
}
const paymentsUploadDir = path.join(__dirname, "..", "uploads", "payments");
fs.mkdirSync(paymentsUploadDir, { recursive: true });

const ALLOWED_DOC_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const bulkDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, paymentsUploadDir),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_DOC_MIME[file.mimetype] || ".bin";
    cb(null, `pay-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const uploadBulkDoc = multer({
  storage: bulkDocStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIME[file.mimetype]) { cb(null, true); return; }
    cb(new Error("Lloji i skedarit nuk lejohet (vetëm PDF, JPG, PNG, WEBP)"));
  },
});

// Wrap multer so upload/validation errors return a clean 400 instead of crashing.
// Multipart is optional here — JSON requests pass straight through.
function uploadBulkDocSafe(req: any, res: any, next: any): void {
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("multipart/form-data")) { next(); return; }
  uploadBulkDoc.single("document")(req, res, (err: any) => {
    if (err) { res.status(400).json({ error: err.message || "Ngarkimi i skedarit dështoi" }); return; }
    next();
  });
}

async function logBookingChange(opts: {
  bookingId: number;
  userId?: number | null;
  userName?: string;
  userRole?: string | null;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}) {
  await db.insert(bookingChangeLogsTable).values({
    bookingId: opts.bookingId,
    userId: opts.userId ?? null,
    userName: opts.userName ?? "System",
    userRole: opts.userRole ?? null,
    action: opts.action,
    fieldName: opts.fieldName ?? null,
    oldValue: opts.oldValue ?? null,
    newValue: opts.newValue ?? null,
    note: opts.note ?? null,
  });
}

// Historik për ÇDO pagesë — krijim/ndryshim/anulim/konfirmim/rimbursim me emër përdoruesi.
async function logPaymentChange(req: any, opts: {
  paymentId: number;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}, client: any = db) {
  try {
    await client.insert(paymentChangeLogsTable).values({
      paymentId: opts.paymentId,
      userId: req?.session?.userId ?? null,
      userName: req?.session?.userName ?? "System",
      userRole: req?.session?.role ?? null,
      action: opts.action,
      fieldName: opts.fieldName ?? null,
      oldValue: opts.oldValue ?? null,
      newValue: opts.newValue ?? null,
      note: opts.note ?? null,
    });
  } catch (e) {
    console.error("logPaymentChange failed:", e);
  }
}

async function nextCreditInvoiceCodeInTransaction(client: any): Promise<string> {
  const result: any = await client.execute(sql`
    SELECT 'INV-' || to_char(now(),'YYMMDD') || '-CRD' || lpad((
      COALESCE((
        SELECT MAX(substring(invoice_code from '-CRD([0-9]+)$')::int)
        FROM agent_credit_transactions
        WHERE invoice_code LIKE 'INV-' || to_char(now(),'YYMMDD') || '-CRD%'
      ), 0) + 1
    )::text, 2, '0') AS code
  `);
  return (result.rows ?? result)?.[0]?.code ?? `INV-CRD-${Date.now()}`;
}

import {
  ListPaymentsQueryParams,
  CreatePaymentBody,
  GetPaymentParams,
  UpdatePaymentParams,
  UpdatePaymentBody,
  RefundPaymentParams,
  RefundPaymentBody,
} from "@workspace/api-zod";

const METHOD_LABELS: Record<string, string> = {
  cash:          "Cash",
  bank_transfer: "Transfer Bankar",
  card:          "Kartë",
  online:        "Online",
  credit:        "Kredit (Wallet)",
};

const router: IRouter = Router();

function formatPayment(p: typeof paymentsTable.$inferSelect) {
  return {
    ...p,
    amount: Number(p.amount),
    createdAt: p.createdAt.toISOString(),
  };
}

async function recalcBookingPayments(bookingId: number, client: any = db) {
  const payments = await client
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.bookingId, bookingId));

  let paidAmount = 0;
  for (const p of payments) {
    if (p.status === "completed" && !p.isRefund) {
      paidAmount += Number(p.amount);
    } else if (p.status === "completed" && p.isRefund) {
      paidAmount -= Number(p.amount);
    }
  }

  await client
    .update(bookingsTable)
    .set({ paidAmount: String(Math.max(0, paidAmount)) })
    .where(eq(bookingsTable.id, bookingId));
}

const CANCELLED_BOOKING_PAYMENT_ERROR = "Nuk mund të ndryshoni pagesat për një rezervim të anuluar.";

function isCancelledBookingPaymentError(error: unknown): boolean {
  return error instanceof Error && error.message === CANCELLED_BOOKING_PAYMENT_ERROR;
}

class InsufficientWalletBalanceError extends Error {
  constructor(walletBalance: number, required: number) {
    super(`Balanca e pamjaftueshme — keni €${Math.round(walletBalance)}, nevojiten €${Math.round(required)}`);
  }
}
class BulkPaymentValidationError extends Error {}

router.get("/payments", async (req, res): Promise<void> => {
  const parsed = ListPaymentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let query = db.select().from(paymentsTable).$dynamic();

  if (parsed.data.bookingId) {
    query = query.where(eq(paymentsTable.bookingId, parsed.data.bookingId));
  }

  if (parsed.data.status) {
    query = query.where(eq(paymentsTable.status, parsed.data.status));
  }

  const payments = await query.orderBy(paymentsTable.createdAt);

  // Enrich each payment with bookingRef + totalAmount from the booking (one batch query)
  const bookingRows = await loadByIds(payments.flatMap(p => p.bookingId ? [p.bookingId] : []), chunk =>
    db.select({ id: bookingsTable.id, bookingRef: bookingsTable.bookingRef, totalAmount: bookingsTable.totalAmount })
      .from(bookingsTable).where(inArray(bookingsTable.id, chunk)));
  const bookingById = new Map(bookingRows.map(b => [b.id, b]));
  const enriched = payments.map(p => {
    const base = formatPayment(p);
    if (!p.bookingId) return { ...base, bookingRef: null, totalAmount: null };
    const bk = bookingById.get(p.bookingId);
    return {
      ...base,
      bookingRef: bk?.bookingRef ?? null,
      totalAmount: bk ? Number(bk.totalAmount) : null,
    };
  });

  res.json(enriched);
});

router.post("/payments", async (req, res): Promise<void> => {
  const selected = await validateManualPaymentMethod(req.body?.method);
  if ("error" in selected) {
    res.status(400).json({ error: selected.error });
    return;
  }
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rawPayerType = (req.body as any)?.payerType;
  const payerType = rawPayerType === "invoice" || rawPayerType === "client" ? rawPayerType : null;

  let payment!: typeof paymentsTable.$inferSelect;
  try {
    await db.transaction(async tx => {
      const locked: any = await tx.execute(sql`
        SELECT status FROM bookings WHERE id = ${parsed.data.bookingId} FOR UPDATE
      `);
      const lockedBooking = (locked.rows ?? locked)?.[0];
      if (lockedBooking?.status === "cancelled") throw new Error(CANCELLED_BOOKING_PAYMENT_ERROR);

       [payment] = await tx.insert(paymentsTable).values({
          ...parsed.data,
          method: selected.method,
         amount: String(roundWholeEuro(Number(parsed.data.amount))),
        status: "completed",
        isRefund: false,
        payerType,
      } as any).returning();
      await recalcBookingPayments(parsed.data.bookingId, tx);

      await logPaymentChange(req, {
        paymentId: payment.id,
        action: "created",
         newValue: `€${Math.round(Number(parsed.data.amount))} · ${METHOD_LABELS[selected.method] ?? selected.method}${payment.invoiceCode ? ` · ${payment.invoiceCode}` : ""}${payment.reference ? ` · Ref: ${payment.reference}` : ""}`,
        note: parsed.data.notes ?? null,
      }, tx);

      // Check for overpayment while the booking remains locked. The compensating
      // refund, final paid amount and wallet credit are one atomic financial unit.
      const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, parsed.data.bookingId));
      if (booking?.agentId) {
        const paidAmt = Number(booking.paidAmount);
        const totalAmt = Number(booking.totalAmount);
        if (wholeEuroOverpay(paidAmt, totalAmt) > 0) {
          const excess = wholeEuroOverpay(paidAmt, totalAmt);
          const creditNote = `Kreditim nga tepricë — booking ${booking.bookingRef}`;
          const [autoCreditPay] = await tx.insert(paymentsTable).values({
            bookingId: booking.id,
            amount: String(excess),
            method: "credit",
            status: "completed",
            isRefund: true,
            reference: "KREDIT-AUTO",
            notes: creditNote,
          }).returning();

          if (autoCreditPay) {
            await logPaymentChange(req, {
              paymentId: autoCreditPay.id,
              action: "created",
               newValue: `€${Math.round(excess)} · Kreditim automatik nga tepricë (KREDIT-AUTO)`,
              note: creditNote,
            }, tx);
          }

          await recalcBookingPayments(booking.id, tx);

          const [agent] = await tx.select({ id: agentsTable.id }).from(agentsTable)
            .where(eq(agentsTable.id, booking.agentId));
          if (agent) {
            await tx.update(agentsTable)
              .set({ walletBalance: sql`round((${agentsTable.walletBalance} + ${String(excess)}::numeric)::numeric, 2)` })
              .where(eq(agentsTable.id, booking.agentId));

            const creditInvoiceCode = await nextCreditInvoiceCodeInTransaction(tx);
            await tx.insert(agentCreditTransactionsTable).values({
              agentId: booking.agentId,
              type: "credit",
              amount: String(excess),
              bookingId: booking.id,
              bookingRef: booking.bookingRef,
              notes: creditNote,
              reference: "KREDIT-AUTO",
              invoiceCode: creditInvoiceCode,
            });
          }
        }
      }
    });
  } catch (error) {
    if (isCancelledBookingPaymentError(error)) {
      res.status(409).json({ error: CANCELLED_BOOKING_PAYMENT_ERROR });
      return;
    }
    throw error;
  }

  // Log the payment in booking change history
  logBookingChange({
    bookingId: parsed.data.bookingId,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "payment_added",
    fieldName: "Pagesë",
      newValue: `€${Math.round(Number(parsed.data.amount))} (${METHOD_LABELS[selected.method] ?? selected.method})${payment.invoiceCode ? ` · ${payment.invoiceCode}` : ""}`,
    note: parsed.data.notes ?? null,
  }).catch(() => {});
  res.status(201).json(formatPayment(payment));

  // Generate + email the invoice (PDF) to agent + admin. Fire-and-forget.
  sendPaymentInvoice(payment.id).catch(() => {});
});

// GET /payments/ledger – ALL financial movements (payments + wallet)
router.get("/payments/ledger", async (req, res): Promise<void> => {
  const { agentId, dateFrom, dateTo, search } = req.query as Record<string, string>;
  const agentIdNum = agentId ? parseInt(agentId, 10) : NaN;

  // ── 1. All payment table rows ──────────────────────────────────────────────
  const payRows = await db.select().from(paymentsTable).orderBy(paymentsTable.createdAt);

  const ledgerBookings = await loadByIds(payRows.flatMap(p => p.bookingId ? [p.bookingId] : []), chunk =>
    db.select({ id: bookingsTable.id, bookingRef: bookingsTable.bookingRef, totalAmount: bookingsTable.totalAmount, agentId: bookingsTable.agentId })
      .from(bookingsTable).where(inArray(bookingsTable.id, chunk)));
  const ledgerBookingById = new Map(ledgerBookings.map(b => [b.id, b]));
  const walletRows = await db.select().from(agentCreditTransactionsTable)
    .where(sql`${agentCreditTransactionsTable.type} IN ('deposit','credit')`)
    .orderBy(agentCreditTransactionsTable.createdAt);
  const ledgerAgentNames = await loadAgentNames([
    ...ledgerBookings.flatMap(b => b.agentId ? [b.agentId] : []),
    ...walletRows.map(w => w.agentId),
  ]);

  const enrichedPayments = payRows.map(p => {
    let bookingRef: string | null = null;
    let totalAmount: number | null = null;
    let agentName: string | null = null;
    let payAgentId: number | null = null;
    if (p.bookingId) {
      const bk = ledgerBookingById.get(p.bookingId);
      if (bk) {
        bookingRef = bk.bookingRef;
        totalAmount = Number(bk.totalAmount);
        payAgentId = bk.agentId;
        if (bk.agentId) agentName = ledgerAgentNames.get(bk.agentId) ?? null;
      }
    }
    return {
      id: `pay-${p.id}`,
      _source: "payment",
      batchId: p.batchId ?? null,
      createdAt: p.createdAt.toISOString(),
      bookingId: p.bookingId,
      bookingRef,
      invoiceCode: p.invoiceCode,
      totalAmount,
      agentId: payAgentId,
      agentName,
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      confirmNote: p.confirmNote,
      isRefund: p.isRefund,
      status: p.status,
      confirmed: p.confirmed,
      payerType: p.payerType,
    };
  });

  // ── 1b. Collapse mass-payment rows (same batchId) into one total line ───────
  // Each aggregate carries the full member list so the UI can expand it and keep
  // per-payment actions (confirm / cancel / note / single-invoice download).
  const groupedPayments: any[] = [];
  const batchSeen = new Map<string, number>(); // batchId -> index in groupedPayments
  for (const r of enrichedPayments) {
    if (r.batchId) {
      const idx = batchSeen.get(r.batchId);
      if (idx === undefined) {
        batchSeen.set(r.batchId, groupedPayments.length);
        groupedPayments.push({
          id: `batch-${r.batchId}`,
          _source: "payment",
          _batch: true,
          batchId: r.batchId,
          _members: [r],
          createdAt: r.createdAt,
          bookingId: null,
          bookingRef: null,
          invoiceCode: r.invoiceCode,
          totalAmount: null,
          agentId: r.agentId,
          agentName: r.agentName,
          amount: 0,
          method: r.method,
          reference: r.reference,
          notes: r.notes, // summaryNote already contains the per-ticket breakdown
          confirmNote: null,
          isRefund: false,
          status: "completed",
          confirmed: false,
          payerType: r.payerType,
        });
      } else {
        groupedPayments[idx]._members.push(r);
      }
    } else {
      groupedPayments.push(r);
    }
  }
  // Finalize batch aggregates from their members. Amount, "N bileta" count and the
  // confirmed flag reflect only the ACTIVE (non-cancelled) members so the ledger
  // total matches the agent credit page (which excludes cancelled payments). When
  // every member is cancelled the whole batch reads as cancelled. enrichedPayments
  // is ordered by createdAt, so the first used member is the earliest → a stable
  // representative invoiceCode/timestamp shared with the agent page.
  for (const g of groupedPayments) {
    if (!g._batch) continue;
    const active = g._members.filter((m: any) => m.status !== "cancelled");
    const used = active.length > 0 ? active : g._members;
    g.amount = used.reduce((s: number, m: any) => s + Number(m.amount), 0);
    g.status = active.length > 0 ? "completed" : "cancelled";
    g.confirmed = used.every((m: any) => m.confirmed);
    g.createdAt = used[0].createdAt;
    g.invoiceCode = used[0].invoiceCode;
    g.bookingRef = `${used.length} bileta`;
  }

  // ── 2. Wallet movements (deposit + credit only — avoid double-counting) ────
  // (walletRows + agent names are loaded in one batch above)
  const enrichedWallet = walletRows.map(w => {
    const agentName = ledgerAgentNames.get(w.agentId) ?? null;
    return {
      id: `wallet-${w.id}`,
      _source: w.type === "deposit" && w.paymentMethod ? "payment" : "wallet",
      _walletType: w.type,
      createdAt: w.createdAt.toISOString(),
      bookingId: w.bookingId,
      bookingRef: w.bookingRef,
      totalAmount: null,
      agentId: w.agentId,
      agentName,
      amount: Number(w.amount),
      method: w.type === "deposit" ? (w.paymentMethod ?? "wallet-deposit") : "wallet-credit",
      reference: w.reference,
      notes: w.notes,
      invoiceCode: w.invoiceCode ?? null,
      isRefund: false,
      status: "completed",
      confirmed: true,
    };
  });

  // ── 3. Merge + filter ──────────────────────────────────────────────────────
  let rows = [...groupedPayments, ...enrichedWallet].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (!isNaN(agentIdNum)) rows = rows.filter(r => r.agentId === agentIdNum);
  if (dateFrom) rows = rows.filter(r => r.createdAt >= dateFrom);
  if (dateTo) rows = rows.filter(r => r.createdAt <= dateTo + "T23:59:59");
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      r.bookingRef?.toLowerCase().includes(q) ||
      r.reference?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q) ||
      r.agentName?.toLowerCase().includes(q)
    );
  }

  // Non-admins: agjentët me showInReports === false fshihen tërësisht.
  const isAdmin = (req as any).session?.role === "admin";
  if (!isAdmin) {
    const hidden = await db.select({ id: agentsTable.id }).from(agentsTable)
      .where(eq(agentsTable.showInReports, false));
    const hiddenAgentIds = new Set(hidden.map(a => a.id));
    rows = rows.filter(r => r.agentId == null || !hiddenAgentIds.has(r.agentId));
  }

  res.json(rows);
});

// Download the batch (mass payment) invoice PDF — one document listing every
// ticket in the batch + grand total. MUST be before /payments/:id.
router.get("/payments/batch/:batchId/invoice", async (req, res): Promise<void> => {
  const batchId = String(req.params.batchId || "");
  if (!batchId) { res.status(400).json({ error: "batchId required" }); return; }

  const result = await buildBatchInvoicePdf(batchId);
  if (!result) {
    res.status(404).json({ error: "Nuk u gjet fatura masive për këtë pagesë" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.send(result.buffer);
});

// GET /payments/pending-bookings – bookings with outstanding balance (MUST be before /:id)
router.get("/payments/pending-bookings", async (req, res): Promise<void> => {
  const { agentId } = req.query as Record<string, string>;

  // Non-admins nuk lejohen të shohin rezervimet e agjentëve të çaktivizuar
  // (showInReports === false). Nëse kërkohet pikërisht një agjent i tillë,
  // kthe listë bosh; përndryshe filtro ata jashtë rezultateve.
  const isAdmin = (req as any).session?.role === "admin";
  let hiddenAgentIds: number[] = [];
  if (!isAdmin) {
    const hidden = await db.select({ id: agentsTable.id }).from(agentsTable)
      .where(eq(agentsTable.showInReports, false));
    hiddenAgentIds = hidden.map(a => a.id);
  }

  const conditions: any[] = [];
  const agentIdNum = agentId ? parseInt(agentId, 10) : NaN;
  if (!isNaN(agentIdNum)) {
    if (!isAdmin && hiddenAgentIds.includes(agentIdNum)) { res.json([]); return; }
    conditions.push(eq(bookingsTable.agentId, agentIdNum));
  } else if (!isAdmin && hiddenAgentIds.length > 0) {
    conditions.push(sql`(${bookingsTable.agentId} IS NULL OR ${bookingsTable.agentId} NOT IN (${sql.join(hiddenAgentIds, sql`, `)}))`);
  }
  conditions.push(sql`${bookingsTable.status} != 'cancelled'`);

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(bookingsTable.createdAt);

  const pendingIds = bookings.map(b => b.id);
  const [pendingPayments, pendingPax, pendingFlights, pendingAgentNames] = await Promise.all([
    loadByIds(pendingIds, chunk => db.select().from(paymentsTable).where(inArray(paymentsTable.bookingId, chunk))),
    loadByIds(pendingIds, chunk => db.select({ bookingId: passengersTable.bookingId, type: passengersTable.type, cancelled: passengersTable.cancelled })
      .from(passengersTable).where(inArray(passengersTable.bookingId, chunk))),
    loadByIds(bookings.map(b => b.flightId), chunk => db.select().from(flightsTable).where(inArray(flightsTable.id, chunk))),
    loadAgentNames(bookings.flatMap(b => b.agentId ? [b.agentId] : [])),
  ]);
  const pendingPaymentsByBooking = groupBy(pendingPayments, p => p.bookingId);
  const pendingPaxByBooking = groupBy(pendingPax, p => p.bookingId);
  const pendingFlightById = new Map(pendingFlights.map(f => [f.id, f]));

  const results = bookings.map(b => {
    const payments = pendingPaymentsByBooking.get(b.id) ?? [];
    const paid = payments.filter(p => p.status === "completed" && !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
    const refunded = payments.filter(p => p.status === "completed" && p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
    const rawPaid = Math.max(0, paid - refunded);
    const totalAmount = Number(b.totalAmount);
    const paidAmount = Math.min(rawPaid, totalAmount);
    const dueAmount = wholeEuroDue(totalAmount, rawPaid);
    const creditAmount = Math.max(0, rawPaid - totalAmount);
    if (dueAmount <= 0) return null;

    const agentName: string | null = b.agentId ? (pendingAgentNames.get(b.agentId) ?? null) : null;
    const flight = pendingFlightById.get(b.flightId);
    const pax = pendingPaxByBooking.get(b.id) ?? [];
    const paxCount = pax.filter(p => p.type !== "infant" && !(p as any).cancelled).length;
    const infantCount = pax.filter(p => p.type === "infant" && !(p as any).cancelled).length;

    return {
      id: b.id,
      bookingRef: b.bookingRef,
      pnr: b.pnr ?? null,
      customerName: b.customerName,
      agentId: b.agentId,
      agentName,
      status: b.status,
      totalAmount,
      paidAmount,
      dueAmount,
      creditAmount,
      paxCount,
      infantCount,
      createdAt: b.createdAt.toISOString(),
      flight: flight ? {
        fromCity: flight.fromCity,
        toCity: flight.toCity,
        departureDate: flight.departureDate,
        departureTime: flight.departureTime,
        flightNumber: flight.flightNumber,
      } : null,
    };
  });

  res.json(results.filter(Boolean));
});

// GET /payments/report – full booking report with filters (MUST be before /:id)
router.get("/payments/report", async (req, res): Promise<void> => {
  const { agentId, customerName, debtFilter, dateFrom, dateTo } = req.query as Record<string, string>;

  const role = (req as any).session?.role;
  if (role !== "admin") {
    const { getEffectivePermissions } = await import("./permissions");
    const perms = await getEffectivePermissions(role, (req as any).session?.userId);
    // Raporti i plotë i pagesave (të gjithë agjentët) kërkon can_view_payments_report.
    // Raporti për një agjent të vetëm (faqja/detaji i Agjentëve) lejohet për ata që kanë akses te agjentët.
    const isPerAgent = !!(agentId && agentId.trim());
    const allowed = perms["can_view_payments_report"] || (isPerAgent && perms["can_access_agents"]);
    if (!allowed) {
      res.status(403).json({ error: "Nuk keni leje për të parë raportin e pagesave" });
      return;
    }
  }

  const conditions: any[] = [sql`${bookingsTable.status} != 'cancelled'`];
  const agentIdNum = agentId ? parseInt(agentId, 10) : NaN;
  if (!isNaN(agentIdNum)) conditions.push(eq(bookingsTable.agentId, agentIdNum));
  if (customerName && customerName.trim()) conditions.push(ilike(bookingsTable.customerName, `%${customerName.trim()}%`));
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom ?? "")) {
    conditions.push(sql`${bookingsTable.createdAt} >= (${dateFrom}::timestamp AT TIME ZONE 'Europe/Tirane')`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo ?? "")) {
    conditions.push(sql`${bookingsTable.createdAt} < ((${dateTo}::date + 1)::timestamp AT TIME ZONE 'Europe/Tirane')`);
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(and(...conditions))
    .orderBy(bookingsTable.createdAt);

  const reportIds = bookings.map(b => b.id);
  const [reportPayments, reportPax, reportFlights, reportAgentNames, splitNetMap] = await Promise.all([
    loadByIds(reportIds, chunk => db.select().from(paymentsTable).where(inArray(paymentsTable.bookingId, chunk)).orderBy(paymentsTable.id)),
    loadByIds(reportIds, chunk => db.select().from(passengersTable).where(inArray(passengersTable.bookingId, chunk)).orderBy(passengersTable.id)),
    loadByIds(bookings.map(b => b.flightId), chunk => db.select().from(flightsTable).where(inArray(flightsTable.id, chunk))),
    loadAgentNames(bookings.flatMap(b => b.agentId ? [b.agentId] : [])),
    getSplitNetTotalsMap(reportIds),
  ]);
  const reportPaymentsByBooking = groupBy(reportPayments, p => p.bookingId);
  const reportPaxByBooking = groupBy(reportPax, p => p.bookingId);
  const reportFlightById = new Map(reportFlights.map(f => [f.id, f]));

  const rows = bookings.map(b => {
    const payments = reportPaymentsByBooking.get(b.id) ?? [];
    const paid = payments.filter(p => p.status === "completed" && !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
    const refunded = payments.filter(p => p.status === "completed" && p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
    const rawPaid2 = Math.max(0, paid - refunded);
    const totalAmount = Number(b.totalAmount);
    const paidAmount = Math.min(rawPaid2, totalAmount);
    const dueAmount = wholeEuroDue(totalAmount, rawPaid2);
    const creditAmount = Math.max(0, rawPaid2 - totalAmount);
    const { combinedNet, commission: commCalc } = calcCombinedNetAndCommission(totalAmount, b.netPrice != null ? Number(b.netPrice) : null, splitNetMap.get(b.id) ?? 0, 0);
    const netPrice = combinedNet;
    const commissionAmount = combinedNet != null ? Math.round(commCalc * 100) / 100 : null;

    const agentName: string | null = b.agentId ? (reportAgentNames.get(b.agentId) ?? null) : null;
    const flight = reportFlightById.get(b.flightId);
    const passengers = reportPaxByBooking.get(b.id) ?? [];

    if (debtFilter === "debt" && dueAmount <= 0) return null;
    if (debtFilter === "no-debt" && dueAmount > 0) return null;

    return {
      id: b.id,
      bookingRef: b.bookingRef,
      pnr: b.pnr ?? null,
      customerName: b.customerName,
      customerEmail: b.customerEmail ?? null,
      customerPhone: b.customerPhone ?? null,
      agentId: b.agentId,
      agentName,
      status: b.status,
      totalAmount,
      paidAmount,
      dueAmount,
      creditAmount,
      netPrice,
      commissionAmount,
      notes: b.notes ?? null,
      createdAt: b.createdAt.toISOString(),
      flight: flight ? {
        fromCity: flight.fromCity, toCity: flight.toCity,
        departureDate: flight.departureDate, departureTime: flight.departureTime,
        airline: flight.airline, flightNumber: flight.flightNumber,
      } : null,
      passengers: passengers.map(p => ({
        firstName: p.firstName, lastName: p.lastName, type: p.type,
        passportNumber: p.passportNumber ?? null, seatNumber: p.seatNumber ?? null,
        baggageOption: p.baggageOption ?? null,
      })),
      paymentHistory: payments.map(p => ({
        amount: Number(p.amount), method: p.method, status: p.status,
        reference: p.reference ?? null, isRefund: p.isRefund,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  });

  // Non-admins: agjentët me showInReports === false fshihen tërësisht nga raporti.
  let reportRows = rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[];
  const isAdmin = (req as any).session?.role === "admin";
  if (!isAdmin) {
    const hidden = await db.select({ id: agentsTable.id }).from(agentsTable)
      .where(eq(agentsTable.showInReports, false));
    const hiddenAgentIds = new Set(hidden.map(a => a.id));
    reportRows = reportRows.filter(r => r.agentId == null || !hiddenAgentIds.has(r.agentId));
  }

  res.json(reportRows);
});

// POST /payments/bulk – apply exact amounts per booking + optional wallet credit
// Serializes identical concurrent bulk-payment submissions (double-click, two
// tabs, network retries). Keyed by method + sorted payment lines; the DB
// duplicate-check below handles the sequential case, this closes the race
// where two identical requests run the check before either has inserted.
const bulkPaymentInFlight = new Set<string>();

router.post("/payments/bulk", uploadBulkDocSafe, async (req, res): Promise<void> => {
  // When sent as multipart (with a document), fields arrive as strings — normalize them.
  const body = req.body as Record<string, any>;
  let paymentLines: { bookingId: number; amount: number }[] = [];
  try {
    paymentLines = typeof body.payments === "string" ? JSON.parse(body.payments) : (body.payments ?? []);
  } catch {
    res.status(400).json({ error: "payments invalid" });
    return;
  }
  paymentLines = paymentLines.map(line => ({ bookingId: Number(line.bookingId), amount: roundWholeEuro(Number(line.amount)) }));
  const selected = await validateManualPaymentMethod(body.method);
  if ("error" in selected) {
    res.status(400).json({ error: selected.error });
    return;
  }
  const method = selected.method;
  const tenderedRaw = body.tenderedAmount;
  const tenderedAmount = tenderedRaw == null || tenderedRaw === "" ? NaN : roundWholeEuro(Number(tenderedRaw));
  const reference: string | undefined = body.reference || undefined;
  const notes: string | undefined = body.notes || undefined;
  const bodyAgentId: number | undefined = body.agentId != null && body.agentId !== "" ? Number(body.agentId) : undefined;
  const rawPayerType: string | undefined = body.payerType;
  const documentUrl = (req as any).file ? `/api/uploads/payments/${(req as any).file.filename}` : null;
  const payerType = rawPayerType === "invoice" || rawPayerType === "client" ? rawPayerType : null;

  if (!paymentLines || !Array.isArray(paymentLines) || paymentLines.length === 0) {
    res.status(400).json({ error: "payments array required" });
    return;
  }
  if (!Number.isFinite(tenderedAmount) || tenderedAmount < 0 || Number(tenderedRaw) !== tenderedAmount) {
    res.status(400).json({ error: "tenderedAmount duhet të jetë një shumë e plotë euro." });
    return;
  }
  if (paymentLines.reduce((sum, line) => sum + (line.amount > 0 ? line.amount : 0), 0) > tenderedAmount) {
    res.status(400).json({ error: "Shumat e pagesave tejkalojnë shumën e tenderuar." });
    return;
  }
  const submittedBookingIds = paymentLines.filter(line => line.bookingId > 0).map(line => line.bookingId);
  if (new Set(submittedBookingIds).size !== submittedBookingIds.length) {
    res.status(400).json({ error: "Çdo rezervim mund të paraqitet vetëm një herë në pagesën masive." });
    return;
  }
  const normalizedLineTotal = paymentLines.reduce((sum, line) => sum + (line.amount > 0 ? line.amount : 0), 0);
  if (method === "credit" && tenderedAmount !== normalizedLineTotal) {
    res.status(400).json({ error: "Pagesa me Kredit kërkon që tenderedAmount të jetë i barabartë me totalin e rreshtave." });
    return;
  }

  // ── In-flight lock: identical submission already being processed ─────────
  const inFlightKey = method + "|" + paymentLines
    .filter(l => l.bookingId && l.amount && l.amount > 0)
    .map(l => `${l.bookingId}:${l.amount}`)
    .sort()
    .join(",");
  if (bulkPaymentInFlight.has(inFlightKey)) {
    res.status(409).json({
      error: "E njëjta pagesë është duke u procesuar tani — mos e ridërgoni.",
      duplicate: true,
    });
    return;
  }
  bulkPaymentInFlight.add(inFlightKey);
  res.once("finish", () => bulkPaymentInFlight.delete(inFlightKey));
  res.once("close", () => bulkPaymentInFlight.delete(inFlightKey));

  const createdPayments: any[] = [];
  // Resolved exclusively from the locked booking rows inside the transaction.
  let resolvedAgentId: number | null = null;

  // For non-credit methods: overpayment is allowed — excess goes to agent wallet credit

  // ── Duplicate-submit guard ───────────────────────────────────────────────
  // A resubmit of the exact same lines within a short window almost always
  // means an accidental double payment (seen live: identical wallet credit
  // recorded twice 20s apart). Reject unless the client explicitly confirms
  // with allowDuplicate.
  const allowDuplicate = body.allowDuplicate === true || body.allowDuplicate === "true" || body.allowDuplicate === "1";
  if (!allowDuplicate) {
    const validLines = paymentLines.filter(l => l.bookingId && l.amount && l.amount > 0);
    let allDuplicated = validLines.length > 0;
    for (const line of validLines) {
      const dup = await db.execute(sql`
        SELECT 1 FROM payments
        WHERE booking_id = ${line.bookingId}
          AND method = ${method}
          AND status = 'completed'
          AND is_refund = false
          AND amount = ${String(line.amount)}::numeric
          AND created_at > now() - interval '2 minutes'
        LIMIT 1
      `);
      const rows: any[] = (dup as any).rows ?? (dup as any);
      if (!rows || rows.length === 0) { allDuplicated = false; break; }
    }
    if (allDuplicated) {
      res.status(409).json({
        error: "Një pagesë identike (e njëjta biletë, shumë dhe mënyrë) u regjistrua para pak sekondash — ndoshta u dërgua dy herë. Kontrolloni Historikun e pagesave. Nëse është vërtet pagesë e re e qëllimshme, konfirmoni ridërgimin.",
        duplicate: true,
      });
      return;
    }
  }

  // A mass payment (>1 booking) is ONE invoice for the total, so all its rows share
  // a SINGLE invoice code (one nextval) + a batchId. Generate them up front so we
  // can stamp every row at insert time (and never burn one sequence number per
  // ticket). Single payments fall through to the per-row sequence default.
  const validLineCount = paymentLines.filter(l => l.bookingId && l.amount && l.amount > 0).length;
  let batchId: string | null = null;
  let batchInvoiceCode: string | null = null;
  let summaryNote = "";
  let bulkIntentMarker = "";
  let creditAdded = 0;
  let serverCreditAmount = 0;
  let creditDescription: string | null = null;
  const paymentPlans = new Map<number, number>();
  if (validLineCount > 1) {
    const codeRes: any = await db.execute(
      sql`SELECT 'INV-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('invoice_code_seq')::text,6,'0') AS code`,
    );
    batchInvoiceCode = (codeRes.rows ?? codeRes)?.[0]?.code ?? null;
    if (!batchInvoiceCode) {
      res.status(500).json({ error: "Failed to generate batch invoice code" });
      return;
    }
    batchId = randomUUID();
  }

  // Lock in a stable order so a cancellation cannot pass between validation and
  // payment creation, while concurrent bulk submissions cannot deadlock.
  const bookingIdsToLock = [...new Set(paymentLines
    .map(line => line.bookingId)
    .filter((id): id is number => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
  try {
    await db.transaction(async tx => {
      const lockedResult: any = bookingIdsToLock.length > 0
        ? await tx.execute(sql`
            SELECT id, status, total_amount AS "totalAmount", booking_ref AS "bookingRef", agent_id AS "agentId"
            FROM bookings
            WHERE id = ANY(ARRAY[${sql.join(bookingIdsToLock.map(id => sql`${id}`), sql`, `)}]::int[])
            ORDER BY id
            FOR UPDATE
          `)
        : { rows: [] };
      const lockedBookings: any[] = lockedResult.rows ?? lockedResult ?? [];
      const lockedIds = new Set(lockedBookings.map(booking => Number(booking.id)));
      if (lockedBookings.length !== bookingIdsToLock.length || bookingIdsToLock.some(id => !lockedIds.has(id))) {
        throw new BulkPaymentValidationError("Një ose më shumë rezervime nuk u gjetën ose nuk janë të aksesueshme.");
      }
      if (lockedBookings.some(booking => booking.status === "cancelled")) {
        throw new Error(CANCELLED_BOOKING_PAYMENT_ERROR);
      }
      const bookingsById = new Map(lockedBookings.map(booking => [booking.id, booking]));
      const lockedAgentIds = [...new Set(lockedBookings.map(booking => booking.agentId))];
      if (lockedAgentIds.length !== 1 || lockedAgentIds[0] == null) {
        throw new BulkPaymentValidationError("Pagesat masive kërkojnë rezervime të së njëjtës agjenci.");
      }
      if (bodyAgentId != null && bodyAgentId !== Number(lockedAgentIds[0])) {
        throw new BulkPaymentValidationError("Agjenti i dërguar nuk përputhet me agjencinë e rezervimeve.");
      }
      resolvedAgentId = Number(lockedAgentIds[0]);
      const intentKey = `${resolvedAgentId}|${method}|${new Date().toISOString().slice(0, 10)}|${tenderedAmount}|${bookingIdsToLock.join(",")}`;
      // Invisible separator keeps the durable dedupe token out of normal
      // user-facing notes while retaining an auditable marker in both ledgers.
      const intentPrefix = `\u2063bulk-intent:${intentKey}|`;
      bulkIntentMarker = intentPrefix;
      // Derive excess only from locked booking totals, existing completed
      // payments, and this request's normalized lines. Never trust the client
      // supplied creditAmount as an accounting input.
      const submittedByBooking = new Map<number, number>();
      for (const line of paymentLines) {
        if (line.bookingId && line.amount > 0) {
          submittedByBooking.set(line.bookingId, (submittedByBooking.get(line.bookingId) ?? 0) + line.amount);
        }
      }
      let beforeTotal = 0;
      let afterTotal = 0;
      let lockedDueTotal = 0;
      const bookingReductions: Array<{
        bookingRef: string;
        oldTotal: number;
        newTotal: number;
        amount: number;
      }> = [];
      for (const [bookingId, submitted] of submittedByBooking) {
          const booking = bookingsById.get(bookingId);
          if (!booking) continue;
          const existing = await tx.select({ amount: paymentsTable.amount, isRefund: paymentsTable.isRefund, status: paymentsTable.status })
            .from(paymentsTable)
            .where(eq(paymentsTable.bookingId, bookingId));
          const paid = existing.filter(p => p.status === "completed")
            .reduce((sum, p) => sum + (p.isRefund ? -1 : 1) * Number(p.amount), 0);
          const total = Number(booking.totalAmount);
          const due = wholeEuroDue(total, paid);
          lockedDueTotal += due;
          if (method === "credit" && submitted > due) {
            throw new BulkPaymentValidationError("Pagesa me Kredit tejkalon detyrimin pas bllokimit.");
          }
          beforeTotal += wholeEuroOverpay(paid, total);
          afterTotal += wholeEuroOverpay(paid + submitted, total);
          const recordedAmount = Math.min(submitted, due);
          paymentPlans.set(bookingId, recordedAmount);
          const reductionAmount = submitted - recordedAmount;
          if (reductionAmount > 0) {
            bookingReductions.push({
              bookingRef: booking.bookingRef,
              oldTotal: paid + submitted,
              newTotal: total,
              amount: reductionAmount,
            });
          }
      }
      const recorded = [...paymentPlans.values()].reduce((sum, amount) => sum + amount, 0);
      // Credit is incremental, never a re-credit of historical excess.
      const incrementalOverpay = Math.max(0, afterTotal - beforeTotal);
      serverCreditAmount = method === "credit" ? 0 : tenderedAmount > lockedDueTotal
        ? Math.max(incrementalOverpay, tenderedAmount - recorded)
        : incrementalOverpay;
      const identifiedReductionTotal = bookingReductions.reduce((sum, item) => sum + item.amount, 0);
      if (
        bookingReductions.length === 1 &&
        serverCreditAmount > 0 &&
        Math.abs(identifiedReductionTotal - serverCreditAmount) < 0.001
      ) {
        const reduction = bookingReductions[0];
        creditDescription = `Kreditim €${formatWholeEuro(serverCreditAmount)} nga ulja e rezervimit ${reduction.bookingRef} (€${formatWholeEuro(reduction.oldTotal)} → €${formatWholeEuro(reduction.newTotal)})`;
      }
      if (method === "credit" && tenderedAmount !== recorded) {
        throw new BulkPaymentValidationError("Tendered amount nuk përputhet me pagesat e bllokuara.");
      }
      if (!allowDuplicate) {
        const priorPayments = await tx.select({ id: paymentsTable.id })
          .from(paymentsTable)
          .where(and(
            inArray(paymentsTable.bookingId, bookingIdsToLock),
            ilike(paymentsTable.notes, `%${intentPrefix}%`),
            sql`${paymentsTable.createdAt} > now() - interval '2 minutes'`,
          ))
          .limit(1);
        const priorCredits = await tx.select({ id: agentCreditTransactionsTable.id })
          .from(agentCreditTransactionsTable)
          .where(and(
            eq(agentCreditTransactionsTable.agentId, resolvedAgentId),
            ilike(agentCreditTransactionsTable.notes, `%${intentPrefix}%`),
            sql`${agentCreditTransactionsTable.createdAt} > now() - interval '2 minutes'`,
          ))
          .limit(1);
        if (priorPayments.length || priorCredits.length) {
          throw new BulkPaymentValidationError("Një pagesë masive me të njëjtin qëllim u regjistrua para pak çastesh.");
        }
      }
      if (recorded + serverCreditAmount !== tenderedAmount) throw new BulkPaymentValidationError("Tendered amount reconciliation failed");
      bulkIntentMarker = `${intentPrefix}plans=${[...paymentPlans.entries()].sort((a, b) => a[0] - b[0]).map(([id, amount]) => `${id}:${amount}`).join(",")};credit=${serverCreditAmount}]`;

      for (const line of paymentLines) {
        const { bookingId, amount } = line;
        if (!bookingId || !amount || amount <= 0) continue;

        const booking = bookingsById.get(bookingId);
        if (!booking) continue;

        const recordedAmount = method === "credit" ? amount : (paymentPlans.get(bookingId) ?? amount);
        if (recordedAmount <= 0) continue;
        const [payment] = await tx.insert(paymentsTable).values({
          bookingId,
          amount: String(recordedAmount),
          method,
          status: "completed",
          reference: reference || null,
          notes: notes || null,
          isRefund: false,
          payerType,
          documentUrl,
          // Batch rows share one invoice code + batchId; singles use the DB default.
          ...(batchInvoiceCode ? { invoiceCode: batchInvoiceCode, batchId } : {}),
        }).returning();

        await recalcBookingPayments(bookingId, tx);
        createdPayments.push({ bookingId, bookingRef: booking.bookingRef, amount: recordedAmount, paymentId: payment.id });

        logBookingChange({
          bookingId,
          userId: (req as any).session?.userId ?? null,
          userName: (req as any).session?.userName ?? "Staff",
          userRole: (req as any).session?.role ?? null,
          action: "payment_added",
          fieldName: "Pagesë",
          newValue: `€${formatWholeEuro(recordedAmount)} (${METHOD_LABELS[method] ?? method})${payment.invoiceCode ? ` · ${payment.invoiceCode}` : ""}`,
          note: notes || null,
        }).catch(() => {});
        await logPaymentChange(req, {
          paymentId: payment.id,
          action: "created",
          newValue: `€${formatWholeEuro(recordedAmount)} · ${METHOD_LABELS[method] ?? method} · Pagesë masive (${booking.bookingRef})${payment.invoiceCode ? ` · ${payment.invoiceCode}` : ""}`,
          note: notes || null,
        }, tx);
      }

      // Build detailed summary note
      const dateStr = new Date().toLocaleDateString("sq-AL", { day: "2-digit", month: "short", year: "numeric" });
      const grandTotal = createdPayments.reduce((s, p) => s + p.amount, 0) + serverCreditAmount;
      const breakdown = createdPayments.map(p => `${p.bookingRef} €${formatWholeEuro(p.amount)}`).join(" | ");
      const creditLine = serverCreditAmount > 0 ? ` | Tepricë €${formatWholeEuro(serverCreditAmount)}` : "";
      const methodLabel = method === "credit" ? "Kredit (Wallet)" : "Pagesë masive";
      summaryNote = `${methodLabel} ${dateStr}: ${breakdown}${creditLine} | Total €${formatWholeEuro(grandTotal)}${notes ? " — " + notes : ""} ${bulkIntentMarker}`;

      // batchId/invoiceCode were stamped at insert time. If the planned batch ended up
      // with a single created payment (e.g. a booking went missing), undo the batch
      // tag so it behaves like a normal single payment.
      if (batchId && createdPayments.length <= 1) {
        for (const cp of createdPayments) {
          await tx.update(paymentsTable).set({ batchId: null }).where(eq(paymentsTable.id, cp.paymentId));
        }
        batchId = null;
      }

      // Update notes on each payment with the summary breakdown.
      for (const cp of createdPayments) {
        await tx.update(paymentsTable)
          .set({ notes: summaryNote })
          .where(eq(paymentsTable.id, cp.paymentId));
      }

      // Wallet movements and their ledger rows commit atomically with all
      // payment rows. SQL arithmetic prevents concurrent lost updates.
      if (method === "credit" && resolvedAgentId && createdPayments.length > 0) {
        const lockedAgentResult: any = await tx.execute(sql`
          SELECT id, wallet_balance AS "walletBalance"
          FROM agents
          WHERE id = ${resolvedAgentId}
          FOR UPDATE
        `);
        const agent = (lockedAgentResult.rows ?? lockedAgentResult)?.[0];
        if (agent) {
          const totalDeducted = createdPayments.reduce((sum, item) => sum + item.amount, 0);
          const walletBalance = Math.max(0, Number(agent.walletBalance));
          if (totalDeducted > walletBalance + 0.001) {
            throw new InsufficientWalletBalanceError(walletBalance, totalDeducted);
          }
          await tx.update(agentsTable)
            .set({ walletBalance: sql`round((${agentsTable.walletBalance} - ${String(totalDeducted)}::numeric)::numeric, 2)` })
            .where(eq(agentsTable.id, resolvedAgentId));

          for (const cp of createdPayments) {
            await tx.insert(agentCreditTransactionsTable).values({
              agentId: resolvedAgentId,
              type: "payment",
              amount: String(cp.amount),
              bookingId: cp.bookingId,
              bookingRef: cp.bookingRef,
              reference: reference || null,
              notes: summaryNote,
            });
          }
        }
      }

      if (serverCreditAmount > 0 && resolvedAgentId && method !== "credit") {
        const [agent] = await tx.select({ id: agentsTable.id }).from(agentsTable)
          .where(eq(agentsTable.id, resolvedAgentId));
        if (agent) {
          await tx.update(agentsTable)
            .set({ walletBalance: sql`round((${agentsTable.walletBalance} + ${String(serverCreditAmount)}::numeric)::numeric, 2)` })
            .where(eq(agentsTable.id, resolvedAgentId));
          const creditInvoiceCode = await nextCreditInvoiceCodeInTransaction(tx);
          await tx.insert(agentCreditTransactionsTable).values({
            agentId: resolvedAgentId,
            type: "credit",
            amount: String(serverCreditAmount),
            bookingId: null,
            bookingRef: null,
            reference: reference || null,
            notes: creditDescription ? `${creditDescription} ${bulkIntentMarker}` : summaryNote,
            invoiceCode: creditInvoiceCode,
          });
          creditAdded = serverCreditAmount;
        }
      }
    });
  } catch (error) {
    if (isCancelledBookingPaymentError(error)) {
      res.status(409).json({ error: CANCELLED_BOOKING_PAYMENT_ERROR });
      return;
    }
    if (error instanceof InsufficientWalletBalanceError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof BulkPaymentValidationError || (error instanceof Error && error.message.includes("Tendered amount"))) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  // Email ONE invoice for the whole payment: a batch → a single batch invoice for
  // the total; otherwise the single payment's invoice. Never one invoice per ticket.
  if (batchId) {
    sendBatchInvoice(batchId).catch(() => {});
  } else {
    for (const cp of createdPayments) {
      sendPaymentInvoice(cp.paymentId).catch(() => {});
    }
  }

  res.status(201).json({ created: createdPayments.length, payments: createdPayments, creditAdded, summaryNote });
});

router.get("/payments/:id", async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  res.json(formatPayment(payment));
});

// Download the invoice PDF for a single payment (used by the download buttons
// shown wherever a payment appears: ledger, booking detail, etc.).
router.get("/payments/:id/invoice", async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  const result = await buildPaymentInvoicePdf(params.data.id, { confirmed: payment.confirmed });
  if (!result) {
    res.status(404).json({ error: "Nuk u gjet fatura për këtë pagesë" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.send(result.buffer);
});

router.patch("/payments/:id", async (req, res): Promise<void> => {
  // Ledger-only mutations (Konfirmo / shënim te 'Regjistri i Pagesave') require the
  // dedicated permission. Booking-detail edits (amount/method/status) keep their
  // existing behavior and are NOT gated here.
  const reqBody = req.body as any;
  const isLedgerMutation = reqBody?.confirmed !== undefined || reqBody?.confirmNote !== undefined;
  if (isLedgerMutation) {
    const role = (req as any).session?.role;
    if (role !== "admin") {
      const { getEffectivePermissions } = await import("./permissions");
      const perms = await getEffectivePermissions(role, (req as any).session?.userId);
      if (!perms["can_edit_payments_ledger"]) {
        res.status(403).json({ error: "Nuk keni leje për të konfirmuar/shënuar pagesa te 'Regjistri i Pagesave'" });
        return;
      }
    }
  }

  const params = UpdatePaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (reqBody && Object.prototype.hasOwnProperty.call(reqBody, "method")) {
    const selected = await validateManualPaymentMethod(reqBody.method);
    if ("error" in selected) {
      res.status(400).json({ error: selected.error });
      return;
    }
    parsed.data.method = selected.method;
  }

  const rawPayerType = (req.body as any)?.payerType;
  const patchPayerType = rawPayerType === "invoice" || rawPayerType === "client"
    ? rawPayerType
    : rawPayerType === null ? null : undefined;

  if (parsed.data.status !== undefined && !["completed", "cancelled"].includes(parsed.data.status)) {
    res.status(400).json({ error: "Status duhet të jetë 'completed' ose 'cancelled'" });
    return;
  }

  // Anulimi kërkon GJITHMONË shënim të detyrueshëm (cancelNote) — ruhet te notes.
  const rawCancelNote = typeof (req.body as any)?.cancelNote === "string" ? (req.body as any).cancelNote.trim() : "";
  let cancelNoteAppend: string | null = null;
  if (parsed.data.status === "cancelled") {
    const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (existing.reference === "KREDIT-AUTO") {
      res.status(400).json({ error: "Kreditimet automatike nuk mund të anulohen drejtpërdrejt." });
      return;
    }
    if (existing.status !== "cancelled") {
      if (!rawCancelNote) {
        res.status(400).json({ error: "Shënimi i anulimit është i detyrueshëm." });
        return;
      }
      const line = `[ANULUAR] ${rawCancelNote}`;
      cancelNoteAppend = existing.notes ? `${existing.notes}\n${line}` : line;
      // SHËNIM (2026-08-11, kërkesë e userit): anulimi i një pagese me KREDIT
      // NUK ia kthen më shumën portofolit — anulimi kuptohet si "paratë iu
      // kthyen klientit / pagesa u shënua gabim", pra s'krijohet asnjë kredit.
    }
  }

  const updateData: any = { ...parsed.data };
  delete updateData.cancelNote;
  if (patchPayerType !== undefined) updateData.payerType = patchPayerType;
  if (cancelNoteAppend !== null && updateData.notes === undefined) updateData.notes = cancelNoteAppend;

  // Lock the parent booking through the mutation. This makes a payment edit
  // serialize with booking cancellation rather than relying on a stale pre-check.
  let prevRow: typeof paymentsTable.$inferSelect | undefined;
  let payment: typeof paymentsTable.$inferSelect | undefined;
  const aiExpectedStatus =
    req.headers["x-ai-action"] && typeof req.headers["x-ai-expected-status"] === "string"
      ? req.headers["x-ai-expected-status"]
      : null;
  const aiExpectedConfirmedRaw =
    req.headers["x-ai-action"] &&
    typeof req.headers["x-ai-expected-confirmed"] === "string"
      ? req.headers["x-ai-expected-confirmed"]
      : null;
  const aiExpectedConfirmed =
    aiExpectedConfirmedRaw === "true"
      ? true
      : aiExpectedConfirmedRaw === "false"
        ? false
        : null;
  try {
    await db.transaction(async tx => {
      [prevRow] = await tx.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
      if (!prevRow) return;

      const locked: any = await tx.execute(sql`
        SELECT status FROM bookings WHERE id = ${prevRow.bookingId} FOR UPDATE
      `);
      const booking = (locked.rows ?? locked)?.[0];
      if (booking?.status === "cancelled") throw new Error(CANCELLED_BOOKING_PAYMENT_ERROR);

      [payment] = await tx
        .update(paymentsTable)
        .set(updateData)
        .where(and(
          eq(paymentsTable.id, params.data.id),
          ...(aiExpectedStatus ? [eq(paymentsTable.status, aiExpectedStatus)] : []),
          ...(aiExpectedConfirmed === null
            ? []
            : [eq(paymentsTable.confirmed, aiExpectedConfirmed)]),
        ))
        .returning();
      if (payment) await recalcBookingPayments(payment.bookingId, tx);
    });
  } catch (error) {
    if (isCancelledBookingPaymentError(error)) {
      res.status(409).json({ error: CANCELLED_BOOKING_PAYMENT_ERROR });
      return;
    }
    throw error;
  }
  const wasConfirmed = prevRow?.confirmed === true;

  if (!payment) {
    const aiPreconditionUsed =
      aiExpectedStatus !== null || aiExpectedConfirmed !== null;
    res.status(aiPreconditionUsed && prevRow ? 409 : 404).json({
      error:
        aiPreconditionUsed && prevRow
          ? "Pagesa ndryshoi pas krijimit të propozimit."
          : "Payment not found",
    });
    return;
  }

  // ── Historiku i pagesës: regjistro çdo lëvizje me diff ────────────────────
  if (prevRow) {
    const fmtEuro = (v: any) => `€${formatWholeEuro(v)}`;
    if (parsed.data.status === "cancelled" && prevRow.status !== "cancelled") {
      void logPaymentChange(req, {
        paymentId: payment.id,
        action: "cancelled",
        oldValue: prevRow.status,
        newValue: "cancelled",
        note: rawCancelNote || null,
      });
    } else if (parsed.data.status === "completed" && prevRow.status === "cancelled") {
      void logPaymentChange(req, { paymentId: payment.id, action: "restored", oldValue: "cancelled", newValue: "completed" });
    }
    if (parsed.data.confirmed === true && !wasConfirmed) {
      void logPaymentChange(req, { paymentId: payment.id, action: "confirmed", note: (parsed.data as any).confirmNote ?? null });
    } else if (parsed.data.confirmed === false && wasConfirmed) {
      void logPaymentChange(req, { paymentId: payment.id, action: "unconfirmed" });
    }
    const diffs: Array<{ field: string; label: string; old: string | null; nu: string | null }> = [];
    if (parsed.data.amount !== undefined && Number(parsed.data.amount) !== Number(prevRow.amount)) {
      diffs.push({ field: "amount", label: "Shuma", old: fmtEuro(prevRow.amount), nu: fmtEuro(parsed.data.amount) });
    }
    if (parsed.data.method !== undefined && parsed.data.method !== prevRow.method) {
      diffs.push({ field: "method", label: "Metoda", old: METHOD_LABELS[prevRow.method ?? ""] ?? prevRow.method, nu: METHOD_LABELS[parsed.data.method ?? ""] ?? parsed.data.method });
    }
    if (parsed.data.reference !== undefined && (parsed.data.reference ?? null) !== (prevRow.reference ?? null)) {
      diffs.push({ field: "reference", label: "Referenca", old: prevRow.reference ?? null, nu: parsed.data.reference ?? null });
    }
    if (parsed.data.notes !== undefined && cancelNoteAppend === null && (parsed.data.notes ?? null) !== (prevRow.notes ?? null)) {
      diffs.push({ field: "notes", label: "Shënime", old: prevRow.notes ?? null, nu: parsed.data.notes ?? null });
    }
    if (patchPayerType !== undefined && patchPayerType !== (prevRow as any).payerType) {
      diffs.push({ field: "payerType", label: "Lloji i paguesit", old: (prevRow as any).payerType ?? null, nu: patchPayerType ?? null });
    }
    for (const d of diffs) {
      void logPaymentChange(req, { paymentId: payment.id, action: "updated", fieldName: d.label, oldValue: d.old, newValue: d.nu });
    }
  }

  scheduleExcelSync();
  scheduleGSheetsSync();
  res.json(formatPayment(payment));

  // When a payment is confirmed in the ledger, re-send the invoice (now stamped
  // as confirmed) to the agent + admin. Only on a genuine false -> true
  // transition (idempotent), not on un-confirm or repeated confirm.
  // A mass payment is ONE invoice for the whole batch, so we never re-send a
  // per-ticket invoice for a batch member — that would emit one email per ticket.
  if (isLedgerMutation && parsed.data.confirmed === true && !wasConfirmed && !payment.isRefund && !payment.batchId) {
    sendPaymentInvoice(payment.id, { confirmed: true }).catch(() => {});
  }
});

// GET /payments/:id/history — historiku i plotë i një pagese (krijim/ndryshim/anulim/konfirmim…)
router.get("/payments/:id/history", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID e pavlefshme" });
    return;
  }
  const rows = await db.select().from(paymentChangeLogsTable)
    .where(eq(paymentChangeLogsTable.paymentId, id))
    .orderBy(sql`${paymentChangeLogsTable.createdAt} DESC`);
  const out = rows.map(r => ({
    id: r.id,
    action: r.action,
    fieldName: r.fieldName,
    oldValue: r.oldValue,
    newValue: r.newValue,
    note: r.note,
    userName: r.userName,
    userRole: r.userRole,
    createdAt: r.createdAt.toISOString(),
  }));
  // Pagesat e vjetra (para se të fillonte historiku) s'kanë log "created"/"confirmed".
  // Plotësojmë nga vetë rreshti i pagesës që historiku të tregojë GJITHMONË krijimin
  // (data+ora fikse) dhe gjendjen e konfirmimit.
  const [pay] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (pay) {
    if (!rows.some(r => r.action === "created")) {
      out.push({
        id: -1,
        action: "created",
        fieldName: null,
        oldValue: null,
        newValue: null,
        note: `Pagesa u krijua — €${pay.amount} (${pay.method})${pay.invoiceCode ? ` · ${pay.invoiceCode}` : ""}`,
        userName: null,
        userRole: null,
        createdAt: pay.createdAt.toISOString(),
      } as any);
    }
    if (pay.confirmed && !rows.some(r => r.action === "confirmed")) {
      out.unshift({
        id: -2,
        action: "confirmed",
        fieldName: null,
        oldValue: null,
        newValue: null,
        note: "Pagesa është e konfirmuar (konfirmim i vjetër — ora e saktë dhe personi s'u regjistruan në atë kohë)",
        userName: null,
        userRole: null,
        createdAt: pay.createdAt.toISOString(),
      } as any);
    }
  }
  res.json(out);
});

router.patch("/payments/:id/refund", async (req, res): Promise<void> => {
  const params = RefundPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = RefundPaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  let original: typeof paymentsTable.$inferSelect | undefined;
  let refund: typeof paymentsTable.$inferSelect | undefined;
  try {
    await db.transaction(async tx => {
      [original] = await tx.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
      if (!original) return;

      const locked: any = await tx.execute(sql`
        SELECT status FROM bookings WHERE id = ${original.bookingId} FOR UPDATE
      `);
      const booking = (locked.rows ?? locked)?.[0];
      if (booking?.status === "cancelled") throw new Error(CANCELLED_BOOKING_PAYMENT_ERROR);

      [refund] = await tx.insert(paymentsTable).values({
        bookingId: original.bookingId,
        amount: String(roundWholeEuro(Number(body.data.amount))),
        method: original.method,
        status: "completed",
        notes: body.data.reason ?? "Refund",
        isRefund: true,
      }).returning();

      await recalcBookingPayments(original.bookingId, tx);
    });
  } catch (error) {
    if (isCancelledBookingPaymentError(error)) {
      res.status(409).json({ error: CANCELLED_BOOKING_PAYMENT_ERROR });
      return;
    }
    throw error;
  }

  if (!original) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (!refund) {
    res.status(500).json({ error: "Refund payment could not be created" });
    return;
  }

  void logPaymentChange(req, {
    paymentId: refund.id,
    action: "refund_created",
    newValue: `Rimbursim €${formatWholeEuro(body.data.amount)} · ${METHOD_LABELS[original.method ?? "cash"] ?? original.method}`,
    note: body.data.reason ?? null,
  });
  void logPaymentChange(req, {
    paymentId: original.id,
    action: "refunded",
    newValue: `U krijua rimbursim €${formatWholeEuro(body.data.amount)} për këtë pagesë`,
    note: body.data.reason ?? null,
  });

  logBookingChange({
    bookingId: original.bookingId,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "payment_refund",
    fieldName: "Rimbursim",
    newValue: `€${formatWholeEuro(body.data.amount)} (${METHOD_LABELS[original.method ?? "cash"] ?? original.method})`,
    note: body.data.reason ?? null,
  }).catch(() => {});

  scheduleExcelSync();
  scheduleGSheetsSync();
  res.json(formatPayment(refund));
});

export default router;
