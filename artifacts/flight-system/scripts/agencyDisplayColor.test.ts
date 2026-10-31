import assert from "node:assert/strict";
import test from "node:test";
import { agencyColorMap, agencyColorStyle } from "../src/lib/agencyDisplayColor.ts";
import { AGENCY_COLOR_PRESETS } from "../src/lib/agencyColorPalette.ts";
import { CreateAgentBody, UpdateAgentBody } from "../../../lib/api-zod/src/generated/api.ts";

test("palette contains exactly 64 unique, server-valid colors and accessible labels", () => {
  assert.equal(AGENCY_COLOR_PRESETS.length, 64);
  assert.equal(new Set(AGENCY_COLOR_PRESETS.map(preset => preset.color)).size, 64);
  assert.equal(new Set(AGENCY_COLOR_PRESETS.map(preset => preset.label)).size, 64);
  for (const { color } of AGENCY_COLOR_PRESETS) {
    assert.ok(agencyColorStyle(color));
    assert.equal(UpdateAgentBody.safeParse({ displayColor: color }).success, true);
  }
});

test("only valid six-digit hex colors produce a text override", () => {
  assert.deepEqual(agencyColorStyle("#12aBC0"), { color: "#12aBC0", backgroundImage: "none" });
  for (const value of [null, undefined, "", "#123", "#1234567", "red", "url(https://example.com)", 123]) {
    assert.equal(agencyColorStyle(value), undefined);
  }
});

test("agencies are isolated by ID and clearing restores default styling", () => {
  const colors = agencyColorMap([
    { id: 1, displayColor: "#15803d" },
    { id: 2, displayColor: null },
    { id: 3 },
  ]);
  assert.equal(colors.get(1)?.color, "#15803d");
  assert.equal(colors.get(2), undefined);
  assert.equal(colors.get(3), undefined);
  assert.equal(colors.get(999), undefined);
  assert.equal(agencyColorMap([{ id: 1, displayColor: null }]).get(1), undefined);
});

test("create and update contracts accept valid colors and explicit clearing", () => {
  const create = { name: "Color test", email: "color@example.invalid", groupId: 1 };
  for (const displayColor of ["#15803d", "#ABCDEF", null]) {
    assert.equal(CreateAgentBody.safeParse({ ...create, displayColor }).success, true);
    assert.deepEqual(UpdateAgentBody.parse({ displayColor }), { displayColor });
  }
  assert.equal(CreateAgentBody.safeParse(create).success, true);
  assert.equal(Object.hasOwn(UpdateAgentBody.parse({ name: "Unchanged color" }), "displayColor"), false);
});

test("invalid colors are rejected by both server contracts", () => {
  for (const displayColor of ["", "green", "#abc", "#1234567", "url(x)", 123, {}]) {
    assert.equal(CreateAgentBody.safeParse({
      name: "Color test", email: "color@example.invalid", groupId: 1, displayColor,
    }).success, false);
    assert.equal(UpdateAgentBody.safeParse({ displayColor }).success, false);
  }
});