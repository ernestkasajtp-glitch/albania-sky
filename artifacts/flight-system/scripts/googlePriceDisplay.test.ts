import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  normalizeGooglePrice,
  resolveGooglePriceDisplay,
  readGooglePriceLS,
  writeGooglePriceLS,
  googlePriceLsKey,
  type GooglePriceValue,
} from "../src/lib/googlePriceCache.ts";

// Current exact prices and current route alternatives retain their distinction.
assert.deepEqual(normalizeGooglePrice({ price: 180, specific: true, stale: false }),
  { price: 180, specific: true, stale: false });
assert.deepEqual(normalizeGooglePrice({ price: 125, specific: false, stale: false }),
  { price: 125, specific: false, stale: false });
assert.equal(resolveGooglePriceDisplay({ price: 180, specific: true }).unavailableLabel, null);
assert.equal(resolveGooglePriceDisplay({ price: null, stale: false }).unavailableLabel, "S’ka çmim");

// Both the new backend contract and legacy stale numeric payloads are unverified.
for (const price of [null, 180]) {
  const display = resolveGooglePriceDisplay({ price, stale: true });
  assert.equal(display.price, null);
  assert.equal(display.unavailableLabel, "S’ka çmim");
  assert.equal(normalizeGooglePrice({ price, stale: true }).price, null);
}

// React Query retains data on a failed refetch; display and derived prices must not.
for (const data of [undefined, { price: null }, { price: 180, stale: false }]) {
  const display = resolveGooglePriceDisplay(data, true);
  assert.equal(display.price, null);
  assert.equal(display.unavailableLabel, "S’ka çmim");
}
assert.equal(resolveGooglePriceDisplay({ price: Number.NaN }).price, null);

// Exercise the actual retained-data error state used by row cells and parent
// cache hydration, not just a boolean supplied by a synthetic caller.
const client = new QueryClient();
const queryKey = ["google-flight-price", "TIA", "BER", "2026-10-01", "W6 1234"];
client.setQueryData(queryKey, { price: 180, specific: true, stale: false });
await assert.rejects(client.fetchQuery({
  queryKey,
  retry: false,
  queryFn: async () => { throw new Error("Google display request failed"); },
}));
const failedState = client.getQueryState<GooglePriceValue>(queryKey)!;
assert.equal(failedState.data?.price, 180); // Query keeps the old number.
assert.equal(failedState.status, "error");
assert.equal(resolveGooglePriceDisplay(failedState.data, failedState.status === "error").price, null);
await client.fetchQuery({
  queryKey,
  queryFn: async () => normalizeGooglePrice({ price: 125, specific: false, stale: false }),
});
const recoveredState = client.getQueryState<GooglePriceValue>(queryKey)!;
assert.equal(resolveGooglePriceDisplay(recoveredState.data, recoveredState.status === "error").price, 125);
client.clear();

// Candidate prices remain independent; an unverified saved price cannot be a diff.
const candidate = 195;
const saved = resolveGooglePriceDisplay({ price: 180, stale: true }).price;
assert.equal(candidate, 195);
assert.equal(saved == null ? null : candidate - saved, null);

const entries = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  },
});
const key = googlePriceLsKey("TIA", "BER", "2026-10-01", "W6 1234")!;
const ts = Date.now();
// Hydrating an old browser entry must not resurrect a historical numeric price.
entries.set(key, JSON.stringify({ price: 180, specific: true, stale: true, ts }));
assert.deepEqual(readGooglePriceLS(key), { price: null, specific: true, stale: true, ts });
writeGooglePriceLS(key, { price: 180, specific: true, stale: true, ts });
assert.equal(JSON.parse(entries.get(key)!).price, null);
assert.equal(JSON.parse(entries.get(key)!).stale, true);
writeGooglePriceLS(key, { price: 125, specific: false, stale: false, ts });
assert.equal(readGooglePriceLS(key)?.price, 125);
assert.equal(readGooglePriceLS(key)?.specific, false);
entries.set(key, JSON.stringify({ price: 180, specific: true, ts: ts - 10000 }));
assert.equal(readGooglePriceLS(key, 1000), null);
entries.set(key, "not json");
assert.equal(readGooglePriceLS(key), null);
console.log("Google price display/cache policy tests: OK");