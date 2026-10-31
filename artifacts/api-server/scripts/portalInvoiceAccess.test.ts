import { test } from "node:test";
import assert from "node:assert/strict";
import { eligiblePortalInvoices, ownsInvoiceBooking, PortalInvoiceNotFound, type InvoicePayment, type InvoiceRepository } from "../src/lib/portalInvoiceAccess.ts";

const user = { id: 10, agentId: 20 };
const booking = { id: 100, agentId: 20, bookingUserId: 11 };
const payment: InvoicePayment = { id: 1, bookingId: 100, amount: "200", status: "completed", isRefund: false, invoiceCode: "INV-001", batchId: null, createdAt: "2026-10-09T08:00:00Z" };
function repository(payments: InvoicePayment[] = [payment], overrides: Partial<InvoiceRepository> = {}): InvoiceRepository {
  return { booking: async () => booking, payments: async () => payments, batch: async () => [], ...overrides };
}
test("ownership: agency, personal booking; no cross-agency, email or creator bypass", () => {
  assert.equal(ownsInvoiceBooking(user, booking), true);
  assert.equal(ownsInvoiceBooking({ id: 11, agentId: 21 }, booking), false);
  assert.equal(ownsInvoiceBooking({ id: 10, agentId: null }, booking), false);
  assert.equal(ownsInvoiceBooking(user, { ...booking, agentId: null, bookingUserId: 10 }), true);
  assert.equal(ownsInvoiceBooking(user, { ...booking, agentId: null }), false);
});
test("missing/foreign booking fails closed without querying payments", async () => {
  for (const found of [undefined, { ...booking, agentId: 999 }]) {
    await assert.rejects(() => eligiblePortalInvoices(user, "OTHER", repository([], {
      booking: async () => found,
      payments: async () => { assert.fail("must not read private payments"); },
    })), PortalInvoiceNotFound);
  }
});
test("only completed positive payments with invoice codes; newest first", async () => {
  const rows = [
    payment,
    { ...payment, id: 2, invoiceCode: "INV-002", createdAt: "2026-10-10T08:00:00Z" },
    { ...payment, id: 3, status: "pending" },
    { ...payment, id: 4, status: "cancelled" },
    { ...payment, id: 5, isRefund: true },
    { ...payment, id: 6, invoiceCode: null },
    { ...payment, id: 7, invoiceCode: "  " },
    { ...payment, id: 8, amount: 0 },
    { ...payment, id: 9, amount: -100 },
  ];
  assert.deepEqual((await eligiblePortalInvoices(user, "OWN", repository(rows))).map(i => i.paymentId), [2, 1]);
  assert.deepEqual(await eligiblePortalInvoices(user, "OWN", repository([])), []);
});
test("batch gets one invoice, canonical first code and member payment ID", async () => {
  const p2 = { ...payment, id: 2, batchId: "batch", invoiceCode: "INV-SECOND" };
  const p3 = { ...p2, id: 3 };
  const result = await eligiblePortalInvoices(user, "OWN", repository([p2, p3], {
    batch: async () => [
      { payment: p3, booking },
      { payment: { ...payment, batchId: "batch", bookingId: 101 }, booking: { ...booking, id: 101 } },
      { payment: p2, booking },
    ],
  }));
  assert.equal(result.length, 1);
  assert.equal(result[0].invoiceCode, "INV-001");
  assert.equal(result[0].paymentId, 2);
  assert.equal(result[0].kind, "batch");
});
test("batch including any foreign/missing booking or cancelled/refunded payment is withheld", async () => {
  const batchPayment = { ...payment, batchId: "batch" };
  const unsafe = [
    { payment: { ...batchPayment, id: 2 }, booking: { ...booking, agentId: 999 } },
    { payment: { ...batchPayment, id: 2 }, booking: null },
    { payment: { ...batchPayment, id: 2, status: "cancelled" }, booking },
    { payment: { ...batchPayment, id: 2, isRefund: true }, booking },
  ];
  for (const member of unsafe) {
    assert.deepEqual(await eligiblePortalInvoices(user, "OWN", repository([batchPayment], {
      batch: async () => [{ payment: batchPayment, booking }, member],
    })), []);
  }
});
test("empty or stale batch membership never grants download", async () => {
  const batchPayment = { ...payment, batchId: "batch" };
  for (const members of [[], [{ payment: { ...batchPayment, id: 999 }, booking }]]) {
    assert.deepEqual(await eligiblePortalInvoices(user, "OWN", repository([batchPayment], { batch: async () => members })), []);
  }
});
