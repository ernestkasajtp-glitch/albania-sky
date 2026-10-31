import assert from "node:assert/strict";
import { decryptPokSecret, encryptPokSecret } from "../src/lib/pokCrypto.js";
import { canRetryPokIntent, canReusePokOrder, isExplicitPokCreationRejection, isPokIntentUnresolved, isPokOrderBound, isProviderExpiredUnpaid, pokPaymentEvidence, shouldSupersedePokOrder, terminalPokFailureStatus } from "../src/lib/pokOrderPolicy.js";

process.env.SESSION_SECRET = "test-session-secret";
const plaintext = "merchant-secret-\u{1F512}";
const encrypted = encryptPokSecret(plaintext);

assert.notEqual(encrypted, plaintext);
assert.match(encrypted, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
assert.equal(decryptPokSecret(encrypted), plaintext);
assert.notEqual(encryptPokSecret(plaintext), encrypted, "AES-GCM envelopes must use a fresh IV");
assert.throws(() => decryptPokSecret(`${encrypted}x`), /Unsupported state|unable to authenticate|Invalid/, "tampering must fail closed");
assert.throws(() => decryptPokSecret("not-an-envelope"), /Invalid POK credential envelope/);

const previous = process.env.SESSION_SECRET;
delete process.env.SESSION_SECRET;
assert.throws(() => encryptPokSecret("secret"), /SESSION_SECRET is required/);
process.env.SESSION_SECRET = previous;

const now = new Date("2026-01-01T00:00:00Z");
const order = { bookingId: 42, accountId: 7, amount: "125.00", status: "created", expiresAt: new Date("2026-01-01T00:55:00Z") };
assert.equal(isPokOrderBound(order, 42, 7), true);
assert.equal(isPokOrderBound(order, 42, 8), false);
assert.equal(canReusePokOrder(order, 42, 7, 125, now), true);
assert.equal(canReusePokOrder({ ...order, status: "paid" }, 42, 7, 125, now), false);
assert.equal(canReusePokOrder({ ...order, expiresAt: new Date("2025-12-31T23:59:59Z") }, 42, 7, 125, now), false);
const locallyExpired = { ...order, expiresAt: new Date("2025-12-31T23:59:59Z") };
assert.equal(canReusePokOrder(locallyExpired, 42, 7, 125, now, true), true);
assert.equal(canReusePokOrder(locallyExpired, 42, 7, 125, now, false), false);
assert.equal(canReusePokOrder(locallyExpired, 43, 7, 125, now, true), false);
assert.equal(canReusePokOrder(locallyExpired, 42, 8, 125, now, true), false);
assert.equal(canReusePokOrder(locallyExpired, 42, 7, 124, now, true), false);
for (const status of ["paid", "unknown", "creating", "review_required", "failed", "cancelled", "expired", "superseded"]) {
  assert.equal(canReusePokOrder({ ...locallyExpired, status }, 42, 7, 125, now, true), false);
}
assert.equal(isPokIntentUnresolved("creating"), true);
assert.equal(isPokIntentUnresolved("unknown"), true);
assert.equal(isPokIntentUnresolved("failed"), false);
assert.equal(canRetryPokIntent("failed"), true);
assert.equal(canRetryPokIntent("unknown"), false);
assert.equal(terminalPokFailureStatus("CANCELLED"), "cancelled");
assert.equal(terminalPokFailureStatus("expired"), "expired");
assert.equal(terminalPokFailureStatus("open"), null);
assert.equal(isExplicitPokCreationRejection(400), true);
assert.equal(isExplicitPokCreationRejection(422), true);
assert.equal(isExplicitPokCreationRejection(409), false);
assert.equal(isExplicitPokCreationRejection(429), false);
assert.equal(isExplicitPokCreationRejection(500), false);

// Default/OFF reuses a live bound order; ON supersedes only after provider
// verification that it is unpaid. Creating/unknown never become retryable.
assert.equal(canReusePokOrder(order, 42, 7, 125, now), true);
assert.equal(shouldSupersedePokOrder("created", false, true), false);
assert.equal(shouldSupersedePokOrder("created", true, true), true);
assert.equal(shouldSupersedePokOrder("pending", true, true), true);
assert.equal(shouldSupersedePokOrder("created", true, false), false);
for (const status of ["creating", "unknown", "review_required", "superseded"]) {
  assert.equal(shouldSupersedePokOrder(status, true, true), false);
}

const paidOrder = {
  id: "order-123", merchantCustomReference: "KTF1234",
  currencyCode: "EUR", amount: 125, capturedAmount: 125,
  isCaptured: true, isCompleted: true,
};
const evidence = (candidate: any) => pokPaymentEvidence(candidate, "order-123", "KTF1234", "125.00");
assert.equal(evidence(paidOrder).kind, "paid");
assert.equal(evidence({ ...paidOrder, isCaptured: false, isCompleted: false, capturedAmount: 0 }).kind, "unpaid");
assert.equal(evidence({ ...paidOrder, isCaptured: false, isCompleted: false, capturedAmount: 125 }).kind, "uncertain");
assert.equal(evidence({ ...paidOrder, isCaptured: undefined, isCompleted: undefined, capturedAmount: 125 }).kind, "uncertain");
assert.equal(evidence({ ...paidOrder, isCaptured: false }).kind, "uncertain");
assert.equal(evidence({ ...paidOrder, currencyCode: "USD" }).reason, "currency_mismatch");
assert.equal(evidence({ ...paidOrder, currencyCode: undefined }).reason, "currency_mismatch");
assert.equal(evidence({ ...paidOrder, amount: 124 }).reason, "amount_mismatch");
assert.equal(evidence({ ...paidOrder, finalAmount: 124 }).reason, "amount_mismatch");
assert.equal(evidence({ ...paidOrder, amount: undefined }).reason, "amount_mismatch");
assert.equal(evidence({ ...paidOrder, capturedAmount: 124 }).reason, "capture_mismatch");
assert.equal(evidence({ ...paidOrder, id: "other" }).reason, "binding_mismatch");
assert.equal(evidence({ ...paidOrder, merchantCustomReference: "OTHER" }).reason, "binding_mismatch");
assert.equal(evidence({ ...paidOrder, isCaptured: undefined, isCompleted: undefined, capturedAmount: undefined }).kind, "uncertain");

console.log("pokCrypto tests: OK");
const expiredUnpaid = { ...paidOrder, status: "expired", isCaptured: false, isCompleted: false, capturedAmount: 0 };
const replaceable = (candidate: any) => isProviderExpiredUnpaid(candidate, "order-123", "KTF1234", "125.00");
assert.equal(replaceable(expiredUnpaid), true);
assert.equal(replaceable({ ...expiredUnpaid, status: "open" }), false);
assert.equal(replaceable({ ...expiredUnpaid, status: undefined }), false);
assert.equal(replaceable({ ...expiredUnpaid, id: "other" }), false);
assert.equal(replaceable({ ...expiredUnpaid, amount: 124 }), false);
assert.equal(replaceable({ ...expiredUnpaid, capturedAmount: 1 }), false);
assert.equal(replaceable({ ...expiredUnpaid, isCompleted: undefined }), false);
assert.equal(replaceable({ ...paidOrder, status: "expired" }), false);
console.log("Provider expiry retry checks: OK");