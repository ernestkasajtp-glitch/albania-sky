import assert from "node:assert/strict";
import { test } from "node:test";
import { pokReturnState } from "./pokReturnResult";

test("only a verification bound to this booking can show paid success", () => {
  assert.equal(pokReturnState({ ok: true, bookingRef: "ABC" }, "ABC"), "success");
  assert.equal(pokReturnState({ ok: true, reason: "already_recorded", bookingRef: "ABC" }, "ABC"), "success");
  assert.equal(pokReturnState({ ok: false, reason: "already_recorded", bookingRef: "ABC" }, "ABC"), "review");
  assert.equal(pokReturnState({ ok: true, bookingRef: "OTHER", paid: 100 }, "ABC"), "review");
  assert.equal(pokReturnState({ ok: true, paid: 100 }, "ABC"), "review");
  assert.equal(pokReturnState(null, "ABC"), "review");
});

test("pending is distinct from mismatched or unverified payment", () => {
  assert.equal(pokReturnState({ ok: false, reason: "not_completed", bookingRef: "ABC" }, "ABC"), "pending");
  assert.equal(pokReturnState({ ok: false, reason: "unpaid", bookingRef: "ABC" }, "ABC"), "pending");
  assert.equal(pokReturnState({ ok: true, reason: "unpaid", bookingRef: "ABC" }, "ABC"), "review");
  for (const reason of ["review_required", "captured_exceeds_due", "invalid_evidence", "amount_mismatch", "currency_mismatch"]) {
    assert.equal(pokReturnState({ ok: false, reason, bookingRef: "ABC", paid: 100 }, "ABC"), "review");
  }
  assert.equal(pokReturnState({ ok: false, reason: "not_completed", bookingRef: "OTHER" }, "ABC"), "review");
  assert.equal(pokReturnState({ ok: true, reason: "review_required", bookingRef: "ABC" }, "ABC"), "review");
});