import assert from "node:assert/strict";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { googleLookupFailure } from "../src/lib/googleLookupDiagnostic.js";
import { testGooglePriceWarmerQueue } from "./googlePriceWarmerQueue.test.js";

await testGooglePriceWarmerQueue();

assert.equal(googleLookupFailure(new Error("request containing secret"), "fetch"), "network_error");
assert.equal(googleLookupFailure(new SyntaxError("private upstream body"), "json"), "invalid_json");
const timeout = new Error("private request");
timeout.name = "TimeoutError";
assert.equal(googleLookupFailure(timeout, "fetch"), "timeout");
assert.equal(googleLookupFailure(new Error("Google search returned an application error"), "parse"), "provider_error");
assert.equal(googleLookupFailure(new Error("untrusted private payload"), "parse"), "invalid_response");

// Directly exercise route handlers/warmers, with an in-memory DB and mocked
// upstream. No HTTP listener, production credentials, database writes or cron.
process.env.DATABASE_URL = "postgresql://google-price-test.invalid/test";
process.env.RAPIDAPI_KEY = "REPLACE_WITH_YOUR_VALUE";
process.env.LOG_LEVEL = "silent";
delete process.env.NOTIFY_EMAIL;
const { db, pool } = await import("@workspace/db");
const {
  default: router, fetchGoogleFlightSchedules, warmSoonFlights, recordFlightChange,
  runNoPriceCheckNow, runStalePriceCheckNow, stalePriceRunProgress,
  applyGooglePriceRulesToFlights, runDailyForcedGooglePriceRefresh,
  runNewPriceCheckNow, newPriceRunProgress,
} = await import("../src/routes/flights.js");
const { applyGoogleSearchScheduleAlert, applyStoredGoogleScheduleSync } = await import("../src/lib/googleScheduleAlerts.js");
const { scheduleEvidenceKey } = await import("../src/lib/googleScheduleEvidence.js");
const { noGoogleRuleFlightsSql } = await import("../src/lib/noGoogleRuleFlights.js");
const { googleMonitoringDisabled, googleMonitoringFlights, googleMonitoringEnabledSql } =
  await import("../src/lib/googleMonitoringPolicy.js");

type Row = Record<string, any>;
const date = "2028-04-01";
const flight: Row = {
  id: 1, fromCity: "TIA", toCity: "BGY", departureDate: date,
  flightNumber: "W6 123", airline: "WIZZ AIR", adultPrice: "180",
  childPrice: "180", citizenPrice: "180", status: "open",
  excludeFromGoogleRule: false, seatMissCount: 0, scheduleMissCount: 0,
  departureTime: "08:00", arrivalTime: "10:00", arrivalDate: date,
  scheduleAlert: null, scheduleAlertDetail: null, scheduleCheckedAt: null,
  alertDismissedAt: null, seatAlert: null,
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
};
let flights: Row[] = [flight];
let rules: Row[] = [];
const cache = new Map<string, Row>();
const monitoringSettings = new Map<string, Row>();
const key = `TIA|BGY|${date}|W6123`;
const routeKey = `TIA|BGY|${date}|`;
const flightWrites: Row[] = [];
const scheduleHistory: Row[] = [];
const predicates: string[] = [];
const dialect = new PgDialect();
const oldSelect = db.select;
const oldInsert = db.insert;
const oldUpdate = db.update;
const oldTransaction = db.transaction;
const oldDelete = db.delete;
const oldFetch = globalThis.fetch;

const dbRows = (table: any): Row[] => {
  switch (getTableName(table)) {
    case "flights": return flights;
    case "google_price_cache": return [...cache.values()];
    case "google_price_rules": return rules;
    case "settings": return [...monitoringSettings.values()];
    default: return [];
  }
};
(db as any).select = () => ({
  from: (table: any) => {
    let selectedId: number | undefined;
    let selectedKey: string | undefined;
    let selectedKeys: string[] | undefined;
    const rows = () => dbRows(table)
      .filter(row => (selectedId == null || row.id === selectedId) &&
        (selectedKey == null || row.key === selectedKey) &&
        (selectedKeys == null || selectedKeys.includes(row.key))).map(row => ({ ...row }));
    const chain: any = {
      where: (predicate: any) => {
        if (getTableName(table) === "settings") {
          const query = dialect.sqlToQuery(predicate);
          if (query.sql === '"settings"."key" = $1') selectedKey = String(query.params[0]);
          if (query.sql.includes('"settings"."key" in (')) selectedKeys = query.params.map(String);
        }
        if (getTableName(table) === "flights") {
          const query = dialect.sqlToQuery(predicate);
          predicates.push(query.sql);
          if (query.sql === '"flights"."id" = $1') selectedId = Number(query.params[0]);
        }
        return chain;
      },
      orderBy: () => chain,
      limit: () => chain,
      for: (mode: string) => { assert.equal(mode, "update"); return chain; },
      then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
    };
    return chain;
  },
});
(db as any).insert = (table: any) => ({
  values: (values: Row) => ({
    then: (resolve: any, reject: any) => {
      if (getTableName(table) === "flight_change_history") scheduleHistory.push(values);
      return Promise.resolve().then(resolve, reject);
    },
    onConflictDoUpdate: async ({ set }: { set: Row }) => {
      if (getTableName(table) === "settings") {
        if (values.key.startsWith("googleMonitoringDisabled.") || values.key.startsWith("googleScheduleEvidence.")
          || values.key.startsWith("stalePriceRetry.") || values.key.startsWith("suspectFlightRecheck."))
          monitoringSettings.set(values.key, { ...values, ...set });
        return;
      }
      assert.equal(getTableName(table), "google_price_cache");
      const old = cache.get(values.cacheKey);
      cache.set(values.cacheKey, old
        ? { ...old, ...set, prevPrice: old.price ?? old.prevPrice }
        : { candidatePrice: null, candidateAt: null, ...values });
    },
  }),
});
(db as any).update = (table: any) => ({
  set: (values: Row) => {
    const chain = {
      then: (resolve: any, reject: any) => {
        if (getTableName(table) === "google_price_cache") {
          for (const row of cache.values()) Object.assign(row, values);
        }
        return Promise.resolve().then(resolve, reject);
      },
      where: (predicate: any) => {
      const apply = () => {
        if (getTableName(table) !== "flights") return [];
        const id = Number(dialect.sqlToQuery(predicate).params[0]);
        const current = flights.find(row => row.id === id);
        flightWrites.push(values);
        if (current) {
          // Ignore SQL expressions, such as the pinned updatedAt column.
          for (const [key, value] of Object.entries(values)) {
            if (!(value && typeof value === "object" && "queryChunks" in value)) current[key] = value;
          }
        }
        return current ? [{ ...current }] : [];
      };
      return {
        returning: async () => apply(),
        then: (resolve: any, reject: any) => Promise.resolve(apply()).then(resolve, reject),
      };
      },
    };
    return chain;
  },
});
(db as any).transaction = async (callback: any) => callback(db);
(db as any).delete = () => ({
  where: async (predicate: any) => {
    const query = dialect.sqlToQuery(predicate);
    monitoringSettings.delete(String(query.params[0]));
  },
});

const emptyPayload = { status: true, data: { itineraries: { topFlights: [], otherFlights: [] } } };
let payload: unknown = emptyPayload;
let transportError = false;
let httpError = false;
let onFetch: (() => void) | null = null;
globalThis.fetch = async () => {
  onFetch?.();
  if (transportError) throw new Error("upstream unavailable");
  return { ok: !httpError, json: async () => payload } as Response;
};

async function request(path: string, query: Row = {}, body: Row = {}, params: Row = {}, role = "admin") {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === path);
  assert.ok(layer, `Route ${path} exists`);
  let output: any;
  let status = 200;
  const res: any = {
    status: (value: number) => { status = value; return res; },
    json: (value: any) => { output = value; return res; },
  };
  await layer.route.stack[0].handle({ query, body, params, session: { userId: 1, role } }, res);
  return { status, body: output };
}

async function waitUntilDone(progress: { running: boolean }, maxPolls = 200) {
  for (let i = 0; progress.running && i < maxPolls; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(progress.running, false, "Background test operation completed");
}

async function waitForManualCheck() {
  for (let i = 0; i < 200; i++) {
    const progress = (await request("/flights/check-google-progress")).body;
    if (!progress.running) return progress;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail("Selected manual check did not finish");
}

try {
  const unassignedWithoutRulesSql = dialect.sqlToQuery(await noGoogleRuleFlightsSql(`${date} 00:00`)).sql;
  assert.match(unassignedWithoutRulesSql, /"flights"\."exclude_from_google_rule" IS NOT TRUE/,
    "the no-active-rules SQL branch excludes online-excluded flights");
  // DB-cold then memory-warm single/bulk reads mask legacy numeric stale rows.
  cache.set(key, {
    cacheKey: key, price: "180", routePrice: "95", specific: true, stale: true,
    fetchedAt: new Date(), candidatePrice: "230", candidateAt: new Date(),
  });
  const query = { from: "TIA", to: "BGY", date, flightNumber: "W6 123" };
  const bulkOnlyKey = `TIA|BGY|${date}|FR456`;
  const bulkOnlyFlight = { ...flight, id: 2, flightNumber: "FR456" };
  cache.set(bulkOnlyKey, { ...cache.get(key), cacheKey: bulkOnlyKey });
  flights = [flight, bulkOnlyFlight];
  for (let i = 0; i < 2; i++) {
    const single = (await request("/flights/google-price", query)).body;
    assert.equal(single.price, null);
    assert.equal(single.routePrice, null);
    assert.equal(single.specific, false);
    assert.equal(single.stale, true);
    const bulk = (await request("/flights/google-prices-bulk")).body;
    assert.equal(bulk[0].price, null);
    assert.equal(bulk[0].stale, true);
    assert.equal(bulk.find((row: Row) => row.flightId === 2).price, null);
    assert.equal(bulk.find((row: Row) => row.flightId === 2).stale, true);
  }
  flights = [flight];
  const candidate = (await request("/flights/new-prices-bulk")).body[0];
  assert.equal(candidate.price, null);
  assert.equal(candidate.stale, true);
  assert.equal(candidate.candidatePrice, 230, "Saved/candidate remain independent");
  const live = (await request("/flights/:id/google-price/live", {}, {}, { id: 1 })).body;
  assert.equal(live.savedGooglePrice, null, "Live peek also masks saved legacy stale numbers");
  assert.equal(live.newGooglePrice, null);
  assert.equal(live.stale, false, "A valid empty live search is verified");
  assert.equal(flightWrites.length, 0, "Cache reads and read-only live peeks never backfill alerts");
  const historicNullKey = `TIA|BGY|${date}|FRHIST`;
  cache.set(historicNullKey, { cacheKey: historicNullKey, price: null, stale: false, fetchedAt: new Date(0) });
  const historicRead = (await request("/flights/google-price", { ...query, flightNumber: "FRHIST" })).body;
  assert.equal(historicRead.price, null);
  assert.equal(flightWrites.length, 0, "Historic null cache is not evidence of a new successful lookup");

  // Missing schema/app failures are errors; valid empty arrays are not.
  for (const invalid of [{}, { ...emptyPayload, status: false }, { data: { itineraries: { topFlights: [] } } }]) {
    payload = invalid;
    assert.equal((await fetchGoogleFlightSchedules("TIA", "BGY", date)).error, true);
  }
  payload = emptyPayload;
  const validEmpty = await fetchGoogleFlightSchedules("TIA", "BGY", date);
  assert.equal(validEmpty.error, undefined);
  assert.equal(validEmpty.routePrice, null);
  const fullPayload = (arrival = `${date} 10:00`) => ({ data: { itineraries: { topFlights: [{
    price: 120, flights: [{ flight_number: flight.flightNumber,
      departure_airport: { id: "TIA", time: `${date} 08:00` },
      arrival_airport: { id: "BGY", time: arrival } }],
  }], otherFlights: [] } } });
  payload = fullPayload();
  const fullSearch = await fetchGoogleFlightSchedules("TIA", "BGY", date);
  assert.equal(fullSearch.flights[0].departureDate, date);
  assert.equal(fullSearch.flights[0].arrivalDate, date);
  // Actual upstream format observed in the BGY→TIA 19 December incident.
  payload = { status: true, data: { itineraries: { topFlights: [{
    price: 120, flights: [{ flight_number: "W4 5020",
      departure_airport: { airport_name: "Milan Bergamo", airport_code: "BGY", time: "2026-12-19 21:45" },
      arrival_airport: { airport_name: "Tirana", airport_code: "TIA", time: "2026-12-19 23:30" } }],
  }], otherFlights: [{
    price: 130, flights: [{ flight_number: "W4 5020",
      departure_airport: { airport_code: "BGY", time: "2026-12-19 21:45" },
      arrival_airport: { airport_code: "TIA", time: "2026-12-19 23:30" } }],
  }] } } };
  const realFormat = await fetchGoogleFlightSchedules("BGY", "TIA", "2026-12-19");
  assert.equal(realFormat.error, undefined);
  assert.equal(realFormat.schedulesReliable, true);
  assert.equal(realFormat.flights.length, 2);
  const { matchingGoogleSchedule, googleScheduleSearchEvidence } = await import("../src/lib/googleScheduleEvidence.js");
  const realFlight = { fromCity: "BGY", toCity: "TIA", flightNumber: "W4 5020", departureDate: "2026-12-19" };
  const realMatch = matchingGoogleSchedule(realFormat.flights, realFlight);
  assert.equal(realMatch?.arrivalTime, "23:30", "identical fares still uniquely match the schedule");
  assert.equal(realMatch?.departureDate, "2026-12-19");
  assert.equal(googleScheduleSearchEvidence(realFormat.flights, realFlight).missing, false);
  assert.equal(matchingGoogleSchedule([...realFormat.flights,
    { ...realFormat.flights[0], arrivalTime: "23:35" }], realFlight), null, "conflicting schedule remains ambiguous");
  payload = fullPayload("2028-04-02 00:30");
  assert.equal((await fetchGoogleFlightSchedules("TIA", "BGY", date)).flights[0].arrivalDate, "2028-04-02");
  for (const malformed of ["2028-02-30 10:00", "2028-04-01 25:00", "untrusted date"]) {
    payload = fullPayload(malformed);
    assert.equal((await fetchGoogleFlightSchedules("TIA", "BGY", date)).error, true);
  }
  payload = emptyPayload;
  const apiKey = process.env.RAPIDAPI_KEY;
  delete process.env.RAPIDAPI_KEY;
  assert.equal((await fetchGoogleFlightSchedules("TIA", "BGY", date)).error, true);
  process.env.RAPIDAPI_KEY = apiKey;

  // Warmers clear old prices on valid empty and keep candidate data untouched.
  await warmSoonFlights();
  assert.equal(cache.get(key)?.price, null);
  assert.equal(cache.get(key)?.stale, false);
  assert.equal(cache.get(key)?.candidatePrice, "230");
  assert.equal(cache.get(key)?.prevPrice, "180");
  assert.equal((await request("/flights/google-price", query)).body.stale, false);
  assert.equal(flight.scheduleAlert, "price_retry");
  assert.equal(flight.status, "open");

  // Known exact price wins over a cheaper alternative even without schedule times.
  payload = {
    data: { itineraries: {
      topFlights: [{ price: 230, flights: [{ flight_number: "W6 123" }] }],
      otherFlights: [{ price: 95, flights: [{ flight_number: "FR456" }] }],
    } },
  };
  await warmSoonFlights();
  assert.equal(Number(cache.get(key)?.price), 230);
  assert.equal(cache.get(key)?.specific, true);
  assert.equal(Number(cache.get(key)?.routePrice), 95);
  assert.equal(flight.scheduleAlert, "price_retry", "An exact fare without full schedule cannot classify absence");
  payload = {
    data: { itineraries: {
      topFlights: [{ price: 110, flights: [{ flight_number: "FR456" }] }], otherFlights: [],
    } },
  };
  await warmSoonFlights();
  assert.equal(Number(cache.get(key)?.price), 110);
  assert.equal(cache.get(key)?.specific, false);

  // A first-ever failed lookup creates null/stale rows, not missing/null-fresh.
  flight.flightNumber = "FR999";
  const failedKey = `TIA|BGY|${date}|FR999`;
  flightWrites.length = 0;
  transportError = true;
  await assert.rejects(warmSoonFlights(), /refreshes failed/);
  assert.equal(cache.get(failedKey)?.price, null);
  assert.equal(cache.get(failedKey)?.stale, true);
  assert.equal(cache.get(routeKey)?.price, null);
  assert.equal(cache.get(routeKey)?.stale, true);
  assert.equal((await request("/flights/google-price", { ...query, flightNumber: "FR999" })).body.stale, true);

  // Real scheduler SQL includes null failed rows exclusively in stale, and null
  // flight-number keys are normalized identically to the cache writer.
  flights = [];
  await runNoPriceCheckNow();
  const noPriceSql = predicates.at(-1)!;
  assert.match(noPriceSql, /"price" IS NOT NULL OR .*"stale" = TRUE/);
  assert.match(noPriceSql, /COALESCE\("flights"\."flight_number", ''\)/);
  await runStalePriceCheckNow();
  await waitUntilDone(stalePriceRunProgress);
  const staleSql = predicates.at(-1)!;
  assert.match(staleSql, /"stale" = TRUE/);
  assert.doesNotMatch(staleSql, /"price" IS NOT NULL/);

  // Selected manual failures also write null/unverified while leaving alerts and
  // sale prices untouched, including when the flight has no saved price.
  flights = [flight];
  flight.flightNumber = "U21234";
  const manual = await request("/flights/check-google-selected", {}, { flightIds: [1] });
  assert.equal(manual.status, 200);
  await waitForManualCheck();
  assert.equal(cache.get(`TIA|BGY|${date}|U21234`)?.stale, true);
  assert.equal(cache.get(`TIA|BGY|${date}|U21234`)?.price, null);
  assert.ok(flightWrites.every(w => w.adultPrice === undefined && w.status === undefined), "Errors change monitoring only");
  flightWrites.length = 0;
  const failedLive = (await request("/flights/:id/google-price/live", {}, {}, { id: 1 })).body;
  assert.equal(failedLive.newGooglePrice, null);
  assert.equal(failedLive.stale, true);
  flight.flightNumber = "FR999";

  // Rule application must not resurrect a stale number or older route price.
  rules = [{
    id: 1, active: true, flightIds: [], fromCity: null, toCity: null,
    airline: null, applyInternal: true, applyOffline: true,
    tiers: [{ minPrice: 0, maxPrice: null, value: 20 }],
    discountType: "percent", roundToFive: false,
  }];
  assert.match(dialect.sqlToQuery(await noGoogleRuleFlightsSql(`${date} 00:00`)).sql,
    /"flights"\."exclude_from_google_rule" IS NOT TRUE/,
    "the active-rules SQL branch also excludes online-excluded flights");
  cache.set(failedKey, { ...cache.get(failedKey), price: "180", stale: true });
  cache.set(routeKey, { ...cache.get(routeKey), price: "95", stale: false });
  await applyGooglePriceRulesToFlights("test", { suppressEmail: true });
  assert.equal(flightWrites.length, 0, "Unverified Google data never rewrites sale/offline prices");
  const coldFlight = { ...flight, toCity: "FCO" };
  flights = [coldFlight];
  cache.set(`TIA|FCO|${date}|FR999`, {
    cacheKey: `TIA|FCO|${date}|FR999`, price: "180", stale: true,
  });
  cache.set(`TIA|FCO|${date}|`, {
    cacheKey: `TIA|FCO|${date}|`, price: "95", stale: false,
  });
  await applyGooglePriceRulesToFlights("test", { suppressEmail: true });
  assert.equal(flightWrites.length, 0, "DB-only legacy stale rows block an old route fallback");
  flights = [flight];
  transportError = false;
  payload = emptyPayload;
  await warmSoonFlights();
  await applyGooglePriceRulesToFlights("test", { suppressEmail: true });
  const assertMonitoringOnly = () => {
    for (const write of flightWrites) {
      for (const field of ["status", "seatAlert", "seatAlertDetail", "adultPrice", "childPrice", "citizenPrice", "alertDismissedAt"]) {
        assert.equal(write[field], undefined, `Google no-price does not write ${field}`);
      }
    }
    assert.equal(flight.status, "open");
    assert.equal(flight.adultPrice, "180");
  };
  assertMonitoringOnly();
  assert.equal((await request("/flights/google-price", { ...query, flightNumber: "FR999" })).body.stale, false);
  const syncEmpty = await request("/flights/sync-google-prices", {}, {
    flightIds: [1], minimum: 0, above: 0, percent: 0, fallback: 250,
  });
  assert.equal(syncEmpty.body.updated, 0, "No Google fare must not apply a sale-price fallback");
  assert.equal(syncEmpty.body.results[0].newPrice, null);
  assertMonitoringOnly();
  await request("/flights/check-google-selected", {}, { flightIds: [1] });
  const selectedEmpty = await waitForManualCheck();
  assert.equal(selectedEmpty.summary.prices[0].googlePrice, null);
  assert.equal(selectedEmpty.summary.prices[0].wouldBePrice, null);
  assert.equal(cache.get(failedKey)?.price, null);
  assert.equal(cache.get(failedKey)?.stale, false, "Valid manual empty results are verified");
  assert.equal(flight.scheduleAlert, "price_retry", "Empty manual checks never classify flight absence");
  assertMonitoringOnly();

  // Every saved-price lookup path flags a NEW valid no-price observation,
  // including excluded-online flights; no history/null-cache backfill is used.
  rules = [];
  flight.excludeFromGoogleRule = true;
  const warmers = [
    { name: "soon", run: () => warmSoonFlights() },
    { name: "no-price", run: () => runNoPriceCheckNow() },
    { name: "stale", run: async () => { await runStalePriceCheckNow(); await waitUntilDone(stalePriceRunProgress); } },
    { name: "full", run: () => runDailyForcedGooglePriceRefresh() },
    { name: "manual", run: async () => { await request("/flights/check-google-selected", {}, { flightIds: [1] }); await waitForManualCheck(); } },
    { name: "sync", run: () => request("/flights/sync-google-prices", {}, { flightIds: [1] }) },
  ];
  // Sync excludes excluded-online rows in production SQL; exercise it on a
  // normal flight and the monitoring warmers on an excluded one.
  for (const warmer of warmers) {
    flight.excludeFromGoogleRule = warmer.name !== "sync";
    for (const valid of [
      emptyPayload,
      { data: { itineraries: { topFlights: [{
        flights: [{ flight_number: "FR999",
          departure_airport: { id: "TIA", time: `${date} 08:00` },
          arrival_airport: { id: "BGY", time: `${date} 10:00` } }],
      }], otherFlights: [] } } },
    ]) {
      flight.scheduleAlert = null;
      flight.scheduleAlertDetail = null;
      flight.scheduleCheckedAt = null;
      flight.alertDismissedAt = null;
      flight.seatAlert = "low_seats";
      flight.seatAlertDetail = "existing seat info";
      flight.seatMissCount = 2;
      flightWrites.length = 0;
      payload = valid;
      monitoringSettings.delete(`stalePriceRetry.${flight.id}`);
      await warmer.run();
      assert.equal(flight.scheduleAlert, valid === emptyPayload ? "price_retry" : "verified_no_price", `${warmer.name}: fare absence does not mean flight absence`);
      assert.equal(flight.seatAlert, "low_seats", `${warmer.name}: keeps unrelated seat alert`);
      assert.equal(flight.seatMissCount, 2);
      assertMonitoringOnly();
      assert.ok(flightWrites.length > 0);
    }
    const invalidPayloads: unknown[] = [
      {}, { ...emptyPayload, status: false }, { ...emptyPayload, error: "quota exceeded" },
      { data: { itineraries: { topFlights: [{ flights: [null] }], otherFlights: [] } } },
      { data: { itineraries: { topFlights: [{ flights: {} }], otherFlights: [] } } },
      { data: { itineraries: { topFlights: [{ price: "invalid" }], otherFlights: [] } } },
      "network", "http",
    ];
    for (const invalid of invalidPayloads) {
      payload = invalid;
      transportError = invalid === "network";
      httpError = invalid === "http";
      // Missing-schema tests check both creating and clearing; the full error
      // matrix also verifies preserving an already-flagged warning.
      for (const existing of invalid === invalidPayloads[0] ? [null, "not_found", "time_changed"] : ["not_found"]) {
        flight.scheduleAlert = existing;
        flight.scheduleAlertDetail = existing ? "existing detail" : null;
        flightWrites.length = 0;
        monitoringSettings.delete(`stalePriceRetry.${flight.id}`);
        await warmer.run().catch(() => {});
        assert.equal(flight.scheduleAlert, existing === "time_changed" ? "time_changed" : "price_retry", `${warmer.name}: errors retry without hiding a verified schedule change`);
        if (existing === "time_changed") assert.equal(flight.scheduleAlertDetail, "existing detail");
        else assert.match(flight.scheduleAlertDetail, /gabim teknik/);
        assert.ok(flightWrites.every(w => w.adultPrice === undefined && w.status === undefined));
        assert.equal(flight.seatAlert, "low_seats");
        assert.equal(flight.status, "open");
      }
    }
    transportError = httpError = false;
  }

  // Stronger time-change details stay intact even on zero itineraries.
  payload = emptyPayload;
  flight.scheduleAlert = "time_changed";
  flight.scheduleAlertDetail = "Nisja 08:00→09:00";
  flight.scheduleCheckedAt = null;
  await warmSoonFlights();
  assert.equal(flight.scheduleAlert, "time_changed");
  assert.equal(flight.scheduleAlertDetail, "Nisja 08:00→09:00");

  // Real Confirm endpoint preserves status, clears both alerts, and keeps the
  // dismissal stamp on recovery. Only a subsequent fresh no-price check reflags.
  await request("/flights/:id/dismiss-alert", {}, {}, { id: 1 });
  const dismissedAt = flight.alertDismissedAt;
  assert.ok(dismissedAt instanceof Date);
  assert.equal(flight.scheduleAlert, null);
  assert.equal(flight.seatAlert, null);
  assert.equal(flight.status, "open");
  await new Promise(resolve => setTimeout(resolve, 5));
  payload = { data: { itineraries: { topFlights: [{ price: 110 }], otherFlights: [] } } };
  await warmSoonFlights();
  assert.equal(flight.scheduleAlert, "price_retry", "A price without flight identity is not verification");
  assert.equal(flight.alertDismissedAt, dismissedAt);
  payload = emptyPayload;
  await warmSoonFlights();
  assert.equal(flight.scheduleAlert, "price_retry");
  assert.equal(flight.alertDismissedAt, dismissedAt, "Reflagging does not erase acknowledgement history");

  // Stale response races: dismissal, identity/date/time edits, or a newer
  // successful check must not resurrect a warning.
  await request("/flights/:id/dismiss-alert", {}, {}, { id: 1 });
  await new Promise(resolve => setTimeout(resolve, 5));
  flight.scheduleCheckedAt = null;
  onFetch = () => { flight.alertDismissedAt = new Date(); };
  await warmSoonFlights();
  onFetch = null;
  assert.equal(flight.scheduleAlert, null, "Confirm during an upstream request wins");
  const snapshot = { ...flight };
  const startedAt = new Date(Date.now() + 1);
  const noFare = { price: null, routePrice: null, specific: false };
  for (const [field, changed] of [
    ["fromCity", "FCO"], ["toCity", "BER"], ["flightNumber", "FR123"],
    ["departureDate", "2028-04-02"], ["departureTime", "09:00"], ["arrivalTime", "11:00"], ["arrivalDate", "2028-04-02"],
    ["alertDismissedAt", new Date(Date.now() + 10)], ["scheduleCheckedAt", new Date(Date.now() + 10)],
    ["status", "soldout"],
  ] as const) {
    const old = flight[field];
    flight[field] = changed;
    flightWrites.length = 0;
    assert.equal(await applyGoogleSearchScheduleAlert(snapshot as never, startedAt, noFare), null);
    assert.equal(flightWrites.length, 0, `${field} changed: old result skipped under row lock`);
    flight[field] = old;
  }
  flightWrites.length = 0;
  await applyGoogleSearchScheduleAlert(snapshot as never, startedAt, { ...noFare, error: true });
  assert.equal(flight.scheduleAlert, "price_retry", "Central helper enrolls technical uncertainty for scheduled retries");
  // Neither five technical retries nor five exact unpriced schedules can become
  // a missing-flight notification. Keep counters separate and recovery live.
  const retryStorageKey = `stalePriceRetry.${flight.id}`;
  const recheckStorageKey = `suspectFlightRecheck.${flight.id}`;
  Object.assign(flight, { scheduleAlert: null, scheduleAlertDetail: null, scheduleMissCount: 0,
    scheduleCheckedAt: null, alertDismissedAt: null });
  monitoringSettings.delete(retryStorageKey);
  monitoringSettings.delete(recheckStorageKey);
  const exactSchedule = { ...flight };
  for (const technical of [true, false]) {
    for (let attempt = 1; attempt <= 6; attempt++) {
      const storedRetry = monitoringSettings.get(retryStorageKey);
      if (storedRetry) {
        const state = JSON.parse(storedRetry.value);
        storedRetry.value = JSON.stringify({ ...state, checkedAt: 0 });
      }
      flight.scheduleCheckedAt = null;
      const result = await applyGoogleSearchScheduleAlert({ ...flight } as never, new Date(),
        { ...noFare, error: technical },
        { googleCount: technical ? 0 : 1, match: technical ? null : exactSchedule },
        db, 7);
      assert.equal(result?.scheduleAlert, technical ? "price_retry" : "verified_no_price");
      assert.equal(result?.scheduleMissCount, 0);
      assert.equal(result?.missingChecks, 0);
      assert.equal(result?.possibleCancellation, false);
    }
  }
  flight.scheduleCheckedAt = null;
  await applyGoogleSearchScheduleAlert({ ...flight } as never, new Date(),
    { price: 123, routePrice: 90, specific: true },
    { googleCount: 1, match: exactSchedule });
  assert.equal(flight.scheduleAlert, null);
  assert.equal(monitoringSettings.has(retryStorageKey), false, "exact recovery removes retry metadata");
  const absentSchedule = { ...exactSchedule, flightNumber: "W45020" };
  assert.equal(googleScheduleSearchEvidence([absentSchedule], flight as never).missing, true,
    "complete alternative supplies positive absence evidence");
  for (let attempt = 1; attempt <= 5; attempt++) {
    flight.scheduleCheckedAt = null;
    const result = await applyGoogleSearchScheduleAlert({ ...flight } as never, new Date(), noFare,
      googleScheduleSearchEvidence([absentSchedule], flight as never));
    assert.equal(result?.missingChecks, attempt, "all writers share the true-missing counter");
    assert.equal(result?.possibleCancellation, attempt === 5);
    assert.equal(result?.scheduleAlert, "not_found");
  }
  flight.scheduleCheckedAt = null;
  await applyGoogleSearchScheduleAlert({ ...flight } as never, new Date(),
    { price: 123, routePrice: 90, specific: true },
    { googleCount: 1, match: exactSchedule });
  assert.equal(flight.scheduleAlert, null);
  assert.equal(flight.scheduleMissCount, 0);

  // Exercise the REAL candidate loop, including its failed-lookup continue:
  // stale checks must finish between two candidate groups, not after the full
  // candidate dataset. Mock upstream only; retain the production FIFO/limiter.
  rules = [];
  const testFetch = globalThis.fetch;
  for (const failedLookup of [true, false]) {
    for (const storedKey of monitoringSettings.keys()) {
      if (storedKey.startsWith("stalePriceRetry.")) monitoringSettings.delete(storedKey);
    }
    Object.assign(flight, { scheduleCheckedAt: null, scheduleAlert: null,
      scheduleAlertDetail: null, scheduleMissCount: 0, alertDismissedAt: null });
    flights = [flight, { ...flight, id: 2, toCity: "FCO", flightNumber: "FR999" }];
    const routeOrder: string[] = [];
    let releaseFirst!: () => void;
    let signalFirst!: () => void;
    const firstSeen = new Promise<void>(resolve => { signalFirst = resolve; });
    const firstBlocked = new Promise<void>(resolve => { releaseFirst = resolve; });
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("adults") === "1") {
        routeOrder.push(url.searchParams.get("arrival_id")!);
        if (routeOrder.length === 1) {
          signalFirst();
          await firstBlocked;
        }
      }
      if (failedLookup) throw new Error("mock upstream failure");
      return { ok: true, json: async () => emptyPayload } as Response;
    };
    assert.equal((await runNewPriceCheckNow()).started, true);
    await firstSeen;
    try {
      assert.equal((await runStalePriceCheckNow()).started, true);
    } finally {
      releaseFirst();
    }
    await waitUntilDone(stalePriceRunProgress, 1000);
    await waitUntilDone(newPriceRunProgress, 1000);
    assert.deepEqual(routeOrder, ["BGY", "BGY", "FCO", "FCO"],
      `candidate ${failedLookup ? "error" : "success"} path yields to stale checks before next group`);
    assert.equal(newPriceRunProgress.done, 2, "candidate resumes and completes both groups");
    assert.equal(stalePriceRunProgress.done, 2, "stale checks are not dropped");
  }
  globalThis.fetch = testFetch;

  // Persistent internal switch: admin-only, reversible, visible on the normal
  // flight response, but absent from Google candidates and all monitoring.
  flights = [flight];
  assert.equal((await request("/flights/:id/google-monitoring", {}, { disabled: true }, { id: 1 }, "manager")).status, 403);
  assert.equal(await googleMonitoringDisabled(1), false);
  assert.equal((await request("/flights/:id/google-monitoring", {}, { disabled: "true" }, { id: 1 })).status, 400);
  assert.equal((await request("/flights/:id/google-monitoring", {}, { disabled: true }, { id: 999 })).status, 404);
  assert.equal((await request("/flights/:id/google-monitoring", {}, { disabled: true }, { id: 1 })).status, 200);
  assert.equal(await googleMonitoringDisabled(1), true, "switch is read from persisted settings");
  assert.equal((await request("/flights/:id", {}, {}, { id: 1 })).body.googleMonitoringDisabled, true);
  assert.deepEqual(await googleMonitoringFlights([flight]), [], "disabled flight stays out of Google groups");
  assert.match(dialect.sqlToQuery(googleMonitoringEnabledSql()).sql, /NOT EXISTS.*|"settings"/s);
  assert.match(dialect.sqlToQuery(await noGoogleRuleFlightsSql(`${date} 00:00`)).sql, /googleMonitoringDisabled/);
  let forbiddenCalls = 0;
  onFetch = () => { forbiddenCalls++; };
  assert.equal((await request("/flights/:id/google-price/live", {}, {}, { id: 1 })).status, 409);
  assert.equal((await request("/flights/:id/google-price/apply", {}, { googlePrice: 90 }, { id: 1 })).status, 409);
  assert.equal((await request("/flights/:id/sync-schedule", {}, {
    departureDate: date, departureTime: "08:00", arrivalDate: date, arrivalTime: "10:00",
  }, { id: 1 })).status, 409, "Google-disabled gate also protects manual schedule sync");
  await warmSoonFlights();
  await runNoPriceCheckNow();
  await runStalePriceCheckNow();
  await waitUntilDone(stalePriceRunProgress);
  await runNewPriceCheckNow();
  await waitUntilDone(newPriceRunProgress);
  assert.equal(forbiddenCalls, 0, "disabled flight never reaches upstream on manual/automatic warmers");
  flightWrites.length = 0;
  await applyGoogleSearchScheduleAlert({ ...flight } as never, new Date(), noFare, undefined, db, 5);
  assert.equal(flightWrites.length, 0, "late Google result cannot recreate an alert after disabling");
  assert.equal((await request("/flights/:id/google-monitoring", {}, { disabled: false }, { id: 1 })).status, 200);
  assert.equal(await googleMonitoringDisabled(1), false);
  assert.equal((await googleMonitoringFlights([flight])).length, 1, "clicking again restores Google eligibility");
  onFetch = null;

  // Every existing price-search writer also flags date-only changes without
  // modifying schedules. The same manual sync core applies exact evidence.
  for (const warmer of warmers) {
    flights = [flight];
    flight.excludeFromGoogleRule = false;
    Object.assign(flight, { arrivalDate: "2028-04-02", scheduleAlert: null,
      scheduleAlertDetail: null, scheduleCheckedAt: null, alertDismissedAt: null });
    payload = fullPayload();
    await warmer.run();
    assert.equal(flight.scheduleAlert, "time_changed", `${warmer.name}: date-only change reaches Njoftime`);
    assert.equal(flight.arrivalDate, "2028-04-02", `${warmer.name}: no automatic schedule repair`);
    assert.match(flight.scheduleAlertDetail, /Mbërritja 2028-04-02 10:00→2028-04-01 10:00/);
    assert.ok(monitoringSettings.has(scheduleEvidenceKey(1)));
  }
  const checked = await request("/flights/schedule-check", {}, {
    from: "TIA", to: "BGY", startDate: date, endDate: date,
  });
  assert.equal(checked.body.results[0].status, "time_changed");
  assert.equal(checked.body.results[0].googleDepartureDate, date);
  assert.equal(checked.body.results[0].googleArrivalDate, date);
  assert.equal(checked.body.results[0].ourArrivalDate, "2028-04-02");
  assert.equal(flight.arrivalDate, "2028-04-02");
  assert.equal((await request("/flights/:id/sync-schedule", {}, { departureTime: "08:00", arrivalTime: "10:00" }, { id: 1 })).status, 400,
    "Legacy time-only requests cannot silently normalize and pretend synced");
  assert.equal((await request("/flights/:id/sync-schedule", {}, {}, { id: 1 }, "agent")).status, 403);
  const requested = { departureDate: date, departureTime: "08:00", arrivalDate: date, arrivalTime: "10:00" };
  flight.arrivalDate = "2028-04-03";
  await assert.rejects(() => applyStoredGoogleScheduleSync(1, requested), /vjetruar/);
  flight.arrivalDate = "2028-04-02";
  const applied = await applyStoredGoogleScheduleSync(1, requested);
  assert.equal(applied.updated.arrivalDate, date);
  assert.equal(flight.scheduleAlert, null);
  assert.equal(monitoringSettings.has(scheduleEvidenceKey(1)), false, "Sync consumes evidence");
  await recordFlightChange({ req: { session: { userId: 1, role: "admin", userName: "Test admin" } },
    flightId: 1, source: "sync-schedule", before: applied.before, after: applied.schedule });
  assert.deepEqual(scheduleHistory.at(-1)?.changes, [{ field: "arrivalDate", old: "2028-04-02", new: date }],
    "Date-only sync is recorded in the existing detailed history");
  await assert.rejects(() => applyStoredGoogleScheduleSync(1, requested), /vjetruar/);

  console.log("Google price cache route/warmer regression tests: OK");
} finally {
  db.select = oldSelect;
  db.insert = oldInsert;
  db.update = oldUpdate;
  db.transaction = oldTransaction;
  db.delete = oldDelete;
  globalThis.fetch = oldFetch;
  await pool.end();
}