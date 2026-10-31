import assert from "node:assert/strict";
import { normalizeBookingStatusHistory } from "../../flight-system/src/lib/bookingStatusHistory.js";

const history = normalizeBookingStatusHistory([
  { id: 1, action: "created", oldValue: null, newValue: null, note: null, userName: "Import", createdAt: "2026-01-01T10:00:00Z" },
  { id: 2, action: "status_changed", oldValue: "Konfirmuar", newValue: "Ticketed", note: null, userName: "A", createdAt: "2026-01-01T11:00:00Z" },
  { id: 3, action: "status_changed", oldValue: "Ticketed", newValue: "Konfirmuar", note: null, userName: "B", createdAt: "2026-01-01T12:00:00Z" },
  { id: 4, action: "status_changed", oldValue: "Konfirmuar", newValue: "Konfirmuar", note: null, userName: "C", createdAt: "2026-01-01T13:00:00Z" },
], 9, "2026-01-01T10:00:00Z");

assert.deepEqual(history.map(event => event.statusKey), ["confirmed", "ticketed", "confirmed", "confirmed"]);
assert.deepEqual(history.map(event => event.id), [1, 2, 3, 4]);
assert.equal(history[0].statusLabel, "Confirmed");

const explicitCreation = normalizeBookingStatusHistory([
  { id: 10, action: "created", oldValue: null, newValue: "cancelled", note: null, userName: "Webhook", createdAt: "2026-01-02T10:00:00Z" },
], 10);
assert.equal(explicitCreation[0].statusKey, "cancelled");

const unknownCreation = normalizeBookingStatusHistory([], 11, "2026-01-03T10:00:00Z");
assert.equal(unknownCreation[0].statusKey, null);
assert.equal(unknownCreation[0].statusLabel, "Status fillestar i panjohur");

console.log("bookingStatusHistory tests: OK");