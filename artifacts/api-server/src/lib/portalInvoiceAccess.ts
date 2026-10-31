export interface InvoiceOwner {
  id: number;
  agentId: number | null;
}
export interface InvoiceBooking {
  id: number;
  agentId: number | null;
  bookingUserId: number | null;
}
export interface InvoicePayment {
  id: number;
  bookingId: number;
  amount: string | number;
  status: string;
  confirmed?: boolean;
  isRefund: boolean;
  invoiceCode: string | null;
  batchId: string | null;
  createdAt: Date | string;
}
export interface InvoiceRepository {
  booking(ref: string): Promise<InvoiceBooking | undefined>;
  payments(bookingId: number): Promise<InvoicePayment[]>;
  batch(batchId: string): Promise<Array<{ payment: InvoicePayment; booking: InvoiceBooking | null }>>;
}
export interface PortalInvoice {
  paymentId: number;
  invoiceCode: string;
  createdAt: string;
  kind: "payment" | "batch";
}
export class PortalInvoiceNotFound extends Error {}

/** An email match is not sufficient authority to download financial documents. */
export function ownsInvoiceBooking(user: InvoiceOwner, booking: InvoiceBooking): boolean {
  return booking.agentId != null
    ? user.agentId != null && booking.agentId === user.agentId
    : booking.bookingUserId === user.id;
}
export function hasPaymentInvoice(payment: InvoicePayment): boolean {
  return payment.status === "completed" && !payment.isRefund &&
    Number(payment.amount) > 0 && !!payment.invoiceCode?.trim();
}

/**
 * The same batch PDF includes every member booking. Fail closed if ANY member
 * belongs to someone else, is missing, or no longer has an eligible payment.
 */
export async function eligiblePortalInvoices(user: InvoiceOwner, ref: string, repo: InvoiceRepository) {
  const booking = await repo.booking(ref);
  if (!booking || !ownsInvoiceBooking(user, booking)) throw new PortalInvoiceNotFound();
  const payments = await repo.payments(booking.id);
  const result: Array<PortalInvoice & { batchId: string | null; confirmed: boolean }> = [];
  const seenBatches = new Set<string>();
  for (const payment of payments) {
    if (!hasPaymentInvoice(payment)) continue;
    let code = payment.invoiceCode!;
    let createdAt = payment.createdAt;
    if (payment.batchId) {
      if (seenBatches.has(payment.batchId)) continue;
      seenBatches.add(payment.batchId);
      const members = await repo.batch(payment.batchId);
      if (!members.length || !members.some(m => m.payment.id === payment.id) ||
        members.some(m => !m.booking || !ownsInvoiceBooking(user, m.booking) || !hasPaymentInvoice(m.payment))) continue;
      const first = [...members].sort((a, b) => a.payment.id - b.payment.id)[0].payment;
      code = first.invoiceCode!;
      createdAt = first.createdAt;
    }
    result.push({
      paymentId: payment.id,
      invoiceCode: code,
      createdAt: new Date(createdAt).toISOString(),
      kind: payment.batchId ? "batch" : "payment",
      batchId: payment.batchId,
      confirmed: payment.confirmed ?? false,
    });
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.paymentId - a.paymentId);
}
