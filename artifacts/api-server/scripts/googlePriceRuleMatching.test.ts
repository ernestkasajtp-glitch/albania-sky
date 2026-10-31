import assert from "node:assert/strict";
import { noGoogleRuleFlightIds } from "../src/lib/noGoogleRuleFlights.js";
import type { GooglePriceRule } from "@workspace/db";
import {
  googleRuleMatchesFlight,
  type ResolvedGooglePriceRule,
} from "../src/lib/googlePriceRules.js";

const baseRule: GooglePriceRule = {
  id: 1,
  name: "TIA-PSA",
  active: true,
  discountType: "percent",
  tiers: [],
  minPrice: null,
  roundToFive: true,
  applyOffline: false,
  applyInternal: true,
  offlineTiers: [],
  offlineDiscountType: "percent",
  offlineRoundToFive: true,
  applyAllFlights: false,
  flightIds: [10],
  fromCity: "TIA",
  toCity: "PSA",
  airline: null,
  departureFrom: null,
  departureTo: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const resolvedRule: ResolvedGooglePriceRule = {
  ...baseRule,
  selectedFlightKeys: ["TIA|PSA|W45065"],
};

assert.equal(
  googleRuleMatchesFlight(resolvedRule, {
    id: 999,
    fromCity: "tia",
    toCity: "psa",
    airline: "Wizz Air",
    flightNumber: "W4 5065",
    departureDate: "2026-10-01",
  }),
  true,
  "a newly created flight with the same route and normalized flight number must inherit the rule",
);

assert.equal(
  googleRuleMatchesFlight(resolvedRule, {
    id: 999,
    fromCity: "TIA",
    toCity: "PSA",
    airline: "Wizz Air",
    flightNumber: "W45066",
    departureDate: "2026-10-01",
  }),
  false,
  "a different flight number must not inherit the rule",
);

assert.equal(
  googleRuleMatchesFlight(resolvedRule, {
    id: 999,
    fromCity: "TIA",
    toCity: "MXP",
    airline: "Wizz Air",
    flightNumber: "W45065",
    departureDate: "2026-10-01",
  }),
  false,
  "the same flight number on a different route must not inherit the rule",
);

assert.equal(
  googleRuleMatchesFlight(
    { ...resolvedRule, departureTo: "2026-09-30" },
    {
      id: 999,
      fromCity: "TIA",
      toCity: "PSA",
      airline: "Wizz Air",
      flightNumber: "W45065",
      departureDate: "2026-10-01",
    },
  ),
  false,
  "date filters must still apply to inherited flights",
);

const candidates = [
  { id: 999, fromCity: "tia", toCity: "psa", airline: "Wizz Air", flightNumber: "W4 5065", departureDate: "2026-10-01" },
  { id: 1000, fromCity: "TIA", toCity: "PSA", airline: "Wizz Air", flightNumber: "W45066", departureDate: "2026-10-02" },
  { id: 1001, fromCity: "TIA", toCity: "MXP", airline: "Wizz Air", flightNumber: "W45065", departureDate: "2026-10-03" },
];
assert.deepEqual(noGoogleRuleFlightIds(candidates, []), [999, 1000, 1001], "no active rules means all candidates lack a rule");
assert.deepEqual(noGoogleRuleFlightIds(candidates, [resolvedRule]), [1000, 1001], "recurring identity counts as assigned without requiring a cached price/tier");
assert.deepEqual(noGoogleRuleFlightIds(candidates, [{ ...resolvedRule, active: false }]), [999, 1000, 1001], "inactive rules do not cover flights");
assert.deepEqual(noGoogleRuleFlightIds(candidates, [{ ...resolvedRule, applyAllFlights: true }]), [1001], "all-flights rule still respects its route");
assert.deepEqual(noGoogleRuleFlightIds(candidates, [{ ...resolvedRule, applyAllFlights: true, fromCity: null, toCity: null }]), [], "a global rule covers all candidates");
assert.deepEqual(noGoogleRuleFlightIds(candidates, [{ ...resolvedRule, departureTo: "2026-09-30" }]), [999, 1000, 1001], "expired rule scope leaves flights uncovered");
assert.deepEqual(noGoogleRuleFlightIds(candidates, [{ ...resolvedRule, applyAllFlights: true, departureFrom: "2026-10-02" }]), [999, 1001], "departure boundaries are respected");
assert.deepEqual(noGoogleRuleFlightIds(candidates, [{ ...resolvedRule, applyAllFlights: true, airline: "Ryanair" }]), [999, 1000, 1001], "airline scope is respected");
assert.deepEqual(noGoogleRuleFlightIds([{ ...candidates[1], id: 10 }], [{ ...resolvedRule, selectedFlightKeys: [] }]), [], "explicitly selected flight IDs are covered");

const withExclusions = candidates.map(flight => ({
  ...flight, excludeFromGoogleRule: flight.id === 1000,
}));
assert.deepEqual(noGoogleRuleFlightIds(withExclusions, []), [999, 1001], "excluded flights never appear even with no rules");
assert.deepEqual(noGoogleRuleFlightIds(withExclusions, [resolvedRule]), [1001], "excluded unmatched flights stay outside the list");
assert.deepEqual(noGoogleRuleFlightIds(withExclusions, [{ ...resolvedRule, active: false }]), [999, 1001], "inactive rules cannot bring excluded flights into the list");
assert.deepEqual(noGoogleRuleFlightIds(withExclusions.map(flight => ({ ...flight, excludeFromGoogleRule: true })), []), [], "only excluded flights means an empty hidden tab");
assert.deepEqual(noGoogleRuleFlightIds(withExclusions.map(flight => ({ ...flight, excludeFromGoogleRule: false })), []), [999, 1000, 1001], "removing an exclusion restores normal assignment checks");

console.log("google price rule matching and unassigned-flight filter tests passed");