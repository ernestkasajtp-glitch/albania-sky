import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, flightsTable } from "@workspace/db";
import { bookingEngineVisibilityConds, type FlightVisibility } from "../src/lib/flightVisibility.js";

const routeRule = (fromAirport: string | null, toAirport: string | null) => ({
  flightId: null,
  fromAirport,
  toAirport,
  dateFrom: "2027-01-01",
  dateTo: "2027-12-31",
});

function whereFor(rules: FlightVisibility["rules"], seesHiddenFlights = false) {
  return db.select({ id: flightsTable.id }).from(flightsTable)
    .where(and(eq(flightsTable.status, "open"), ...bookingEngineVisibilityConds({ rules, seesHiddenFlights })))
    .toSQL();
}

// Guests and authenticated customers without an agency keep public visibility.
const guest = whereFor([]);
assert.match(guest.sql, /show_in_booking_engine/);
assert.equal(whereFor([], true).sql.includes("show_in_booking_engine"), false);
const denied = db.select({ id: flightsTable.id }).from(flightsTable).where(and(
  eq(flightsTable.id, 42),
  ...bookingEngineVisibilityConds({
    denied: true, grouped: false, rules: [routeRule("TIA", null)],
    seesHiddenFlights: true, groupRules: [{ airport: "TIA", direction: "either" }],
  }),
)).toSQL();
assert.match(denied.sql, /false/);
assert.equal(denied.params.length, 1, "a denied agency must not evaluate own or group rules, even on a direct flight ID");

const departureOnly = whereFor([routeRule("TIA", null)]);
assert.match(departureOnly.sql, /from_city/);
assert.equal(departureOnly.sql.includes("to_city"), false);
assert.deepEqual(departureOnly.params.slice(1), ["TIA", "2027-01-01", "2027-12-31"]);

const arrivalOnly = whereFor([routeRule(null, "MXP")]);
assert.match(arrivalOnly.sql, /to_city/);
assert.equal(arrivalOnly.sql.includes("from_city"), false);
assert.deepEqual(arrivalOnly.params.slice(1), ["MXP", "2027-01-01", "2027-12-31"]);

// Matching rules add with OR for grouped agencies; denied agencies ignore every rule.
const defaults = [routeRule("TIA", null)];
const own = [routeRule(null, "MXP")];
const combined = whereFor([...defaults, ...own]);
assert.match(combined.sql, /\bor\b/i);
assert.deepEqual(combined.params.slice(1), [
  "TIA", "2027-01-01", "2027-12-31",
  "MXP", "2027-01-01", "2027-12-31",
]);
assert.equal(combined.sql.includes("show_in_booking_engine"), false);
assert.deepEqual(whereFor(own).params, arrivalOnly.params);
assert.match(whereFor([routeRule(null, null)]).sql, /false/);

const groupOnly = db.select({ id: flightsTable.id }).from(flightsTable).where(and(
  eq(flightsTable.status, "open"),
  ...bookingEngineVisibilityConds({
    grouped: true, rules: [], seesHiddenFlights: true,
    groupRules: [{ airport: "TIA", direction: "either" }],
  }),
)).toSQL();
assert.match(groupOnly.sql, /\bor\b/i);
assert.match(groupOnly.sql, /from_city/);
assert.match(groupOnly.sql, /to_city/);
assert.deepEqual(groupOnly.params.slice(1), ["TIA", "TIA"]);
assert.equal(groupOnly.sql.includes("show_in_booking_engine"), false);
const groupedEmpty = db.select().from(flightsTable)
  .where(and(...bookingEngineVisibilityConds({ grouped: true, rules: [], groupRules: [], seesHiddenFlights: true }))).toSQL();
assert.match(groupedEmpty.sql, /false/);
const groupPlusOwn = db.select({ id: flightsTable.id }).from(flightsTable).where(and(...bookingEngineVisibilityConds({
  grouped: true, rules: own, groupRules: [{ airport: "TIA", direction: "to" }], seesHiddenFlights: true,
}))).toSQL();
assert.match(groupPlusOwn.sql, /\bor\b/i);
assert.deepEqual(groupPlusOwn.params, ["MXP", "2027-01-01", "2027-12-31", "TIA"]);
assert.equal(groupPlusOwn.sql.includes("from_city"), false);

const datedGroup = db.select({ id: flightsTable.id }).from(flightsTable).where(and(
  ...bookingEngineVisibilityConds({ grouped: true, rules: [], groupRules: [
    { airport: "TIA", direction: "either", dateFrom: "2028-05-01", dateTo: "2028-05-31" },
  ] }),
)).toSQL();
assert.match(datedGroup.sql, /departure_date/);
assert.match(datedGroup.sql, />=/);
assert.match(datedGroup.sql, /<=/);
assert.deepEqual(datedGroup.params, ["TIA", "TIA", "2028-05-01", "2028-05-31"]);
assert.equal(groupOnly.sql.includes("departure_date"), false); // Legacy unlimited window.
assert.match(db.select().from(flightsTable).where(and(...bookingEngineVisibilityConds({
  grouped: true, rules: [], groupRules: [{ airport: "TIA", direction: "either", dateFrom: "2028-05-01", dateTo: null }],
}))).toSQL().sql, /false/);

console.info("Agency default visibility predicates passed.");