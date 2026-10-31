import assert from "node:assert/strict";
import { advancePriceRetry, readPriceRetry } from "../src/lib/stalePriceRetry.ts";

const identity = "flight-a";
const interval = 7;
const step = interval * 60_000;
let retry = null;
for (let attempt = 1; attempt <= 5; attempt++) {
  const now = attempt * step;
  retry = advancePriceRetry(retry, identity, now, interval, false);
  assert.equal(retry.misses, attempt);
  // Simulate restart: persisted state, not a process-local counter.
  retry = readPriceRetry(JSON.stringify(retry), identity);
  assert.equal(advancePriceRetry(retry, identity, now + 1, interval, false), retry);
}
assert.equal(advancePriceRetry(retry, identity, 8 * step, interval, false).misses, 5);
assert.equal(advancePriceRetry(retry, identity, 8 * step, interval, false).checkedAt, 8 * step,
  "retry cadence remains active after five missing fares");
assert.equal(advancePriceRetry(retry, identity, 8 * step, interval, true), null);
assert.equal(readPriceRetry(JSON.stringify(retry), "edited-flight"), null);
assert.equal(readPriceRetry("malformed", identity), null);
assert.equal(readPriceRetry(JSON.stringify({ ...retry, misses: -1 }), identity), null);
assert.equal(readPriceRetry(JSON.stringify({ ...retry, misses: 6 }), identity), null);
assert.equal(advancePriceRetry(null, identity, 1, 5, false).misses, 1);
const first = advancePriceRetry(null, identity, 1, 5, false);
assert.equal(advancePriceRetry(first, identity, 2, 5, true), null);
assert.equal(advancePriceRetry(first, identity, 120001, 2, false).misses, 2);
console.log("Stale-price retries: interval, five misses, recovery, restart and identity checks OK");
