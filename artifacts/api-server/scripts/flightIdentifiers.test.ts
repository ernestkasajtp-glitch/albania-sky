import assert from "node:assert/strict";
import {
  flightTypeIdentity,
  normalizeAirline,
  normalizeFlightIdentifierPatch,
  normalizeFlightIdentifiers,
  normalizeFlightNumber,
  splitCanonicalFlightNumber,
} from "../src/lib/flightIdentifiers.js";

assert.equal(normalizeFlightNumber(" w6  47\t22 "), "W64722");
assert.equal(normalizeAirline("  Wizz   Air\tMalta  "), "WIZZ AIR MALTA");

assert.deepEqual(
  normalizeFlightIdentifiers({
    fromCity: " tia ",
    toCity: "\tbgy",
    airline: "  Wizz   Air ",
    flightNumber: " w6 4722 ",
    untouched: 7,
  }),
  {
    fromCity: "TIA",
    toCity: "BGY",
    airline: "WIZZ AIR",
    flightNumber: "W64722",
    untouched: 7,
  },
);

assert.deepEqual(
  normalizeFlightIdentifierPatch({ airline: " air   albania ", flightNumber: " z b  1 " }),
  { airline: "AIR ALBANIA", flightNumber: "ZB1" },
);

assert.equal(
  flightTypeIdentity({ fromCity: " tia ", toCity: "bGy", flightNumber: " w6 4722 " }),
  "TIA|BGY|W64722",
);
assert.equal(
  flightTypeIdentity({ fromCity: "TIA", toCity: "BGY", flightNumber: "W64722" }),
  "TIA|BGY|W64722",
);

// CitizenPlane's established projection remains first two characters + remainder.
assert.deepEqual(splitCanonicalFlightNumber("W64722"), { airlineCode: "W6", flightNo: "4722" });
assert.deepEqual(splitCanonicalFlightNumber(" w6 4722 "), { airlineCode: "W6", flightNo: "4722" });

console.log("flightIdentifiers tests: OK");