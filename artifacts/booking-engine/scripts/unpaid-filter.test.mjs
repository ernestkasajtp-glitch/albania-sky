import assert from "node:assert/strict";
import { test } from "node:test";
import { isUnpaidBooking } from "../src/lib/unpaidBooking.ts";

test("UNPAID includes full and partial outstanding balances in all active statuses", () => {
  for (const status of ["draft", "confirmed", "ticketed"]) {
    assert.equal(isUnpaidBooking({ status, dueAmount: 200 }), true);
    assert.equal(isUnpaidBooking({ status, dueAmount: 0.01 }), true);
    assert.equal(isUnpaidBooking({ status, dueAmount: "80" }), true);
  }
});
test("UNPAID excludes cancelled bookings even with a positive balance", () => {
  assert.equal(isUnpaidBooking({ status: "cancelled", dueAmount: 200 }), false);
});
test("UNPAID excludes paid, overpaid and unknown balances", () => {
  for (const dueAmount of [0, -20, null, undefined, "", "invalid", NaN, Infinity]) {
    assert.equal(isUnpaidBooking({ status: "confirmed", dueAmount }), false);
  }
});
test("filter is applied before pagination and does not mutate input", () => {
  const records = Array.from({ length: 65 }, (_, id) => ({
    id, status: id === 0 ? "cancelled" : "ticketed", dueAmount: id < 33 ? 15 : 0,
  }));
  const before = JSON.stringify(records);
  const filtered = records.filter(isUnpaidBooking);
  assert.equal(filtered.length, 32);
  assert.equal(filtered.slice(0, 30).length, 30);
  assert.equal(filtered.slice(30).length, 2);
  assert.equal(JSON.stringify(records), before);
});
