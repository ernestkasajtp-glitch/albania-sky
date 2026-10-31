import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/GoogleMonitoringToggle.tsx", import.meta.url), "utf8");
const expression = component.match(/const API_BASE = (.+);/)?.[1];
assert.ok(expression);

for (const base of ["/", "/flight-system/"]) {
  test(`Google toggle reaches the shared API when BASE_URL=${base}`, () => {
    const apiBase = Function(`return ${expression.replace("import.meta.env.BASE_URL", JSON.stringify(base))}`)();
    const url = new URL(`${apiBase}/flights/42/google-monitoring`, `https://example.test${base}flights`);
    assert.equal(url.pathname, "/api/flights/42/google-monitoring");
    assert.match(component, /method: "PATCH"/);
    assert.match(component, /JSON\.stringify\(\{ disabled: !disabled \}\)/);
  });
}

test("side-panel black cross appears below confirmation, outside the pricing section", () => {
  const panel = readFileSync(new URL("../src/components/FlightSidePanel.tsx", import.meta.url), "utf8");
  assert.equal(panel.match(/<GoogleMonitoringToggle\b/g)?.length, 1);
  const toggle = panel.indexOf("<GoogleMonitoringToggle");
  assert.ok(toggle > panel.indexOf('name="isConfirmed"'));
  assert.ok(toggle < panel.indexOf('name="externalSalesBlocked"'));
});
