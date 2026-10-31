import assert from "node:assert/strict";

// Importing the router also loads the existing flights route, which has
// process-local warmers. This test exercises only exported pure route guards
// and exits after assertions so those production timers cannot keep the test
// process alive.
process.env.DATABASE_URL ??= "postgresql://localhost:5432/flight_discovery_test";
const {
  dismissDiscoveryStoreCandidate,
  incompleteDiscoveryScheduleMessage,
  normalizeStore,
  requireDiscoveryAdmin,
  validateRouteList,
  validateStoredCandidate,
} = await import("../src/routes/flightDiscovery.js");

const candidate = (id: number, number: string, departureDate: string, arrivalDate: string) => ({
  id,
  flightNumber: number,
  airline: "TEST AIR",
  fromCity: "TIA",
  toCity: "BGY",
  departureDate,
  departureTime: "12:00",
  arrivalDate,
  arrivalTime: "13:30",
  googlePrice: 42,
  foundAt: "2028-01-01T00:00:00.000Z",
});

// The dedicated JSON store ignores malformed/legacy values and cannot inherit
// rows from found_flights (or mutate a shared empty-store object).
const isolated = normalizeStore(null);
isolated.candidates.push(candidate(1, "W64722", "2028-01-02", "2028-01-02"));
assert.equal(normalizeStore(null).candidates.length, 0);

// Two read/modify/write dismisses preserve both ignore keys.
const first = dismissDiscoveryStoreCandidate(
  { nextId: 3, candidates: [candidate(1, "W64722", "2028-01-02", "2028-01-02"), candidate(2, "FR123", "2028-01-03", "2028-01-03")], ignored: [] },
  1,
);
assert.ok(first);
const second = dismissDiscoveryStoreCandidate(first.store, 2);
assert.ok(second);
assert.deepEqual(second.store.ignored.sort(), ["TIA|BGY|2028-01-02|W64722", "TIA|BGY|2028-01-03|FR123"]);
assert.equal(second.store.candidates.length, 0);
assert.match(
  incompleteDiscoveryScheduleMessage(["2028-01-02"]),
  /datë të plotë mbërritjeje/,
);

// Add guards reject stale departure/arrival times, malformed route data, and
// preserve a valid overnight date supplied by Google.
assert.match(
  validateStoredCandidate(candidate(3, "W64722", "2028-01-01", "2028-01-01"), "2028-01-01 12:01") ?? "",
  /kaluarën/,
);
assert.match(
  validateStoredCandidate(
    { ...candidate(6, "FR123", "2028-01-01", "2028-01-01"), fromCity: "FCO" },
    "2028-01-01 08:00",
  ) ?? "",
  /zona kohore/,
);
assert.equal(
  validateStoredCandidate(
    { ...candidate(7, "FR123", "2028-01-02", "2028-01-02"), fromCity: "FCO" },
    "2028-01-01 23:59",
  ),
  null,
);
assert.match(
  validateStoredCandidate({ ...candidate(4, "W64722", "2028-01-02", "2028-01-03"), fromCity: "TIA", toCity: "TIA" }, "2028-01-01 00:00") ?? "",
  /rrugë/,
);
assert.equal(
  validateStoredCandidate(candidate(5, "W64722", "2028-01-02", "2028-01-03"), "2028-01-01 00:00"),
  null,
);

let forbiddenStatus = 0;
let forbiddenBody: unknown;
requireDiscoveryAdmin(
  { session: { role: "manager" } } as never,
  { status: (status: number) => ({ json: (body: unknown) => { forbiddenStatus = status; forbiddenBody = body; } }) } as never,
  (() => undefined) as never,
);
assert.equal(forbiddenStatus, 403);
assert.deepEqual(forbiddenBody, { error: "Forbidden: admin only" });

let nextCalls = 0;
requireDiscoveryAdmin(
  { session: { role: "admin" } } as never,
  {} as never,
  (() => { nextCalls++; }) as never,
);
assert.equal(nextCalls, 1);

const validRoute = {
  enabled: true,
  intervalMinutes: 15,
  startDate: "2028-01-01",
  endDate: "2028-01-31",
  fromCity: " tia ",
  toCity: "bgy",
};
// A future flight period remains valid now: its start date limits searched
// departures but must not delay the scheduler's first run.
assert.equal(
  validateRouteList([validRoute], "2027-12-01").error,
  undefined,
);
assert.deepEqual(validateRouteList([validRoute], "2028-01-01"), {
  routes: [{ ...validRoute, fromCity: "TIA", toCity: "BGY" }],
});
assert.match(
  validateRouteList([{ ...validRoute, endDate: "2028-02-01" }], "2028-01-01").error ?? "",
  /31 ditë/,
);
assert.equal(
  validateRouteList([{ ...validRoute, startDate: "2027-12-31", endDate: "2028-01-30" }], "2028-01-01").error,
  undefined,
);
// A running period can begin before today; it is still schedulable until its
// end date, while an expired period remains editable for disabling.
assert.equal(
  validateRouteList([validRoute], "2028-02-01").error,
  undefined,
);
// Disabled saved routes may be expired so administrators can see and safely
// keep them disabled until the inventory route becomes active again.
assert.equal(
  validateRouteList([{ ...validRoute, enabled: false, startDate: "2027-12-01", endDate: "2027-12-31" }], "2028-01-01").error,
  undefined,
);
assert.match(
  validateRouteList([validRoute, { ...validRoute, fromCity: "TIA", toCity: "BGY" }], "2028-01-01").error ?? "",
  /përsëritur/,
);

console.log("flightDiscovery route tests: OK");
process.exit(0);