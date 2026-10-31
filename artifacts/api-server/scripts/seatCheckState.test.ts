import assert from "node:assert/strict";
import { deriveSeatCheckState, seatCheckSkipReason } from "../src/lib/seatCheckState.js";

const threshold = 3;
const checkedAt = new Date("2026-09-01T10:00:00.000Z");

function observe(
  state: { status: string; seatMissCount: number },
  opts: { available: boolean; valid?: boolean; autoSoldOut?: boolean; excluded?: boolean },
) {
  return deriveSeatCheckState({
    status: state.status,
    seatMissCount: state.seatMissCount,
    available: opts.available,
    valid: opts.valid ?? true,
    autoSoldOut: opts.autoSoldOut ?? true,
    excluded: opts.excluded ?? false,
    minSeats: 5,
    threshold,
    checkedAt,
    googlePrice: null,
  });
}

// Manual + automatic checks share the stored counter and the third miss has one
// transition side effect, rather than each writer maintaining its own count.
let state = { status: "open", seatMissCount: 0 };
const manualMiss = observe(state, { available: false, autoSoldOut: false });
assert.equal(manualMiss.seatMissCount, 1);
assert.equal(manualMiss.transitionedToSoldOut, false);
state = { status: manualMiss.status, seatMissCount: manualMiss.seatMissCount };
const automaticMiss = observe(state, { available: false });
assert.equal(automaticMiss.seatMissCount, 2);
assert.equal(automaticMiss.transitionedToSoldOut, false);
state = { status: automaticMiss.status, seatMissCount: automaticMiss.seatMissCount };
const thirdMiss = observe(state, { available: false });
assert.equal(thirdMiss.seatMissCount, 3);
assert.equal(thirdMiss.status, "soldout");
assert.equal(thirdMiss.transitionedToSoldOut, true);

// Finding seats starts the consecutive sequence over, including the timestamp.
const reset = observe({ status: "open", seatMissCount: 2 }, { available: true });
assert.equal(reset.seatMissCount, 0);
assert.equal(reset.seatAlert, null);
assert.equal(reset.seatMissLastAt, null);

// Empty/error upstream results are not valid observations and must not count.
const skipped = observe({ status: "open", seatMissCount: 1 }, { available: false, valid: false });
assert.equal(skipped.seatMissCount, 1);
assert.equal(skipped.counted, false);
assert.equal(skipped.transitionedToSoldOut, false);

// Excluded flights may show 3/3, but can never be sold out by Google.
const excludedThird = observe({ status: "open", seatMissCount: 2 }, { available: false, excluded: true });
assert.equal(excludedThird.seatMissCount, 3);
assert.equal(excludedThird.status, "open");
assert.equal(excludedThird.transitionedToSoldOut, false);

// A repeated result after the third miss cannot emit another transition.
const alreadySoldOut = observe({ status: "soldout", seatMissCount: 3 }, { available: false });
assert.equal(alreadySoldOut.seatMissCount, 3);
assert.equal(alreadySoldOut.transitionedToSoldOut, false);
const cancelled = observe({ status: "cancelled", seatMissCount: 2 }, { available: false });
assert.equal(cancelled.status, "cancelled");
assert.equal(cancelled.transitionedToSoldOut, false);

const requestStartedAt = new Date("2026-09-01T10:00:00.000Z");
const snapshot = {
  fromCity: "TIA",
  toCity: "LON",
  departureDate: "2026-09-02",
  flightNumber: "W6 1234",
  windowStart: "2026-09-01",
  windowEnd: "2026-09-04",
  requestStartedAt,
};
const current = {
  fromCity: "tia",
  toCity: "lon",
  departureDate: "2026-09-02",
  flightNumber: "W61234",
  seatCheckedAt: null,
};
assert.equal(seatCheckSkipReason(current, snapshot), null);
assert.equal(
  seatCheckSkipReason({ ...current, fromCity: "SKP" }, snapshot),
  "identity_changed",
);
assert.equal(
  seatCheckSkipReason(
    { ...current, departureDate: "2026-08-31" },
    { ...snapshot, departureDate: "2026-08-31" },
  ),
  "outside_window",
);
assert.equal(
  seatCheckSkipReason(
    { ...current, departureDate: "2026-09-05" },
    { ...snapshot, departureDate: "2026-09-05" },
  ),
  "outside_window",
);
assert.equal(
  seatCheckSkipReason(
    { ...current, seatCheckedAt: new Date("2026-09-01T10:00:00.001Z") },
    snapshot,
  ),
  "stale_result",
);

console.log("seatCheckState tests: OK");