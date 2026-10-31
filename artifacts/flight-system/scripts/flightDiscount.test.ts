import assert from "node:assert/strict";
import { DEFAULT_FLIGHT_DISCOUNT_CHANNELS } from "../src/lib/flightDiscount.ts";
import { applyFlightDiscount, getFlightDiscount, validateFlightDiscount, validateFlightDiscountChannels, parseFlightDiscountChannels, hasInvalidFlightDiscountChannels, bookingDiscountChannel, flightDiscountChannelsLabel, FLIGHT_DISCOUNT_CHANNEL_LABELS } from "../src/lib/flightDiscount.ts";

const pct = { type: "percent" as const, value: 10 };
const fix = { type: "fixed" as const, value: 15 };
// Editor defaults select all channels for a new discount, not for saved discounts.
assert.deepEqual(DEFAULT_FLIGHT_DISCOUNT_CHANNELS, ["offline", "api", "agents", "public"]);
assert.deepEqual(getFlightDiscount({})?.channels ?? [...DEFAULT_FLIGHT_DISCOUNT_CHANNELS], ["offline", "api", "agents", "public"]);
assert.deepEqual(getFlightDiscount({ flightDiscount: { type: "fixed", value: 5, channels: ["api"] } })?.channels ?? [...DEFAULT_FLIGHT_DISCOUNT_CHANNELS], ["api"]);
assert.deepEqual(getFlightDiscount({ flightDiscount: { type: "fixed", value: 5 } })?.channels ?? [...DEFAULT_FLIGHT_DISCOUNT_CHANNELS], ["agents", "public"]);
assert.equal(applyFlightDiscount(100, null), 100);
assert.equal(applyFlightDiscount(100, pct), 90);
assert.equal(applyFlightDiscount(87, pct), 78);       // 78.3 -> whole euro
assert.equal(applyFlightDiscount(85, pct), 77);       // 76.5 -> round half up
assert.equal(applyFlightDiscount(35, fix), 20);       // infant included
assert.equal(applyFlightDiscount(10, fix), 0);        // floor 0
assert.equal(applyFlightDiscount(50, { type: "percent", value: 100 }), 0);
// override applied once: raw override submitted, discount only in preview
const override = 120;
assert.equal(applyFlightDiscount(override, pct), 108);
assert.equal(getFlightDiscount({ flightDiscount: null }), null);
assert.equal(getFlightDiscount({}), null);
assert.deepEqual(getFlightDiscount({ flightDiscount: { type: "fixed", value: 5 } }), { type: "fixed", value: 5, channels: ["agents", "public"] });
// legacy (no channels) -> agents + public only
const legacy = { flightDiscount: { type: "percent", value: 10 } };
assert.ok(getFlightDiscount(legacy, "agents"));
assert.ok(getFlightDiscount(legacy, "public"));
assert.equal(getFlightDiscount(legacy, "api"), null);
assert.equal(getFlightDiscount(legacy, "offline"), null);
// API-only never reaches internal bookings
const apiOnly = { flightDiscount: { type: "percent", value: 10, channels: ["api"] } };
assert.equal(getFlightDiscount(apiOnly, "agents"), null);
assert.equal(getFlightDiscount(apiOnly, "public"), null);
assert.ok(getFlightDiscount(apiOnly, "api"));
// channel selection from agency
assert.equal(bookingDiscountChannel({ id: 3 }), "agents");
assert.equal(bookingDiscountChannel(null), "public");
assert.equal(bookingDiscountChannel(undefined), "public");
const publicOnly = { flightDiscount: { type: "fixed", value: 20, channels: ["public"] } };
assert.equal(applyFlightDiscount(100, getFlightDiscount(publicOnly, bookingDiscountChannel(null))), 80);
assert.equal(applyFlightDiscount(100, getFlightDiscount(publicOnly, bookingDiscountChannel({ id: 1 }))), 100);
// fail closed: only missing channels is legacy
for (const bad of [null, [], ["bogus"], ["api", "bogus"], "api", { 0: "api" }, [1], ["api", "api"]]) {
  assert.equal(parseFlightDiscountChannels(bad), null, JSON.stringify(bad));
  const f = { flightDiscount: { type: "percent", value: 10, channels: bad } };
  assert.equal(getFlightDiscount(f), null);
  assert.equal(getFlightDiscount(f, "public"), null);
  assert.equal(getFlightDiscount(f, "agents"), null);
  assert.equal(hasInvalidFlightDiscountChannels(f), true);
}
assert.deepEqual(parseFlightDiscountChannels(undefined), ["agents", "public"]);
assert.equal(hasInvalidFlightDiscountChannels(legacy), false);
assert.equal(hasInvalidFlightDiscountChannels({ flightDiscount: null }), false);
assert.equal(validateFlightDiscountChannels([]), "Zgjidh të paktën një kanal");
assert.equal(validateFlightDiscountChannels(["public"]), null);
assert.equal(FLIGHT_DISCOUNT_CHANNEL_LABELS.public, "PUBLIC");
assert.equal(flightDiscountChannelsLabel(["public", "offline", "agents", "api"]), "OFFLINE · API · TË GJITHË AGJENTËT · PUBLIC");
assert.equal(getFlightDiscount({ flightDiscount: { type: "percent", value: 0 } }), null);
assert.equal(validateFlightDiscount("percent", "101") !== null, true);
assert.equal(validateFlightDiscount("percent", "100"), null);
assert.equal(validateFlightDiscount("fixed", "-1") !== null, true);
assert.equal(validateFlightDiscount("fixed", ""), "Vlera duhet të jetë numër pozitiv");
assert.equal(validateFlightDiscount("fixed", "Infinity") !== null, true);
console.log("Flight discount math tests: OK");
