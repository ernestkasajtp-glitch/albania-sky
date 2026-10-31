import assert from "node:assert/strict";
import { priorityReference, priorityBookingLinks } from "../src/lib/priorityBookingLinks";

const alert = { source: "priority:123", cpCode: " cp123 " };
const matches = [
  { id: 10, bookingRef: "KTF0010", cpCode: "CP123" },
  { id: 11, bookingRef: "KTF0011", cpCode: "CP1234" },
  { id: 12, bookingRef: "KTF0012", cpCode: "CP123" },
];
assert.equal(priorityReference(alert), "CP123");
assert.deepEqual(priorityBookingLinks(alert, matches), [
  { id: 10, bookingRef: "KTF0010" }, { id: 12, bookingRef: "KTF0012" },
]);
assert.deepEqual(priorityBookingLinks({ ...alert, source: "sftp" }, matches), []);
assert.deepEqual(priorityBookingLinks({ ...alert, cpCode: null }, matches), []);
assert.deepEqual(priorityBookingLinks({ ...alert, cpCode: "" }, matches), []);
assert.deepEqual(priorityBookingLinks({ ...alert, cpCode: "NOTFOUND" }, matches), []);
console.log("PRIORITY booking reference tests passed");
