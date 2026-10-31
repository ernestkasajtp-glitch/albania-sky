import type { IRouter, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, bookingUsersTable, bookingsTable, paymentsTable } from "@workspace/db";
import { buildBatchInvoicePdf, buildPaymentInvoicePdf } from "../lib/invoice.js";
import { eligiblePortalInvoices, PortalInvoiceNotFound, type InvoiceRepository } from "../lib/portalInvoiceAccess.js";

const repo: InvoiceRepository = {
  async booking(ref) {
    const [booking] = await db.select({ id: bookingsTable.id, agentId: bookingsTable.agentId, bookingUserId: bookingsTable.bookingUserId })
      .from(bookingsTable).where(eq(bookingsTable.bookingRef, ref));
    return booking;
  },
  async payments(bookingId) {
    return db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, bookingId));
  },
  async batch(batchId) {
    return db.select({ payment: paymentsTable, booking: { id: bookingsTable.id, agentId: bookingsTable.agentId, bookingUserId: bookingsTable.bookingUserId } })
      .from(paymentsTable).leftJoin(bookingsTable, eq(paymentsTable.bookingId, bookingsTable.id))
      .where(eq(paymentsTable.batchId, batchId));
  },
};

export function registerPortalInvoices(router: IRouter, requireAuth: RequestHandler) {
  // Both endpoints are read-only. Never call invoice email senders here.
  const handler = (download: boolean): RequestHandler => async (req, res, next) => {
    try {
      const [user] = await db.select({ id: bookingUsersTable.id, agentId: bookingUsersTable.agentId })
        .from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
      if (!user) { res.status(401).json({ error: "User not found" }); return; }
      res.setHeader("Cache-Control", "private, no-store");
      const invoices = await eligiblePortalInvoices(user, String(req.params.ref), repo);
      if (!download) {
        res.json(invoices.map(({ batchId: _private, confirmed: _confirmed, ...invoice }) => invoice));
        return;
      }
      const rawId = String(req.params.paymentId);
      if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
        res.status(400).json({ error: "Invalid payment" }); return;
      }
      const invoice = invoices.find(i => i.paymentId === Number(rawId));
      if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
      const result = invoice.batchId
        ? await buildBatchInvoicePdf(invoice.batchId)
        : await buildPaymentInvoicePdf(invoice.paymentId, { confirmed: invoice.confirmed });
      if (!result) { res.status(404).json({ error: "Invoice not found" }); return; }
      // Same builders as the internal invoice downloads; no new PDF format.
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
      res.send(result.buffer);
    } catch (error) {
      if (error instanceof PortalInvoiceNotFound) {
        res.status(404).json({ error: "Invoice not found" }); return;
      }
      next(error);
    }
  };
  router.get("/public/my-bookings/:ref/invoices", requireAuth, handler(false));
  router.get("/public/my-bookings/:ref/invoices/:paymentId/pdf", requireAuth, handler(true));
}
