import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BOOKING_COLUMNS, DEFAULT_BOOKING_COLUMNS, visibleBookingColumns } from "../src/lib/bookingColumns.ts";
import { SaveBookingColumnPreferencesBody } from "../../../lib/api-zod/src/generated/api.ts";

test("defaults include each data column exactly once", () => {
  assert.equal(DEFAULT_BOOKING_COLUMNS.length, 16);
  assert.equal(new Set(DEFAULT_BOOKING_COLUMNS).size, 16);
  assert.equal(visibleBookingColumns(null, true).length, 16);
  assert.equal(visibleBookingColumns(null, false).length, 15);
});

test("saved choices are intersected with permissions, with a safe fallback", () => {
  assert.deepEqual(visibleBookingColumns(["paid", "ref"], false).map(c => c.k), ["ref", "paid"]);
  assert.deepEqual(visibleBookingColumns(["commission"], false).map(c => c.k), ["ref"]);
  assert.deepEqual(visibleBookingColumns(["commission"], true).map(c => c.k), ["commission"]);
  assert.deepEqual(visibleBookingColumns(["unknown"], true).map(c => c.k), ["ref"]);
});

test("save contract accepts reset and valid selections, not empty or foreign fields", () => {
  const schema = SaveBookingColumnPreferencesBody.strict();
  for (const visibleColumns of [null, ["ref"], DEFAULT_BOOKING_COLUMNS]) {
    assert.ok(schema.safeParse({ visibleColumns }).success);
  }
  for (const body of [{}, { visibleColumns: [] }, { visibleColumns: ["other"] },
    { visibleColumns: ["ref"], userId: 1 }, { visibleColumns: "ref" }]) {
    assert.equal(schema.safeParse(body).success, false);
  }
});

test("every desktop column has a matching cell visibility guard", () => {
  const source = readFileSync(new URL("../src/pages/bookings-premium.tsx", import.meta.url), "utf8");
  const cells = [...source.matchAll(/<td hidden=\{!isColumnVisible\("([^"]+)"\)\}/g)].map(match => match[1]);
  assert.deepEqual(cells, BOOKING_COLUMNS.map(c => c.k));
  assert.ok(source.includes("colSpan={columnState.columns.length + 1}"));
});