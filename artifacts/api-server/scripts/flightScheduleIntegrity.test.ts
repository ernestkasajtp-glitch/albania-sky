import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calendarDateMs, clockSeconds, FlightScheduleValidationError, normalizeArrivalDate,
  scheduleErrorReason, scheduleFieldsTouched, upcomingScheduleErrors,
  type FlightSchedule, type ScheduleAuditRow,
} from "../src/lib/flightScheduleIntegrity.js";

const base = {
  departureDate: "2028-06-15", departureTime: "12:00",
  arrivalDate: "2028-06-15", arrivalTime: "14:00",
};
const normalize = (patch: Partial<FlightSchedule>) => normalizeArrivalDate({ ...base, ...patch });

// Same-day flights must move DOWN as well as up; never preserve stale +1/+2.
for (const arrivalDate of ["2028-06-14", "2028-06-15", "2028-06-16", "2028-06-17"]) {
  assert.equal(normalize({ arrivalDate }), "2028-06-15");
}
assert.equal(normalize({ departureTime: "23:45", arrivalTime: "01:45" }), "2028-06-16");
assert.equal(normalize({ departureTime: "23:45", arrivalTime: "01:45", arrivalDate: "2028-06-18" }), "2028-06-16");
assert.equal(normalize({ departureTime: "12:00", arrivalTime: "12:00" }), "2028-06-15");
assert.equal(normalize({ arrivalDate: undefined }), "2028-06-15");
assert.equal(normalize({ departureTime: "23:59:30", arrivalTime: "00:00:00" }), "2028-06-16");
for (const [departureDate, expected] of [
  ["2028-02-28", "2028-02-29"], ["2028-02-29", "2028-03-01"],
  ["2027-02-28", "2027-03-01"], ["2028-04-30", "2028-05-01"],
  ["2028-12-31", "2029-01-01"], ["2028-03-26", "2028-03-27"],
]) {
  assert.equal(normalize({ departureDate, departureTime: "23:45", arrivalTime: "01:45" }), expected);
}
for (const bad of ["2027-02-29", "2028-02-30", "2028-04-31", "2028-13-01", "2028-00-01", "2028-1-01", "0000-01-01", "", "garbage"]) {
  assert.equal(calendarDateMs(bad), null, bad);
  assert.throws(() => normalize({ departureDate: bad }), FlightScheduleValidationError);
  assert.throws(() => normalize({ arrivalDate: bad }), FlightScheduleValidationError);
}
for (const bad of ["24:00", "12:60", "9:00", "12:00:60", "", "garbage", "2028-06-15 12:00", "12:00 PM"]) {
  assert.equal(clockSeconds(bad), null, bad);
  assert.throws(() => normalize({ departureTime: bad }), FlightScheduleValidationError);
  assert.throws(() => normalize({ arrivalTime: bad }), FlightScheduleValidationError);
}
assert.equal(new FlightScheduleValidationError("invalid").status, 400);

// Equal clocks are same-day per the normalization rule, but a zero duration is
// still an anomaly. The read audit reports all applicable problems.
assert.equal(scheduleErrorReason(base), null);
assert.equal(scheduleErrorReason({ ...base, arrivalTime: "17:00" }), null);
assert.match(scheduleErrorReason({ ...base, arrivalTime: "17:01" })!, /mbi 5 orë/);
assert.match(scheduleErrorReason({ ...base, arrivalTime: "12:00" })!, /zero ose negative/);
assert.match(scheduleErrorReason({ ...base, arrivalDate: "2028-06-14" })!, /zero ose negative/);
assert.match(scheduleErrorReason({ ...base, arrivalDate: "2028-06-17" })!, /2028-06-15.*mbi 5 orë/);
assert.match(scheduleErrorReason({ ...base, departureTime: "23:00", arrivalTime: "01:00" })!, /2028-06-16.*zero ose negative/);
assert.equal(scheduleErrorReason({ ...base, departureTime: "23:00", arrivalTime: "01:00", arrivalDate: "2028-06-16" }), null);
assert.match(scheduleErrorReason({ ...base, arrivalTime: "25:00" })!, /Ora e mbërritjes/);
assert.match(scheduleErrorReason({ ...base, arrivalDate: "2028-02-30" })!, /Data e mbërritjes/);
assert.doesNotThrow(() => scheduleErrorReason({ ...base, departureDate: "9999-12-31", arrivalDate: "9999-12-31", departureTime: "23:00", arrivalTime: "01:00" }));

const existingBad = { ...base, arrivalDate: "2028-06-17" };
const applyPatch = (patch: Record<string, unknown>) => ({
  ...existingBad, ...patch,
  ...(scheduleFieldsTouched(patch) ? { arrivalDate: normalizeArrivalDate({ ...existingBad, ...patch }) } : {}),
});
assert.equal(applyPatch({ adultPrice: "50" }).arrivalDate, "2028-06-17", "unrelated price edits must not repair dates");
assert.equal(applyPatch({ isConfirmed: true }).arrivalDate, "2028-06-17", "confirmation-only PATCH remains unrelated");
assert.equal(applyPatch({ departureTime: "13:00" }).arrivalDate, "2028-06-15", "partial edits merge persisted fields");
assert.equal(applyPatch({ arrivalTime: "01:00", departureTime: "23:00" }).arrivalDate, "2028-06-16");
assert.equal(scheduleFieldsTouched({ arrivalDate: undefined }), false);
assert.equal(scheduleFieldsTouched({ arrivalDate: null }), true);

const row = (id: number, patch: Partial<ScheduleAuditRow> = {}): ScheduleAuditRow => ({
  ...existingBad, id, status: "open", ...patch,
});
const rows = [
  row(1), row(2, { status: "closed" }), row(3, { status: "soldout" }), row(4, { status: "cancelled" }),
  row(5, { departureDate: "2027-06-15" }), row(6, { departureTime: "09:59" }),
  row(7, { departureTime: "10:00" }), row(8, { arrivalDate: base.arrivalDate }),
  row(9, { departureDate: "broken" }), row(10, { departureTime: "broken" }),
];
const errors = upcomingScheduleErrors(rows, "2028-06-15 10:00");
assert.deepEqual([...errors.keys()], [1, 2, 7, 9, 10]);
assert.ok([...errors.values()].every(Boolean));
assert.equal(upcomingScheduleErrors([], "2028-06-15 10:00").size, 0);

// Regression guards for route wiring: filter before count/limit, use the same
// ID predicate for list + select-all, keep existing group permission resolution.
const source = readFileSync("src/routes/flights.ts", "utf8");
const list = source.slice(source.indexOf('router.get("/flights",'), source.indexOf('// ── Shënime'));
const ids = source.slice(source.indexOf('router.get("/flights/ids",'), source.indexOf('// ── Unique flight types'));
for (const route of [list, ids]) {
  assert.match(route, /resolveGroupFlightFilter/);
  assert.match(route, /readScheduleErrors\(groupFilter.condition,/);
  assert.match(route, /q.scheduleError === "true"\) conditions.push\(scheduleErrorIdsCondition\(scheduleErrors\)\)/);
  assert.match(route, /scheduleErrorWeekdayCondition\(scheduleErrors, dowNums\)/);
  assert.ok(route.indexOf("scheduleErrorIdsCondition(scheduleErrors)") < route.lastIndexOf(".where("));
}
assert.match(list, /counts.scheduleerror = scheduleErrors.size/);
assert.match(list, /scheduleErrorReason: scheduleErrors.get\(f.id\) \?\? null/);
assert.match(list, /db.select\(\{ total: count\(\) \}\).*\.where\(where\)/);
assert.match(list, /\.where\(where\).*\.limit\(limit\)\.offset\(offset\)/);
assert.match(source, /scheduleFieldsTouched\(updateData as Record<string, unknown>\)/);
const paths = [
  ['router.post("/flights",', "const arrivalDate = normalizeArrivalDate(canonicalRest)"],
  ['router.post("/flights/extend-create",', "arrivalDate: normalizeArrivalDate("],
  ['router.post("/flights/found-flights/add",', "arrivalDate: normalizeArrivalDate("],
  ['router.patch("/flights/:id/sync-schedule",', "const arrivalDate = normalizeArrivalDate("],
  ['router.post("/flights/:id/duplicate",', "const arrivalDate = normalizeArrivalDate(data)"],
];
for (const [start, call] of paths) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, start);
  const end = source.indexOf("\nrouter.", offset + start.length);
  assert.ok(source.slice(offset, end < 0 ? undefined : end).includes(call), start);
}
const importRoute = source.slice(source.indexOf('router.post("/flights/import",'), source.indexOf('router.patch("/flights/:id/toggle-sales",'));
assert.equal((importRoute.match(/arrivalDate = normalizeArrivalDate\(/g) ?? []).length, 2, "both Excel import branches");
assert.equal((importRoute.match(/error instanceof FlightScheduleValidationError/g) ?? []).length, 2, "invalid import rows surface errors");
assert.doesNotMatch(source.slice(source.indexOf("async function readScheduleErrors"), source.indexOf("async function queryFlightsGlobalTabData")), /::(?:date|time|timestamp)/);
const discovery = readFileSync("src/routes/flightDiscovery.ts", "utf8");
assert.match(discovery, /import \{ FlightScheduleValidationError, normalizeArrivalDate \} from "\.\.\/lib\/flightScheduleIntegrity.js"/);
assert.match(discovery, /const arrivalDate = normalizeArrivalDate\(/, "discovery materialization shares the same write invariant");
console.log("flightScheduleIntegrity tests: OK");
