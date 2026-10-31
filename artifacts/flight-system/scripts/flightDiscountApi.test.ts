import assert from "node:assert/strict";
import { flightDiscountUrl, readSavedFlightDiscount } from "../src/lib/flightDiscountApi.ts";

for (const base of ["/", "/flight-system/", "/flight-system"]) {
  assert.equal(new URL(flightDiscountUrl(base, 42), "https://example.test").pathname, "/api/flights/42/discount");
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});
for (const d of [{ type: "percent", value: 10, channels: ["agents", "public"] }, { type: "fixed", value: 30, channels: ["offline", "api"] }] as any[]) {
  assert.deepEqual(await readSavedFlightDiscount(json({ flightDiscount: d }), d), d);
  await assert.rejects(readSavedFlightDiscount(new Response("<!DOCTYPE html>", {
    headers: { "content-type": "text/html" },
  }), d), /JSON/);
  await assert.rejects(readSavedFlightDiscount(json({}), d), /mungon/);
  await assert.rejects(readSavedFlightDiscount(json({ flightDiscount: null }), d), /përputhet/);
  await assert.rejects(readSavedFlightDiscount(json({ flightDiscount: { ...d, value: 99 } }), d), /përputhet/);
  await assert.rejects(readSavedFlightDiscount(json({ flightDiscount: { ...d, channels: ["public"] } }), d), /përputhet/);
  // channel order is irrelevant
  assert.deepEqual((await readSavedFlightDiscount(json({ flightDiscount: { ...d, channels: [...d.channels].reverse() } }), d))?.channels.length, d.channels.length);
}
// legacy response (no channels) normalizes to agents+public
const leg = { type: "percent", value: 5, channels: ["public", "agents"] } as any;
assert.deepEqual(await readSavedFlightDiscount(json({ flightDiscount: { type: "percent", value: 5 } }), leg), { type: "percent", value: 5, channels: ["agents", "public"] });
await assert.rejects(readSavedFlightDiscount(json({ flightDiscount: { type: "percent", value: 5 } }), { ...leg, channels: ["api"] }), /përputhet/);
await assert.rejects(readSavedFlightDiscount(json({ flightDiscount: { ...leg } }), { ...leg, channels: [] }), /kanal/);
// malformed saved channels rejected, never broadened to legacy
for (const bad of [null, [], ["bogus"], ["agents", "public", "bogus"], "agents", [1], ["agents", "agents", "public"]]) {
  await assert.rejects(readSavedFlightDiscount(json({ flightDiscount: { type: "percent", value: 5, channels: bad } }), leg), /pavlefshme/, JSON.stringify(bad));
}
await assert.rejects(readSavedFlightDiscount(json({ flightDiscount: "x" }), leg), /pavlefshme/);
assert.equal(await readSavedFlightDiscount(json({ flightDiscount: null }), null), null);
await assert.rejects(readSavedFlightDiscount(json({}), null), /mungon/);
await assert.rejects(readSavedFlightDiscount(json({ error: "Admin only" }, 403), null), /Admin only/);
await assert.rejects(readSavedFlightDiscount(new Response("bad", {
  headers: { "content-type": "application/json" },
}), null), /pavlefshme/);
console.log("PASS: root + VPS API paths, percent/fixed/remove, HTML/malformed/missing/mismatched/403 responses");
