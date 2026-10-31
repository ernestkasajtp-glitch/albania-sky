import assert from "node:assert/strict";
import { groupInitials, matchingFlightGroups, type FlightGroup } from "../src/lib/flightGroupMatches.ts";

const groups: FlightGroup[] = [
  { id: 1, name: "ALBANIA", rules: [{ airport: "TIA", direction: "either", dateFrom: "2026-10-01", dateTo: "2026-10-31" }] },
  { id: 2, name: "EUROPE", rules: [{ airport: "mxp", direction: "to", dateFrom: null, dateTo: null }] },
  { id: 3, name: "Nisje PRN", rules: [{ airport: "PRN", direction: "from", dateFrom: null, dateTo: null }] },
];
const ids = (fromCity: string, toCity: string, departureDate: string) =>
  matchingFlightGroups({ fromCity, toCity, departureDate }, groups).map(group => group.id);

assert.deepEqual(ids(" tia ", "mxp", "2026-10-01"), [1, 2], "inclusive start, multiple groups, normalized airports");
assert.deepEqual(ids("MXP", "TIA", "2026-10-31"), [1], "inclusive end, arrival");
assert.deepEqual(ids("TIA", "MXP", "2026-11-01"), [2], "expired window, legacy unlimited");
assert.deepEqual(ids("MXP", "BER", "2026-10-15"), [], "wrong direction");
assert.deepEqual(ids("PRN", "TIA", "2026-09-30"), [3], "from direction, before date range");
assert.deepEqual(ids("TIA", "PRN", "2026-10-15"), [1], "from direction does not match arrival");
assert.deepEqual(ids("TIA", "MXP", "bad"), [], "malformed flight date does not grant a group");
assert.deepEqual(matchingFlightGroups({ fromCity: "TIA", toCity: "MXP", departureDate: "2026-10-01" }, [
  { id: 4, name: "Invalid", rules: [{ airport: "TIA", direction: "either", dateFrom: "2026-10-01", dateTo: null }] },
]), [], "malformed one-sided date fails closed");
assert.equal(groupInitials("ALBANIA"), "A");
assert.equal(groupInitials("EUROPE"), "E");
assert.equal(groupInitials("United Kingdom"), "U");
assert.equal(groupInitials("  Shqipëri  "), "S");
console.log("Flight group match tests passed");