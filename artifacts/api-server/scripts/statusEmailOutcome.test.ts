import assert from "node:assert/strict";
import { finalAgentDeliveryOutcome, persistEmailOutcomeWithRetry, statusEmailOutcomeNote } from "../src/lib/statusEmailOutcome.js";

const first = JSON.parse(statusEmailOutcomeNote({
  statusEventId: 41,
  outcome: "sent",
  reason: "Emaili iu dërgua agjentit me PDF",
  email: "agent@example.com",
  status: "confirmed",
}));
const repeated = JSON.parse(statusEmailOutcomeNote({
  statusEventId: 42,
  outcome: "skipped",
  reason: "Njoftimet me email janë çaktivizuar për agjentin",
  email: null,
  status: "confirmed",
}));

assert.equal(first.statusEventId, 41);
assert.equal(repeated.statusEventId, 42);
assert.notEqual(first.statusEventId, repeated.statusEventId);
assert.equal(first.recipient, "agent");
assert.equal(repeated.outcome, "skipped");
assert.throws(() => statusEmailOutcomeNote({
  statusEventId: 0,
  outcome: "failed",
  reason: "setup",
  email: null,
  status: "draft",
}), /positive integer/);

assert.deepEqual(finalAgentDeliveryOutcome({ pdfAvailable: true }), {
  outcome: "sent",
  reason: "Emaili iu dërgua agjentit me PDF",
});
assert.deepEqual(finalAgentDeliveryOutcome({ pdfAvailable: false }), {
  outcome: "sent",
  reason: "U dërgua pa PDF sepse gjenerimi i PDF-së dështoi",
});
assert.deepEqual(finalAgentDeliveryOutcome({ pdfAvailable: true, deliveryError: "SMTP setup" }), {
  outcome: "failed",
  reason: "Dërgimi i emailit dështoi: SMTP setup",
});
assert.deepEqual(finalAgentDeliveryOutcome({ pdfAvailable: false, deliveryError: "SMTP setup" }), {
  outcome: "failed",
  reason: "Gjenerimi i PDF-së dështoi dhe dërgimi pa PDF dështoi: SMTP setup",
});

// A temporary audit failure must retry the same evidence, not resend or
// relabel an accepted email as failed.
let attempts = 0;
let failures = 0;
const persisted: string[] = [];
assert.equal(await persistEmailOutcomeWithRetry(async () => {
  attempts++;
  if (attempts < 3) throw new Error("temporary database outage");
  persisted.push(first.outcome);
}, () => { failures++; }), true);
assert.equal(attempts, 3);
assert.equal(failures, 0);
assert.deepEqual(persisted, ["sent"]);

attempts = 0;
assert.equal(await persistEmailOutcomeWithRetry(async () => {
  attempts++;
  throw new Error("database unavailable");
}, () => { failures++; }), false);
assert.equal(attempts, 3);
assert.equal(failures, 1);

attempts = 0;
assert.equal(await persistEmailOutcomeWithRetry(async () => { attempts++; }, () => {
  assert.fail("Successful persistence must not report failure");
}), true);
assert.equal(attempts, 1);

console.log("statusEmailOutcome tests: OK");