import assert from "node:assert/strict";

// No connection is made: the recorder always receives an isolated transactional
// Drizzle-shaped fixture. This URL only satisfies the db module's import guard.
process.env.DATABASE_URL ||= "postgresql://USER:REPLACE_ME@127.0.0.1:1/unused";
const { recordPokPaymentFromOrder, pokGetOrder } = await import("../src/routes/public.js");
const { pokOrdersTable, bookingsTable, paymentsTable, paymentChangeLogsTable } = await import("@workspace/db");

type State = {
  booking: any;
  orders: any[];
  payments: any[];
  logs: any[];
};
function fixture(total = 100, status = "pending"): State {
  return {
    booking: { id: 1, bookingRef: "KTF1234", totalAmount: String(total), paidAmount: "0", status },
    orders: [{ id: 10, bookingId: 1, accountId: 3, providerOrderId: "o1", amount: "60", status: "superseded" }],
    payments: [], logs: [],
  };
}
function transaction(state: State): any {
  let paymentSelectCount = 0;
  const rows = (table: any) => table === pokOrdersTable ? state.orders :
    table === bookingsTable ? [state.booking] :
    table === paymentsTable ? state.payments :
    table === paymentChangeLogsTable ? state.logs : [];
  return {
    select: () => ({
      from: (table: any) => ({
        where: (_condition: any) => {
          // All fixture calls are for booking 1. The recorder's order-ID
          // lookup is resolved using the currently processed bound order.
          const result = table === pokOrdersTable ? rows(table).filter((r: any) => r.providerOrderId === currentOrderId) :
            table === paymentsTable && paymentSelectCount++ === 0
              ? state.payments.filter(p => p.reference === currentOrderId) : rows(table);
          return Object.assign(Promise.resolve(result), { limit: async () => result.slice(0, 1) });
        },
      }),
    }),
    update: (table: any) => ({
      set: (values: any) => ({
        where: (_condition: any) => {
          const targets = table === pokOrdersTable
            ? state.orders.filter(r => r.providerOrderId === currentOrderId) : rows(table);
          for (const target of targets) Object.assign(target, values);
          return Object.assign(Promise.resolve(targets), { returning: async () => targets });
        },
      }),
    }),
    insert: (table: any) => ({
      values: (value: any) => {
        if (table === paymentChangeLogsTable) {
          state.logs.push(value);
          return Promise.resolve();
        }
        if (table !== paymentsTable) throw new Error("Unexpected fixture insert");
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              if (state.payments.some(p => p.reference === value.reference)) return [];
              const payment = { id: state.payments.length + 1, ...value };
              state.payments.push(payment);
              return [{ id: payment.id }];
            },
          }),
        };
      },
    }),
  };
}
let currentOrderId = "o1";
const paid = (id = "o1", amount = 60) => ({
  id, merchantCustomReference: "KTF1234", amount, capturedAmount: amount,
  currencyCode: "EUR", isCompleted: true, isCaptured: true,
});

for (const [name, change] of [
  ["wrong amount", { amount: 61 }],
  ["wrong currency", { currencyCode: "USD" }],
  ["missing currency", { currencyCode: undefined }],
  ["missing amount", { amount: undefined }],
  ["missing completion", { isCompleted: undefined, isCaptured: undefined }],
  ["captured without confirmation", { isCompleted: false, isCaptured: false }],
  ["partial capture", { capturedAmount: 30 }],
  ["wrong provider id", { id: "wrong" }],
  ["wrong booking reference", { merchantCustomReference: "OTHER" }],
] as const) {
  const state = fixture();
  const candidate = { ...paid(), ...change };
  currentOrderId = candidate.id;
  const result = await recordPokPaymentFromOrder(candidate, 3, transaction(state));
  assert.equal(result.ok, false, name);
  assert.equal(state.payments.length, 0, name);
  assert.equal(state.booking.paidAmount, "0", name);
}

// Concurrent webhook/return attempts, serialized by the same booking lock
// supplied in production by pg_advisory_xact_lock. The real recorder performs
// both invocations; the fixture preserves the unique card-reference backstop.
const state = fixture();
currentOrderId = "o1";
let next = Promise.resolve();
const withBookingLock = (order: any) => {
  const run = next.then(() => recordPokPaymentFromOrder(order, 3, transaction(state)));
  next = run.then(() => {}, () => {});
  return run;
};
const [first, second] = await Promise.all([withBookingLock(paid()), withBookingLock(paid())]);
assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.equal(state.payments.length, 1);
assert.equal(state.logs.length, 1);
assert.equal(state.booking.paidAmount, "60");
assert.equal(state.orders[0].status, "paid");

// A second real capture beyond the remaining €40 is retained for review,
// never inserted as another booking payment.
state.orders.push({ id: 11, bookingId: 1, accountId: 4, providerOrderId: "o2", amount: "60", status: "created" });
currentOrderId = "o2";
const secondCapture = await recordPokPaymentFromOrder(paid("o2"), 4, transaction(state));
assert.equal(secondCapture.reason, "review_required");
assert.equal(state.orders[1].status, "review_required");
assert.equal(state.payments.length, 1);
assert.equal(state.booking.paidAmount, "60");

const cancelled = fixture(100, "cancelled");
currentOrderId = "o1";
assert.equal((await recordPokPaymentFromOrder(paid(), 3, transaction(cancelled))).reason, "review_required");
assert.equal(cancelled.orders[0].status, "review_required");
assert.equal(cancelled.payments.length, 0);
assert.equal(cancelled.booking.paidAmount, "0");
assert.equal(cancelled.booking.status, "cancelled");

// No network: stub the provider's 200 response with a different order ID.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ data: { sdkOrder: paid("wrong-id") } }), { status: 200 });
try {
  await assert.rejects(
    () => pokGetOrder("o1", { merchantId: "fixture", keyId: "", keySecret: "", id: 3, label: "", active: false },
      "fixture-token"),
    /POK order ID does not match/,
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log("pokRecorder transactional fixture tests: OK");