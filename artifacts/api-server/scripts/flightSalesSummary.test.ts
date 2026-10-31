import assert from "node:assert/strict";
import { formatFlightSalesSummary } from "../src/lib/flightSalesSummary.js";

assert.deepEqual(formatFlightSalesSummary(undefined), {
  salesBookingCount: 0,
  salesTotal: 0,
  salesNetTotal: null,
  salesCommissionTotal: 0,
});

assert.deepEqual(formatFlightSalesSummary({
  bookingCount: 2,
  netCount: 2,
  totalSales: "360.00",
  totalNet: "270.00",
  totalCommission: "90.00",
}), {
  salesBookingCount: 2,
  salesTotal: 360,
  salesNetTotal: 270,
  salesCommissionTotal: 90,
});

assert.deepEqual(formatFlightSalesSummary({
  bookingCount: 2,
  netCount: 1,
  totalSales: "360.00",
  totalNet: "135.00",
  totalCommission: "-15.25",
}), {
  salesBookingCount: 2,
  salesTotal: 360,
  salesNetTotal: null,
  salesCommissionTotal: -15.25,
}, "mixed known/null net prices must never be presented as a complete net total");

console.log("flightSalesSummary tests: OK");