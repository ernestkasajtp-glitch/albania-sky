import assert from "node:assert/strict";
import { applyFlightDiscount, parseFlightDiscount, discountForChannel, DISCOUNT_CHANNELS } from "../src/lib/flightDiscountMath";
assert.equal(applyFlightDiscount(186, { type: "percent", value: 10 }), 167);
assert.equal(applyFlightDiscount(186, { type: "fixed", value: 30 }), 156);
assert.equal(applyFlightDiscount(15, { type: "fixed", value: 30 }), 0);
assert.equal(applyFlightDiscount(15, { type: "percent", value: 100 }), 0);
assert.equal(applyFlightDiscount(15, { type: "percent", value: 10 }), 14);
assert.equal(applyFlightDiscount(186, null), 186);
// Tax and baggage are added after discounted ticket snapshots.
assert.equal(applyFlightDiscount(186, { type: "percent", value: 10 }) + 60 + 5, 232);
for (const input of [{type:"percent",value:101},{type:"fixed",value:0},{type:"fixed",value:-1},
  {type:"fixed",value:Infinity},{type:"percent",value:"10"},{type:"bad",value:10},undefined]) {
  assert.throws(() => parseFlightDiscount(input));
}
assert.equal(parseFlightDiscount(null), null);
assert.deepEqual(parseFlightDiscount({type:"fixed",value:10}), {type:"fixed",value:10});
for (let mask = 1; mask < 16; mask++) {
  const channels = DISCOUNT_CHANNELS.filter((_, i) => mask & (1 << i));
  const d = parseFlightDiscount({ type: "percent", value: 10, channels }, true)!;
  for (const channel of DISCOUNT_CHANNELS)
    assert.equal(applyFlightDiscount(186, discountForChannel(d, channel)), channels.includes(channel) ? 167 : 186);
}
for (const channels of [[], ["invalid"], "api", null, undefined]) {
  assert.throws(() => parseFlightDiscount({ type: "fixed", value: 10, channels }, true));
}
const legacy = parseFlightDiscount({ type: "fixed", value: 10 });
assert.equal(discountForChannel(legacy, "api"), null);
assert.equal(discountForChannel(legacy, "offline"), null);
assert.ok(discountForChannel(legacy, "public"));
assert.ok(discountForChannel(legacy, "agents"));
console.log("PASS flight discount: final-price order, clamp, infants, whole euros, tax/extras exclusion, removal, invalid inputs");
