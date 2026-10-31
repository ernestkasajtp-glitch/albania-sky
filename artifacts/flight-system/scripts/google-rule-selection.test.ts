import assert from "node:assert/strict";
import { groupRuleFlights, setRuleFlightSelected } from "../src/lib/google-rule-selection.ts";

const flights = [
  { id: 1, fromCity: "tia", toCity: "ber", airline: "WIZZ AIR", flightNumber: "W4 5147" },
  { id: 2, fromCity: "TIA", toCity: "BER", airline: "Wizz Air", flightNumber: "W45147" },
  { id: 3, fromCity: "TIA", toCity: "BER", airline: "WIZZ AIR", flightNumber: "W45105" },
];
const groups = groupRuleFlights(flights);
assert.equal(groups.length, 2);
const group = groups.find(g => g.flightNumber === "W45147")!;
// Partially selected legacy type is visible in selected, not available.
assert.equal(group.ids.some(id => [1].includes(id)), true);
assert.deepEqual(setRuleFlightSelected([1, 3], group.ids, false), [3]);
assert.deepEqual(setRuleFlightSelected([1, 2, 3], group.ids, false), [3]);
assert.deepEqual(setRuleFlightSelected([3], group.ids, true), [3, 1, 2]);
assert.deepEqual(setRuleFlightSelected([3, 1, 2], group.ids, true), [3, 1, 2]);
console.log("Rule selection: historical/partial removal, exact identity and deduplication passed");
