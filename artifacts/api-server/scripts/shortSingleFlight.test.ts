import assert from "node:assert/strict";
import { shortSingleFlight } from "../src/lib/shortSingleFlight";

let calls = 0;
const read = shortSingleFlight(async () => { calls++; return { maxUid: 8 }; }, 25);
const results = await Promise.all(Array.from({ length: 20 }, () => read()));
assert.equal(calls, 1);
assert.ok(results.every(r => r.maxUid === 8));
await read();
assert.equal(calls, 1);
await new Promise(r => setTimeout(r, 35));
await read();
assert.equal(calls, 2);
let attempts = 0;
const retry = shortSingleFlight(async () => {
  if (++attempts === 1) throw new Error("upstream failed");
  return 9;
}, 100);
const failures = await Promise.allSettled([retry(), retry()]);
assert.ok(failures.every(r => r.status === "rejected"));
assert.equal(attempts, 1);
assert.equal(await retry(), 9);
console.log("PASS: single-flight, successful TTL, expiry and uncached error retry");
