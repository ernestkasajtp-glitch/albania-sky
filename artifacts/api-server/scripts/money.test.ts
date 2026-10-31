import assert from "node:assert/strict";
import { formatWholeEuro, roundWholeEuro, wholeEuroDue, wholeEuroOverpay } from "../src/lib/money.js";
import { canonicalBookingTotal, isApplyMode } from "./backfill-whole-euro-prices.js";

assert.equal(roundWholeEuro(132.49), 132);
assert.equal(roundWholeEuro(132.5), 133);
assert.equal(formatWholeEuro(99.99), "100");
assert.equal(wholeEuroDue(340, 339.6), 0);
assert.equal(wholeEuroDue(340, 338.4), 2);
assert.equal(wholeEuroDue(340, 341), 0);
assert.equal(wholeEuroOverpay(340.4, 340), 0);
assert.equal(wholeEuroOverpay(341.4, 340), 1);
assert.equal(isApplyMode([]), false);
assert.equal(isApplyMode(["--apply"]), false);
assert.equal(isApplyMode(["--apply", "--confirm-whole-euro"]), true);
assert.equal(canonicalBookingTotal(
  { discount: "1.4" },
  [{ type: "adult", ticketPrice: null, extraCost: "2.49" }],
  [{ amount: "3.51" }],
  { adultPrice: "100.49", childPrice: "80.49", infantPrice: "20.49", tax: "4.49" },
), 109);
const liveOldTotal = 339.6;
const liveNewTotal = canonicalBookingTotal(
  { discount: "0" },
  [{ type: "adult", ticketPrice: "169.6", extraCost: "0" }, { type: "adult", ticketPrice: "169.6", extraCost: "0" }],
  [],
  { adultPrice: "169.6", childPrice: "0", infantPrice: "0", tax: "0" },
);
assert.equal(liveNewTotal, 340);
assert.equal(roundWholeEuro(liveOldTotal), 340);
assert.equal(Math.round((358.4 - liveOldTotal) * 100) / 100, 18.8);
assert.equal(Math.round((358.4 - liveNewTotal) * 100) / 100, 18.4);
console.log("money/backfill safety tests: OK");