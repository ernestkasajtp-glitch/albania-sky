import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { kyteSearchRouter } from "../src/routes/kyteSearch.js";
import { kyteSandboxSessionFingerprint, openKyteSandboxBookingToken } from "../src/lib/kyteSandboxBookingToken.js";

// No provider calls or credentials: the only outbound request is intercepted.
const priorSessionSecret = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = "kyte-search-test-only-secret-at-least-thirty-two-characters";
process.env.KYTE_SANDBOX_API_KEY = "REPLACE_WITH_YOUR_VALUE";
const nativeFetch = globalThis.fetch;
let upstreamCalls = 0;
let upstreamBody: any;
let upstreamTransactionId: string | null = null;
let upstreamResponse: unknown;
let upstreamStatus = 200;

const segment = (from: string, to: string, date: string, number: string) => ({
  marketingCarrier: { code: "W6", name: "Wizz Air" },
  flightNumber: number,
  departure: { airport: { code: from }, date, time: "08:15" },
  arrival: { airport: { code: to }, date, time: "10:20" },
});
const sample = {
  offers: {
    offer1: {
      id: "offer-1", owner: "Wizz Air", totalPrice: 12345,
      currency: { code: "EUR", decimals: 2 }, expiration: "2099-06-01T12:00:00Z",
      passengers: [
        { id: "adult-1", type: "adult", price: 5000, priceBreakdown: [] },
        { id: "adult-2", type: "adult", price: 5000, priceBreakdown: [] },
        { id: "child-1", type: "child", price: 1500, priceBreakdown: [] },
        { id: "infant-1", type: "infant", price: 845, priceBreakdown: [] },
      ],
      flightSolutions: ["out", "back"],
    },
  },
  flightSolutions: {
    out: { totalDuration: 185, segments: [segment("TIA", "FCO", "2099-06-01", "123"), segment("FCO", "LHR", "2099-06-01", "456")] },
    back: { totalDuration: 130, segments: [segment("LHR", "TIA", "2099-06-10", "789")] },
  },
  warnings: [{ message: "Some airlines unavailable" }],
  errors: [{ code: "PARTIAL_FAILURE", detail: "Some routes unavailable" }],
};
upstreamResponse = sample;
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  upstreamCalls++;
  assert.equal(String(_input), "https://api.sandbox.gokyte.com/api/v3/flights/shop");
  assert.equal(init?.method, "POST");
  assert.equal(new Headers(init?.headers).get("x-api-key"), "test-only-placeholder");
  upstreamTransactionId = new Headers(init?.headers).get("x-transaction-id");
  upstreamBody = JSON.parse(String(init?.body));
  return Response.json(upstreamResponse, { status: upstreamStatus });
}) as typeof fetch;

const app = express();
app.use(express.json());
// Test-only session injection, exercising the real route middleware rather than
// substituting a test-only authorization function.
app.use("/api", (req, _res, next) => {
  const role = req.header("x-test-role");
  const source = req.header("x-test-source");
  if (role) (req as any).session = { role, source, userId: 42 };
  (req as any).sessionID = "test-admin-session";
  (req as any).log = { warn() {}, error() {} };
  next();
});
app.use("/api", kyteSearchRouter);
const server = http.createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not bind");
const url = `http://127.0.0.1:${address.port}/api`;
const input = {
  origin: " tia ", destination: "lhr", departureDate: "2099-06-01", returnDate: "2099-06-10",
  adults: 2, childAges: [7], infantAges: [1], nonStop: false,
};
async function search(body: unknown, role?: string, source?: string) {
  const response = await nativeFetch(`${url}/kyte/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
      ...(source ? { "x-test-source": source } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as any };
}

try {
  for (const [role, source, expected] of [
    [undefined, undefined, 401],
    ["manager", "fms", 403],
    ["agent_staff", "fms", 403],
    ["admin", "be", 401],
    ["client", "fms", 401],
  ] as const) {
    assert.equal((await search(input, role, source)).status, expected);
  }
  assert.equal(upstreamCalls, 0, "unauthorized requests must not contact Kyte");

  for (const invalid of [
    { departureDate: "2099-02-29" }, { departureDate: "2099-13-01" },
    { returnDate: "2099-05-31" }, { returnDate: "not-a-date" },
    { adults: 0 }, { adults: 1.5 }, { adults: 10 },
    { childAges: [1] }, { childAges: [18] }, { infantAges: [2] },
    { adults: 1, infantAges: [0, 1] }, { adults: 8, childAges: [5, 6] },
    { origin: "LHR", destination: "LHR" }, { nonStop: "true" },
  ]) {
    const result = await search({ ...input, ...invalid }, "admin", "fms");
    assert.equal(result.status, 400, JSON.stringify(invalid));
    assert.equal(typeof result.data.error, "string");
  }
  assert.equal(upstreamCalls, 0, "invalid input must not contact Kyte");

  const signingSecret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  assert.equal((await search(input, "admin", "fms")).status, 503);
  assert.equal(upstreamCalls, 0, "missing token signing secret must fail before contacting Kyte");
  process.env.SESSION_SECRET = signingSecret;

  const success = await search(input, "admin", "fms");
  assert.equal(success.status, 200);
  assert.equal(upstreamCalls, 1);
  assert.deepEqual(upstreamBody.journeys, [
    { departureAirport: "TIA", arrivalAirport: "LHR", date: { main: "2099-06-01" } },
    { departureAirport: "LHR", arrivalAirport: "TIA", date: { main: "2099-06-10" } },
  ]);
  assert.deepEqual(upstreamBody.passengers, [{}, {}, { age: 7 }, { age: 1 }]);
  assert.equal(upstreamBody.nonStopFlight, false);
  assert.equal(success.data.offers[0].priceMinor, 12345);
  assert.deepEqual(success.data.offers[0].currency, { code: "EUR", decimals: 2 });
  assert.equal(typeof success.data.offers[0].bookingToken, "string");
  assert.equal(typeof success.data.offers[0].bookingTokenExpiresAt, "string");
  const tokenSigningSecret = `${process.env.SESSION_SECRET}\0${process.env.KYTE_SANDBOX_API_KEY}`;
  const token = openKyteSandboxBookingToken(success.data.offers[0].bookingToken, tokenSigningSecret);
  assert.ok(token);
  assert.equal(token.userId, 42);
  assert.equal(token.sessionFingerprint, kyteSandboxSessionFingerprint("test-admin-session", tokenSigningSecret));
  assert.equal(token.offerId, "offer-1");
  assert.equal(token.transactionId, upstreamTransactionId);
  assert.equal(token.priceMinor, 12345);
  assert.deepEqual(token.passengers, [
    { id: "adult-1", type: "adult" },
    { id: "adult-2", type: "adult" },
    { id: "child-1", type: "child" },
    { id: "infant-1", type: "infant" },
  ]);
  assert.deepEqual(success.data.offers[0].passengerSlots, [
    { id: "adult-1", type: "adult" },
    { id: "adult-2", type: "adult" },
    { id: "child-1", type: "child" },
    { id: "infant-1", type: "infant" },
  ]);
  assert.equal(success.data.offers[0].journeys.length, 2);
  assert.equal(success.data.offers[0].journeys[0].totalDurationMinutes, 185);
  assert.deepEqual(success.data.offers[0].journeys[0].segments.map((s: any) => s.flightNumber), ["W6123", "W6456"]);
  assert.deepEqual(success.data.offers[0].journeys[0].segments[0].departure, { airport: "TIA", date: "2099-06-01", time: "08:15" });
  assert.equal(success.data.offers[0].journeys[1].segments[0].arrival.airport, "TIA");
  assert.deepEqual(success.data.warnings, ["Some airlines unavailable"]);
  assert.deepEqual(success.data.errors, ["Some routes unavailable"]);
  assert.ok(!Number.isNaN(Date.parse(success.data.searchedAt)));

  upstreamResponse = {
    ...sample,
    offers: { offer1: { ...sample.offers.offer1, passengers: [] } },
  };
  const offerWithoutBindings = await search(input, "admin", "fms");
  assert.equal(offerWithoutBindings.status, 200);
  assert.equal(offerWithoutBindings.data.offers[0].bookingToken, null);
  upstreamResponse = {
    ...sample,
    offers: { offer1: { ...sample.offers.offer1, expiration: "not-a-date" } },
  };
  const offerWithoutExpiry = await search(input, "admin", "fms");
  assert.equal(offerWithoutExpiry.status, 200);
  assert.equal(offerWithoutExpiry.data.offers[0].bookingToken, null);
  assert.equal(offerWithoutExpiry.data.offers[0].expiresAt, null);

  upstreamResponse = { offers: {}, flightSolutions: {}, warnings: [], errors: [] };
  const empty = await search({ ...input, returnDate: "", childAges: [], infantAges: [], nonStop: true }, "admin", "fms");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.offers, []);
  assert.equal(upstreamBody.journeys.length, 1);
  assert.equal(upstreamBody.nonStopFlight, true);

  for (const broken of [
    { offers: {}, flightSolutions: null },
    { ...sample, flightSolutions: { back: sample.flightSolutions.back } },
    { ...sample, offers: { offer1: { ...sample.offers.offer1, totalPrice: "123.45" } } },
    { ...sample, flightSolutions: { ...sample.flightSolutions, out: { segments: [null] } } },
  ]) {
    upstreamResponse = broken;
    assert.equal((await search(input, "admin", "fms")).status, 502);
  }
  upstreamStatus = 403;
  assert.equal((await search(input, "admin", "fms")).status, 502);

  // The Kyte router must neither own nor intercept the partner API namespace.
  const partner = await nativeFetch(`${url}/v1/flights`);
  assert.equal(partner.status, 404);
  assert.equal(upstreamCalls, 9);
  console.log("Kyte search contract and access tests: OK");
} finally {
  globalThis.fetch = nativeFetch;
  if (priorSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = priorSessionSecret;
  delete process.env.KYTE_SANDBOX_API_KEY;
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}