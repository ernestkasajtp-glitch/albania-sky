import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync("artifacts/flight-system/src/lib/atomicBookingTransport.ts", "utf8").replaceAll("import.meta.env.BASE_URL", '"/flight-system/"');
const exports = {};
Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
globalThis.window = { location: { origin: "https://fixture.test" } };
const requests = [];
let status = 500;
globalThis.fetch = async (url, init) => {
  requests.push({ url, body: JSON.parse(init.body) });
  return new Response(JSON.stringify(status === 200 ? { results: [{ id: 1 }], booking: { saveVersion: "b".repeat(64) } } : { error: "Fixture failure" }), { status });
};
const transport = new exports.AtomicBookingTransport();
transport.bookingId = 1; transport.version = "a".repeat(64);
const stage = value => {
  transport.begin();
  const request = transport.request("/flight-system/../api/passengers/1", {
    method: "PATCH", body: JSON.stringify({ ticketPrice: value }),
  });
  return Promise.allSettled([request]);
};
let pending = stage(100);
await assert.rejects(transport.commit(), /Fixture failure/);
assert.equal((await pending)[0].status, "rejected"); transport.finish();
pending = stage(100);
await assert.rejects(transport.commit()); await pending; transport.finish();
assert.equal(requests[0].body.requestId, requests[1].body.requestId);
pending = stage(110);
await assert.rejects(transport.commit()); await pending; transport.finish();
assert.notEqual(requests[1].body.requestId, requests[2].body.requestId);
assert.equal(requests[0].body.commands[0].path, "/passengers/1");
const count = requests.length;
pending = stage(110);
await assert.rejects(transport.commit(new Error("Invalid field")));
await pending; transport.finish();
assert.equal(requests.length, count, "preparation failure never submits other valid commands");
status = 200;
pending = stage(110);
await transport.commit(); assert.equal((await pending)[0].status, "fulfilled");
await assert.rejects(transport.request("/api/payments", { method: "POST" }), /tepër vonë/);
transport.finish();
assert.equal(requests.length, count + 1);

// Execute the real inline ticket-price flush, not a replica of its validation.
const ui = fs.readFileSync("artifacts/flight-system/src/components/BookingDetailContent.tsx", "utf8");
const start = ui.indexOf("useEffect(() => registerFlush(fieldId, async () => {");
const end = ui.indexOf("}), [fieldId, doCommit", start);
assert.ok(start > 0 && end > start);
const body = ui.slice(start + "useEffect(() => registerFlush(fieldId, async () => {".length, end);
let saves = 0;
const makeFlush = Function("editing", "doCommit", "hasPendingRef", "pendingRef", "onSave", "originalRef", "markDirty", "fieldId", `return async () => { ${body} };`);
await assert.rejects(makeFlush(false, () => {}, { current: true }, { current: -1 }, () => { saves++; }, { current: 100 }, () => {}, "price")(), /jo negativ/);
assert.equal(saves, 0, "negative passenger price never reaches the transport");
console.log("PASS: atomic transport, stable retry IDs, preparation rollback, late-write guard, negative-price validation before network.");