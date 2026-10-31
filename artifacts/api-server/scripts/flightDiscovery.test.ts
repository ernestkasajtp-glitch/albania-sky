import assert from "node:assert/strict";
import {
  DEFAULT_FLIGHT_DISCOVERY_CONFIG,
  FLIGHT_DISCOVERY_MAX_DAYS,
  dateRangeDays,
  flightDiscoveryKey,
  isCalendarDate,
  isDiscoveryAirportCode,
  isDiscoveryWizzFlight,
  parseDiscoveryConfig,
} from "../src/lib/flightDiscoveryUtils.js";

for (const flightNumber of ["W6 4722", "W4 5010", "W9 4401", "5W7001"]) {
  assert.equal(isDiscoveryWizzFlight({ flightNumber }), true);
}
assert.equal(isDiscoveryWizzFlight({ flightNumber: "WZZ123", airline: "Wizz Air Malta" }), true);
assert.equal(isDiscoveryWizzFlight({ flightNumber: "FR123", airline: "Ryanair" }), false);
assert.equal(isDiscoveryWizzFlight({ flightNumber: "LH123" }), false);

assert.equal(
  flightDiscoveryKey({
    fromCity: " tia ",
    toCity: "BGY",
    departureDate: "2027-02-03",
    flightNumber: " w6 4722 ",
  }),
  "TIA|BGY|2027-02-03|W64722",
);

assert.equal(isCalendarDate("2027-02-28"), true);
assert.equal(isCalendarDate("2027-02-29"), false);
assert.equal(isDiscoveryAirportCode("TIA"), true);
assert.equal(isDiscoveryAirportCode("TIAA"), false);
assert.equal(dateRangeDays("2027-01-01", "2027-01-31"), FLIGHT_DISCOVERY_MAX_DAYS);
assert.equal(dateRangeDays("2027-01-31", "2027-01-01"), 0);

assert.deepEqual(
  parseDiscoveryConfig(JSON.stringify({
    enabled: true,
    intervalMinutes: 10,
    days: 99,
    fromCity: " tia ",
    toCity: "bgy",
  }), "2027-01-01"),
  {
    revision: 0,
    routes: [{
      enabled: true,
      intervalMinutes: 1440,
      startDate: "2027-01-01",
      endDate: "2027-01-31",
      fromCity: "TIA",
      toCity: "BGY",
    }],
  },
);

assert.deepEqual(parseDiscoveryConfig("not-json"), DEFAULT_FLIGHT_DISCOVERY_CONFIG);
assert.deepEqual(
  parseDiscoveryConfig(JSON.stringify({
    revision: 7,
    routes: [
      {
        enabled: true,
        intervalMinutes: 30,
        startDate: "2027-01-01",
        endDate: "2027-01-03",
        fromCity: " tia ",
        toCity: "bgy",
      },
      {
        enabled: false,
        intervalMinutes: 60,
        startDate: "2027-01-01",
        endDate: "2027-01-03",
        fromCity: "TIA",
        toCity: "BGY",
      },
    ],
  })),
  {
    revision: 7,
    routes: [{
      enabled: true,
      intervalMinutes: 30,
      startDate: "2027-01-01",
      endDate: "2027-01-03",
      fromCity: "TIA",
      toCity: "BGY",
    }],
  },
);
assert.deepEqual(
  parseDiscoveryConfig(JSON.stringify({
    enabled: false,
    intervalMinutes: 30,
    days: 3,
    fromCity: "tia",
    toCity: "bgy",
  }), "2027-01-01"),
  {
    revision: 0,
    routes: [{
      enabled: false,
      intervalMinutes: 30,
      startDate: "2027-01-01",
      endDate: "2027-01-03",
      fromCity: "TIA",
      toCity: "BGY",
    }],
  },
);
console.log("flightDiscovery tests: OK");
