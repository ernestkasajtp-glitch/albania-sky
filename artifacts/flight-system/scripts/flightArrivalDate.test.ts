import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveFlightArrivalDate } from "../src/lib/flightArrivalDate.ts";

assert.equal(deriveFlightArrivalDate("2026-10-14", "10:00", "12:00"), "2026-10-14");
assert.equal(deriveFlightArrivalDate("2026-10-14", "23:00", "01:00"), "2026-10-15");
assert.equal(deriveFlightArrivalDate("2026-10-14", "10:00", "10:00"), "2026-10-14");
assert.equal(deriveFlightArrivalDate("2026-12-31", "23:59", "00:00"), "2027-01-01");
assert.equal(deriveFlightArrivalDate("2028-02-28", "23:59", "00:00"), "2028-02-29");
assert.equal(deriveFlightArrivalDate("2026-02-30", "23:59", "00:00"), null);
assert.equal(deriveFlightArrivalDate("", "23:59", "00:00"), null);
assert.equal(deriveFlightArrivalDate("2026-10-14", "2", "01:00"), null);
assert.equal(deriveFlightArrivalDate("2026-10-14", "24:00", "01:00"), null);
assert.equal(deriveFlightArrivalDate("2026-10-14", "23:00", ""), null);

// Exercise the same small form adapters used by create/edit without a DOM.
for (const path of ["../src/pages/flights.tsx", "../src/components/FlightSidePanel.tsx"]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const adapter = source.match(/function syncArrivalDate\(form: UseFormReturn<FlightForm>\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(adapter);
  const sync = new Function("form", "deriveFlightArrivalDate", adapter);
  const values = {
    departureDate: "2026-10-14", departureTime: "10:00", arrivalTime: "12:00",
    arrivalDate: "2026-10-16", adultPrice: 120, totalSeats: 20, status: "open",
  };
  const form = {
    getValues: (name: keyof typeof values) => values[name],
    setValue: (name: keyof typeof values, value: never) => { values[name] = value; },
  };
  const unrelated = { adultPrice: values.adultPrice, totalSeats: values.totalSeats, status: values.status };
  sync(form, deriveFlightArrivalDate);
  assert.equal(values.arrivalDate, "2026-10-14", "stale +2 days is removed on same-day schedule edits");
  values.departureTime = "23:00";
  sync(form, deriveFlightArrivalDate);
  assert.equal(values.arrivalDate, "2026-10-15", "clock rollover produces exactly +1 day");
  values.departureTime = "09:00";
  sync(form, deriveFlightArrivalDate);
  assert.equal(values.arrivalDate, "2026-10-14", "changing departure time recomputes both ways");
  assert.deepEqual({ adultPrice: values.adultPrice, totalSeats: values.totalSeats, status: values.status }, unrelated);
}

// Keep list and select-all on the same server filter; do not add a separate poll.
const flights = readFileSync(new URL("../src/pages/flights.tsx", import.meta.url), "utf8");
assert.equal((flights.match(/if \(scheduleErrorOnly\)\s+params\.set\("scheduleError", "true"\)/g) ?? []).length, 2);
assert.match(flights, /counts\.scheduleerror > 0 \? \["scheduleerror"\]/);
assert.match(flights, /scheduleerror: serverCounts\.scheduleerror \?\? 0/);
assert.match(flights, /f\.scheduleErrorReason/);
console.log("Flight arrival-date and schedule-error wiring tests passed");
