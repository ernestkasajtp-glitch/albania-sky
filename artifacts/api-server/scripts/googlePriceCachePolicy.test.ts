import assert from "node:assert/strict";
import { googleDateTime, googleScheduleChanges, matchingGoogleSchedule, googleScheduleSearchEvidence, scheduleIdentity, validatedGoogleSync } from "../src/lib/googleScheduleEvidence.js";
import { nextRecheck, recheckIdentity } from "../src/lib/suspectFlightRecheckPolicy.js";
import { parseGoogleScheduleAlert } from "../../flight-system/src/lib/googleScheduleAlert.js";
import {
  computePriceWrite,
  googlePriceResponse,
  savedGooglePrice,
  googleSearchItineraries,
  googleScheduleAlertForSearch,
} from "../src/lib/googlePriceCachePolicy.js";

const empty = { price: null, routePrice: null, specific: false, stale: false };
const unverified = { ...empty, stale: true };

assert.deepEqual(computePriceWrite({ price: null, routePrice: null, specific: false }, 180), empty);
assert.deepEqual(computePriceWrite({ price: null, routePrice: null, specific: false, error: true }, 180), unverified);
assert.deepEqual(computePriceWrite({ price: 230, routePrice: 95, specific: true }, 180), {
  price: 230, routePrice: 95, specific: true, stale: false,
});
assert.deepEqual(computePriceWrite({ price: null, routePrice: 95, specific: false }, 180), {
  price: 95, routePrice: 95, specific: false, stale: false,
});
assert.deepEqual(computePriceWrite({ price: 230, routePrice: 95, specific: true, error: true }), unverified);
assert.deepEqual(computePriceWrite({ price: Infinity, routePrice: null, specific: true }), empty);
assert.deepEqual(googlePriceResponse({ price: "180", routePrice: "95", specific: true, stale: true }), unverified);
assert.deepEqual(googlePriceResponse({ price: 180, routePrice: 95, specific: true, stale: true }), unverified);
assert.deepEqual(googlePriceResponse({ price: null, stale: false }), empty);
assert.deepEqual(googlePriceResponse({ price: "180", specific: true, stale: false }), {
  price: 180, routePrice: null, specific: true, stale: false,
});
assert.equal(savedGooglePrice({ price: null, stale: false }, { price: 95, stale: false }), null);
assert.equal(savedGooglePrice({ price: 180, stale: true }, { price: 95, stale: false }), null);
assert.equal(savedGooglePrice(undefined, { price: 95, stale: false }), 95);
assert.equal(savedGooglePrice({ price: 230, stale: false }, { price: 95, stale: false }), 230);

const validEmpty = { status: true, data: { itineraries: { topFlights: [], otherFlights: [] } } };
assert.deepEqual(googleSearchItineraries(validEmpty), []);
const mixedFares = {
  status: true, data: { itineraries: { topFlights: [], otherFlights: [
    { price: 95, flights: [{ flight_number: "W4 5195", departureTime: "19:55", arrivalTime: "22:45" }] },
    { price: "unavailable", flights: [{ flight_number: "LO 598" }] },
  ] } },
};
const usable = googleSearchItineraries(mixedFares);
assert.equal(usable.length, 2, "unpriced alternatives still retain their schedules");
assert.equal(usable[0].price, 95, "unavailable alternative must not discard a valid exact fare");
assert.equal(usable[1].price, null, "unavailable is missing fare, not zero or technical failure");
assert.equal(mixedFares.data.itineraries.otherFlights[1].price, "unavailable", "do not mutate upstream payload");
assert.equal(googleSearchItineraries({ data: { itineraries: {
  topFlights: [{ price: " UNAVAILABLE ", flights: [{ flight_number: "W4 5195" }] }], otherFlights: [],
} } })[0].flights[0].flight_number, "W4 5195");
assert.equal(googleScheduleAlertForSearch({
  departureTime: "18:55", arrivalTime: "21:45",
  scheduleAlert: "not_found", scheduleAlertDetail: null, scheduleMissCount: 0,
}, { price: usable[0].price, routePrice: 95, specific: true },
{ googleCount: usable.length, match: usable[0].flights[0] })?.scheduleAlert,
"price_retry", "time-only results do not invent full schedule evidence");
for (const invalid of [
  null, {}, { data: {} },
  { data: { itineraries: { topFlights: [] } } },
  { data: { itineraries: { topFlights: {}, otherFlights: [] } } },
  { ...validEmpty, status: false },
  { ...validEmpty, success: false },
  { ...validEmpty, status: "error" },
  { ...validEmpty, error: "quota exceeded" },
  { ...validEmpty, errors: ["quota exceeded"] },
  { data: { ...validEmpty.data, success: false } },
  { data: { itineraries: { topFlights: [null], otherFlights: [] } } },
  { data: { itineraries: { topFlights: [{ price: { amount: 100 } }], otherFlights: [] } } },
  { data: { itineraries: { topFlights: [{ price: "invalid" }], otherFlights: [] } } },
]) {
  assert.throws(() => googleSearchItineraries(invalid));
}
assert.deepEqual(googleSearchItineraries({ ...validEmpty, errors: [] }), []);
assert.deepEqual(googleSearchItineraries({
  data: { itineraries: { topFlights: [{ price: 230 }], otherFlights: [{ price: 95 }] } },
}), [{ price: 230 }, { price: 95 }]);

const noAlert = { scheduleAlert: null, scheduleAlertDetail: null, scheduleMissCount: 0,
  departureDate: "2028-04-01", arrivalDate: "2028-04-01", departureTime: "09:00", arrivalTime: "11:25" };
const noFare = { price: null, routePrice: null, specific: false };
const notFound = googleScheduleAlertForSearch(noAlert, noFare);
assert.equal(notFound?.scheduleAlert, "price_retry", "No fare is not evidence of flight absence");
assert.equal(googleScheduleAlertForSearch(noAlert, noFare, { googleCount: 0, match: null })?.scheduleAlert, "price_retry");
assert.match(googleScheduleAlertForSearch(noAlert, { ...noFare, error: true })!.scheduleAlertDetail!, /Kontrolli dështoi/);
const exact = { googleCount: 1, match: { departureTime: "09:00", arrivalTime: "11:25",
  departureDate: "2028-04-01", arrivalDate: "2028-04-01" } };
assert.equal(googleScheduleAlertForSearch(noAlert, noFare, exact)?.scheduleAlert, "verified_no_price");
assert.equal(googleScheduleAlertForSearch(noAlert, { ...noFare, routePrice: 95 }, exact)?.scheduleAlert, "verified_no_price", "Alternative fare is not this flight's fare");
assert.equal(googleScheduleAlertForSearch({ ...noAlert, ...notFound }, noFare, exact)?.scheduleAlert, "verified_no_price", "Reclassify legacy suspicion only after fresh exact evidence");
assert.equal(googleScheduleAlertForSearch({ ...noAlert, ...notFound }, { price: 150, routePrice: 95, specific: true }, exact)?.scheduleAlert, null);
assert.equal(googleScheduleAlertForSearch(noAlert, noFare, {
  googleCount: 1, match: { ...exact.match, departureTime: "10:00", arrivalTime: "12:25" },
})?.scheduleAlert, "time_changed", "Changed schedule wins even without fare");
assert.equal(googleScheduleAlertForSearch(noAlert, noFare, {
  googleCount: 1, match: { departureTime: "09:00", arrivalTime: "" },
})?.scheduleAlert, "price_retry", "Incomplete evidence is not verified");
assert.equal(googleScheduleAlertForSearch(noAlert, { ...noFare, routePrice: 95 }, {
  googleCount: 1, match: null, missing: true,
})?.scheduleAlert, "not_found", "Unmatched flight belongs to suspicious even if route has prices");
assert.equal(googleScheduleAlertForSearch({ ...noAlert, scheduleMissCount: 2 }, { ...noFare, routePrice: 95 }, {
  googleCount: 1, match: null, missing: true,
})?.scheduleAlert, "not_found");

const schedule = { fromCity: "TIA", toCity: "BGY", flightNumber: "W6 123",
  departureDate: "2028-04-01", departureTime: "08:00", arrivalDate: "2028-04-01", arrivalTime: "10:00" };
assert.deepEqual(googleDateTime("2028-4-1 8:00"), { date: "2028-04-01", time: "08:00" });
assert.deepEqual(googleDateTime("2028-04-02T00:30:00"), { date: "2028-04-02", time: "00:30" });
assert.equal(googleDateTime("08:00"), null, "Time-only upstream must not invent dates");
for (const malformed of ["2028-02-30 08:00", "2028-04-01 25:00", "2028-04-01 08:61", "garbage", "2028-04-01T08:00:99"]) {
  assert.throws(() => googleDateTime(malformed), /Invalid Google datetime/);
}
assert.equal(matchingGoogleSchedule([schedule], schedule), schedule);
for (const invalid of [
  [{ ...schedule, toCity: "BER" }], [{ ...schedule, departureDate: "2028-04-02" }],
  [{ ...schedule, flightNumber: "FR999" }], [schedule, { ...schedule, arrivalTime: "10:30" }],
]) assert.equal(matchingGoogleSchedule(invalid, schedule), null, "Only unique code+route+date is evidence");
assert.ok(matchingGoogleSchedule([schedule, { ...schedule }], schedule), "identical fares deduplicate");
const suspect = { ...schedule, id: 1, scheduleAlert: null, scheduleAlertDetail: null,
  alertDismissedAt: null, status: "open" };
const alternatives = [{ ...schedule, flightNumber: "FR999" }];
const missingEvidence = googleScheduleSearchEvidence(alternatives, suspect);
assert.equal(missingEvidence.missing, true);
for (const flights of [[], [{ ...schedule, arrivalTime: "" }],
  [schedule, { ...schedule, arrivalTime: "10:30" }]]) {
  const evidence = googleScheduleSearchEvidence(flights, suspect);
  assert.equal(evidence.missing, false, "empty/incomplete/ambiguous is not absence");
  assert.equal(googleScheduleAlertForSearch({ ...suspect, scheduleMissCount: 3 }, noFare, evidence)?.scheduleMissCount, 3);
}
assert.equal(googleScheduleAlertForSearch({ ...suspect, scheduleMissCount: 3 },
  { price: 123, routePrice: 90, specific: true }, missingEvidence)?.scheduleAlert, "price_retry",
  "known exact fare with missing schedule cannot prove absence");
const verifiedChange = { ...suspect, scheduleAlert: "time_changed", scheduleAlertDetail: "verified full dates", scheduleMissCount: 3 };
assert.equal(googleScheduleAlertForSearch(verifiedChange, noFare,
  googleScheduleSearchEvidence([schedule], suspect))?.scheduleAlert, "time_changed",
  "an exact schedule without fare does not acknowledge the existing schedule notification");
for (const fresh of [noFare, { ...noFare, error: true }]) {
  const unchanged = googleScheduleAlertForSearch(verifiedChange, fresh, { googleCount: 0, match: null });
  assert.equal(unchanged?.scheduleAlert, "time_changed");
  assert.equal(unchanged?.scheduleAlertDetail, verifiedChange.scheduleAlertDetail);
  assert.equal(unchanged?.scheduleMissCount, 3);
}
let state;
let current = { ...suspect, scheduleMissCount: 0 };
for (let attempt = 1; attempt <= 5; attempt++) {
  const next = googleScheduleAlertForSearch(current, noFare, missingEvidence)!;
  state = nextRecheck(current, state, { flights: alternatives });
  current = { ...current, ...next };
  state.identity = recheckIdentity(current);
  assert.equal(state.missingChecks, attempt);
}
assert.equal(current.scheduleAlert, "not_found");
assert.equal(state?.missingChecks, 5);
for (const result of [{ flights: [] }, { flights: alternatives, error: true },
  { flights: alternatives, schedulesReliable: false }]) {
  assert.equal(nextRecheck(current, state, result).missingChecks, 5);
}
assert.equal(nextRecheck(current, state, { flights: [schedule] }).missingChecks, 0);
assert.equal(googleScheduleAlertForSearch(current, { price: 123, routePrice: 90, specific: true },
  googleScheduleSearchEvidence([schedule], current))?.scheduleAlert, null,
  "exact recovery clears suspicion");
const wrongArrival = { ...schedule, arrivalDate: "2028-04-02" };
const dateOnly = googleScheduleAlertForSearch({ ...noAlert, ...wrongArrival, departureTime: "09:00", arrivalTime: "11:25" }, noFare,
  { googleCount: 1, match: schedule })!;
assert.equal(dateOnly.scheduleAlert, "time_changed", "Date-only correction uses existing changed-schedule alert");
assert.match(dateOnly.scheduleAlertDetail!, /Mbërritja 2028-04-02 11:25→2028-04-01 10:00/);
const oldDateOnly = { ...noAlert, ...wrongArrival, departureTime: "08:00", arrivalTime: "10:00" };
const trueDateOnly = googleScheduleAlertForSearch(oldDateOnly, noFare, { googleCount: 1, match: schedule })!;
assert.equal(trueDateOnly.scheduleAlert, "time_changed");
assert.deepEqual(googleScheduleChanges(wrongArrival, schedule),
  [{ field: "Data e Mbërritjes", old: "2028-04-02", new: "2028-04-01" }]);
const parsed = parseGoogleScheduleAlert(trueDateOnly.scheduleAlertDetail!)!;
assert.deepEqual(parsed, { departureDate: schedule.departureDate, departureTime: schedule.departureTime,
  arrivalDate: schedule.arrivalDate, arrivalTime: schedule.arrivalTime });
const evidence = { identity: scheduleIdentity(wrongArrival), schedule };
assert.deepEqual(validatedGoogleSync(wrongArrival, evidence, parsed), parsed, "Sync applies exact dates and times");
assert.throws(() => validatedGoogleSync({ ...wrongArrival, arrivalDate: "2028-04-03" }, evidence, parsed), /vjetruar/);
assert.throws(() => validatedGoogleSync(wrongArrival, evidence, { ...parsed, arrivalDate: "2028-04-02" }), /përputhet/);
assert.throws(() => validatedGoogleSync(schedule, { identity: scheduleIdentity(schedule), schedule: wrongArrival }, wrongArrival),
  /nuk mund të aplikohet/, "No silently normalized multi-day schedule");
const overnight = { ...schedule, departureTime: "23:30", arrivalTime: "00:30", arrivalDate: "2028-04-02" };
assert.equal(validatedGoogleSync(schedule, { identity: scheduleIdentity(schedule), schedule: overnight }, overnight).arrivalDate, "2028-04-02");
assert.throws(() => validatedGoogleSync(schedule, { identity: scheduleIdentity(schedule),
  schedule: { ...schedule, arrivalTime: "16:00" } }, { ...schedule, arrivalTime: "16:00" }), /5 orë/);
assert.equal(parseGoogleScheduleAlert("Nisja 08:00→09:00"), null, "Old partial alert requires recheck");

console.log("Google price cache / full Google schedule policy tests: OK");