import assert from "node:assert/strict";
import { canAutoSoldOutFromGoogle, forEachGoogleLookupGroup } from "../src/lib/googleLookupEligibility.js";

type TestFlight = {
  id: number;
  routeDate: string;
  excludeFromGoogleRule: boolean;
};

const included: TestFlight = {
  id: 1,
  routeDate: "TIA|BGY|2026-09-08",
  excludeFromGoogleRule: false,
};
const excluded: TestFlight = {
  id: 2,
  routeDate: "TIA|BGY|2026-09-08",
  excludeFromGoogleRule: true,
};

const checkKinds = ["price", "schedule", "availability"] as const;
const triggerKinds = ["automatic", "manual"] as const;

for (const checkKind of checkKinds) {
  for (const triggerKind of triggerKinds) {
    const rapidApiFlightIds: number[] = [];
    await forEachGoogleLookupGroup(
      [included, excluded],
      flight => flight.routeDate,
      async (_key, flights) => {
        rapidApiFlightIds.push(...flights.map(flight => flight.id));
      },
    );

    assert.deepEqual(
      rapidApiFlightIds,
      [included.id, excluded.id],
      `${triggerKind} ${checkKind} lookup must include excluded flights for visibility`,
    );
  }
}

let excludedOnlyRapidApiCalls = 0;
await forEachGoogleLookupGroup(
  [excluded],
  flight => flight.routeDate,
  async () => { excludedOnlyRapidApiCalls++; },
);
assert.equal(
  excludedOnlyRapidApiCalls,
  1,
  "an excluded-only selection must still make a Google lookup",
);

assert.equal(canAutoSoldOutFromGoogle(included), true, "normal flights may use Google auto-sold-out");
assert.equal(canAutoSoldOutFromGoogle(excluded), false, "excluded flights must never use Google auto-sold-out");

console.log("googleLookupEligibility tests: OK");