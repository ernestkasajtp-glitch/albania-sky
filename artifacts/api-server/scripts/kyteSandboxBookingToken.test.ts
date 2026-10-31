import assert from "node:assert/strict";
import {
  kyteSandboxSessionFingerprint,
  openKyteSandboxBookingToken,
  sealKyteSandboxBookingToken,
  type KyteSandboxBookingTokenPayload,
} from "../src/lib/kyteSandboxBookingToken";

const secret = "unit-test-only-session-secret-with-at-least-32-characters";
const payload: KyteSandboxBookingTokenPayload = {
  version: 1,
  userId: 42,
  sessionFingerprint: kyteSandboxSessionFingerprint("session-A", secret),
  offerId: "offer-id-that-must-remain-encrypted",
  transactionId: "6e5d8f8b-4c19-4cc1-9c1e-91d190bfebc9",
  passengers: [
    { id: "bound-adult-id", type: "adult" },
    { id: "bound-child-id", type: "child" },
  ],
  priceMinor: 14500,
  currencyCode: "EUR",
  currencyDecimals: 2,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const token = sealKyteSandboxBookingToken(payload, secret);
assert.deepEqual(openKyteSandboxBookingToken(token, secret), payload);
assert.equal(token.includes(payload.offerId), false, "offer details should remain opaque");
assert.equal(token.includes(payload.transactionId), false, "transaction identifiers should remain opaque");
assert.equal(token.includes(payload.passengers[0].id), false, "passenger identifiers should remain opaque");
assert.equal(openKyteSandboxBookingToken(token, `${secret}-wrong-key`), null);
assert.notEqual(
  openKyteSandboxBookingToken(token, secret)?.sessionFingerprint,
  kyteSandboxSessionFingerprint("session-B", secret),
  "a new login session must not match the shopping session",
);
assert.equal(openKyteSandboxBookingToken(`${token.slice(0, -1)}x`, secret), null);
assert.throws(() => sealKyteSandboxBookingToken(payload, "short"));
assert.throws(() => sealKyteSandboxBookingToken({
  ...payload,
  passengers: [{ id: "duplicate", type: "adult" }, { id: "duplicate", type: "child" }],
}, secret));

const expired = sealKyteSandboxBookingToken({
  ...payload,
  expiresAt: "2020-01-01T00:00:00.000Z",
}, secret);
assert.ok(openKyteSandboxBookingToken(expired, secret), "authenticated expired tokens remain decryptable to find prior attempts");

process.stdout.write("Kyte Sandbox booking token tests passed\n");