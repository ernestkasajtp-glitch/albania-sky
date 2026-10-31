import assert from "node:assert/strict";
import { resolveInternalVariant, themeVariant } from "../src/lib/pageLayoutResolve.ts";

const graphite = { premiumLayout: true };
const indigo = {};
const neo = { premiumLayout: true, bookingNewLayout: "neoGlass" as const };

// Baseline (no stored choices) preserves theme-driven behaviour.
assert.equal(resolveInternalVariant("bookings_list", [], indigo), "classic");
assert.equal(resolveInternalVariant("bookings_list", [], graphite), "premium");
assert.equal(resolveInternalVariant("booking_new", [], neo), "neoGlass");
assert.equal(resolveInternalVariant("booking_detail", [], neo), "premium");
assert.equal(themeVariant("bookings_list", neo), "premium");

// Independent per-page override; adjacent routes do not inherit it.
const layouts = [
  { scope: "internal", page: "bookings_list", variant: "classic" },
  { scope: "internal", page: "booking_new", variant: "neoGlass" },
  { scope: "external", page: "booking_detail", variant: "premium" },
];
assert.equal(resolveInternalVariant("bookings_list", layouts, graphite), "classic");
assert.equal(resolveInternalVariant("booking_new", layouts, indigo), "neoGlass");
assert.equal(resolveInternalVariant("booking_detail", layouts, indigo), "classic"); // external entry ignored
assert.equal(resolveInternalVariant("booking_detail", layouts, graphite), "premium");

// Unknown / not-renderable selections are explicit errors, not silent fallbacks.
assert.equal(resolveInternalVariant("bookings_list", [{ scope: "internal", page: "bookings_list", variant: "neoGlass" }], indigo), null);
assert.equal(resolveInternalVariant("booking_detail", [{ scope: "internal", page: "booking_detail", variant: "canvas" }], indigo), null);
console.log("pageLayoutResolve tests passed");
