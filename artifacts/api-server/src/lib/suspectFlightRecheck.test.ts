import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { eq, and, count } from "drizzle-orm";
import * as tables from "@workspace/db";
import { runSuspectRechecks, loadSuspectRechecks } from "./suspectFlightRecheck.js";
import { nextRecheck, recheckScheduleChange } from "./suspectFlightRecheckPolicy.js";
import { flightsEligibleForGoogleLookup } from "./googleLookupEligibility.js";
import { monitorNewPriceGroup } from "./newPriceMonitoring.js";
import { applyGoogleSearchScheduleAlert, applyStoredGoogleScheduleSync } from "./googleScheduleAlerts.js";
import { retryKey } from "./stalePriceRetry.js";
import { staleGooglePriceSql } from "./staleGooglePriceSql.js";
import { possibleCancellationSql } from "./possibleCancellationSql.js";
import { googleScheduleSearchEvidence } from "./googleScheduleEvidence.js";

const schema = `suspect_recheck_test_${Date.now()}`;
const Pool = tables.pool.constructor as { new(options: any): typeof tables.pool };
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const client = drizzle(pool) as typeof tables.db;
const { flightsTable: f, settingsTable: s } = tables;
let calls = 0, notices = 0;
const missing = { flights: [{ flightNumber: "W6999", airline: "W6", departureTime: "11:00", arrivalTime: "12:00",
  fromCity: "TIA", toCity: "MXP", departureDate: "2099-01-01", arrivalDate: "2099-01-01", googlePrice: null }], routePrice: null, flightPriceMap: {} };
const enabled = async () => true;
const notify = () => { notices++; };
const run = (fetch: any = async (_from: string, _to: string, date: string) => {
  calls++;
  return { ...missing, flights: missing.flights.map(g => ({ ...g, departureDate: date, arrivalDate: date })) };
}) => runSuspectRechecks(fetch, client, enabled, notify);
const states = async () => loadSuspectRechecks(await client.select().from(f), client);
const age = async () => {
  for (const row of await client.select().from(s)) {
    const value = JSON.parse(row.value!);
    value.checkedAt = "2000-01-01T00:00:00.000Z";
    await client.update(s).set({ value: JSON.stringify(value) }).where(eq(s.key, row.key));
  }
};
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const dialect = new PgDialect();
   for (const table of [f, s, tables.googlePriceCacheTable]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => {
      let def = "";
      if (c.default !== undefined) {
        if (c.default && typeof c.default === "object" && "getSQL" in c.default) {
          const query = dialect.sqlToQuery((c.default as any).getSQL());
          assert.equal(query.params.length, 0); def = ` DEFAULT ${query.sql}`;
        } else def = ` DEFAULT '${String(c.default).replaceAll("'", "''")}'`;
      }
      return `"${c.name}" ${c.getSQLType()}${c.notNull ? " NOT NULL" : ""}${def}${c.primary ? " PRIMARY KEY" : ""}`;
    });
    await pool.query(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  const base = { airline: "W6", flightNumber: "W6123", fromCity: "TIA", toCity: "MXP",
    departureDate: "2099-01-01", departureTime: "10:00", arrivalDate: "2099-01-01", arrivalTime: "12:00",
    adultPrice: "200", childPrice: "200", infantPrice: "30", totalSeats: 5, soldSeats: 1,
    scheduleAlert: "not_found", scheduleAlertDetail: "Fixture" };
  await client.insert(f).values([
    { ...base, status: "open" }, { ...base, status: "soldout" },
    { ...base, status: "cancelled" }, { ...base, departureDate: "2000-01-01" },
    { ...base, scheduleAlert: null },
    { ...base, status: "closed" },
  ]);
  const original = JSON.stringify(await client.select().from(f));
  assert.deepEqual(flightsEligibleForGoogleLookup([
    { status: "open", excludeFromGoogleRule: true }, { status: "closed" },
    { status: "soldout" }, { status: "cancelled" },
  ]).map(f => f.status), ["open", "closed"], "all shared Google control lists exclude Sold Out, not rule-excluded flights");
  await run();
  assert.equal(calls, 1, "one fresh request per route/date, excluding Sold Out");
  let st = await states();
  assert.deepEqual([...st.keys()], [1, 6]);
  assert.equal(st.get(6)!.missingChecks, 1);
  await run(); assert.equal(calls, 1, "five-minute minimum spacing");
  await age(); await run();
  await age(); await run();
  assert.equal((await states()).get(1)!.missingChecks, 3);
  // Verify the real SQL used by counts/list/select-all with mixed settings.
  const [savedEvidence] = await client.select().from(s).where(eq(s.key, "suspectFlightRecheck.1"));
  const evidence = JSON.parse(savedEvidence.value!);
  const visible = async () => (await client.select({ id: f.id }).from(f).where(possibleCancellationSql())).map(x => x.id);
  await client.insert(s).values({ key: "unrelated.plain.text", value: "not JSON" });
  for (const n of [4, 5, 22]) {
    await client.update(s).set({ value: JSON.stringify({ ...evidence, missingChecks: n }) }).where(eq(s.key, savedEvidence.key));
    assert.deepEqual(await visible(), n >= 5 ? [1] : [], "five valid missing checks required");
  }
  for (const outcome of ["error", "empty", "found"]) {
    await client.update(s).set({ value: JSON.stringify({ ...evidence, missingChecks: 22, outcome }) }).where(eq(s.key, savedEvidence.key));
    assert.deepEqual(await visible(), [], "unreliable/recovered evidence is not cancellation");
  }
  await client.update(s).set({ value: JSON.stringify({ ...evidence, missingChecks: 5, identity: "invalid JSON" }) }).where(eq(s.key, savedEvidence.key));
  assert.deepEqual(await visible(), [], "invalid identity fails closed");
  await client.update(s).set({ value: JSON.stringify({ ...evidence, missingChecks: 5 }) }).where(eq(s.key, savedEvidence.key));
  await client.insert(s).values({ key: "googleMonitoringDisabled.1", value: "true" });
  assert.deepEqual(await visible(), [], "black cross suppresses cancellation notifications");
  await client.delete(s).where(eq(s.key, "googleMonitoringDisabled.1"));
  await client.update(f).set({ status: "soldout" }).where(eq(f.id, 1));
  assert.deepEqual(await visible(), [], "sold out is excluded");
  await client.update(f).set({
    status: "open",
    updatedAt: new Date(JSON.parse(original).find((row: { id: number }) => row.id === 1).updatedAt),
  }).where(eq(f.id, 1));
  await client.update(s).set({ value: savedEvidence.value }).where(eq(s.key, savedEvidence.key));
  await client.delete(s).where(eq(s.key, "unrelated.plain.text"));
  await age(); await run(async () => { throw new Error("timeout"); });
  const savedState = async () => JSON.parse((await client.select().from(s).where(eq(s.key, "suspectFlightRecheck.1")))[0].value!);
  assert.equal((await savedState()).outcome, "error");
  assert.equal((await savedState()).missingChecks, 3);
  const check = async (flights: typeof missing.flights) => {
    const [snapshot] = await client.select().from(f).where(eq(f.id, 1));
    return applyGoogleSearchScheduleAlert(snapshot, new Date(), { price: null, routePrice: null, specific: false },
      googleScheduleSearchEvidence(flights, snapshot), client);
  };
  await check([]);
  assert.equal((await savedState()).outcome, "empty");
  assert.equal((await savedState()).missingChecks, 3);
  await check([{ ...missing.flights[0], flightNumber: " w6 123 ", departureTime: "10:00" }]);
  assert.equal((await states()).has(1), false, "Exact found/no-fare leaves suspicious");
  assert.equal((await client.select().from(f).where(eq(f.id, 1)))[0].scheduleAlert, "verified_no_price");
  const operationalOnly = ({ scheduleAlert, scheduleAlertDetail, scheduleCheckedAt, scheduleMissCount, ...rest }: any) => rest;
  assert.deepEqual((await client.select().from(f)).sort((a, b) => a.id - b.id).map(operationalOnly), JSON.parse(original).sort((a: any, b: any) => a.id - b.id).map((r: any) => operationalOnly({
    ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt),
  })), "monitoring never changes operational fields");
  await client.update(f).set({ scheduleAlert: "not_found", scheduleCheckedAt: null }).where(eq(f.id, 1));
  const flight = (await client.select().from(f).where(eq(f.id, 1)))[0];
  assert.equal(nextRecheck(flight, undefined, { flights: [{ flightNumber: "W6123", departureDate: "2099-01-02" }] }).outcome, "empty");
  await age();
  await run(async () => {
    await client.update(f).set({ scheduleAlert: null, alertDismissedAt: new Date() }).where(eq(f.id, 1));
    await client.update(f).set({ status: "soldout" }).where(eq(f.id, 6));
    return missing;
  });
  assert.equal((await states()).size, 0, "late results cannot survive acknowledgement or transition to Sold Out");
  const n = calls;
  await runSuspectRechecks(async () => { calls++; return missing; }, client, async () => false, notify);
  assert.equal(calls, n, "module switch stops upstream requests");
  assert.ok(notices > 0);
  console.log("PASS: real PostgreSQL rechecks, Sold Out, cadence, grouping, missing/found/errors/empty, immutable flights, stale result guards, module off.");
  const changedSchedule = { ...missing, flights: [{
    ...missing.flights[0], flightNumber: "W6123", departureDate: "2099-01-01",
    departureTime: "13:00", arrivalTime: "15:00",
  }] };
  await client.update(f).set({ status: "open", scheduleAlert: "not_found",
    scheduleAlertDetail: "Pending review", alertDismissedAt: null, scheduleCheckedAt: null,
    excludeFromGoogleRule: true }).where(eq(f.id, 1));
  const [beforeRecheck] = await client.select().from(f).where(eq(f.id, 1));
  assert.equal(recheckScheduleChange(beforeRecheck, { ...changedSchedule, error: true }), null);
  assert.equal(recheckScheduleChange(beforeRecheck, { ...changedSchedule, flights: [] }), null);
  assert.equal(recheckScheduleChange(beforeRecheck, { ...changedSchedule, flights: [...changedSchedule.flights,
    { ...changedSchedule.flights[0], arrivalTime: "15:30" }] }), null);
  assert.ok(recheckScheduleChange(beforeRecheck, { ...changedSchedule, flights: [...changedSchedule.flights, ...changedSchedule.flights] }));
  assert.equal(recheckScheduleChange(beforeRecheck, { ...changedSchedule, flights: [{ ...changedSchedule.flights[0], departureDate: "2099-01-02" }] }), null);
  await age(); await run(async () => changedSchedule);
  const [afterRecheck] = await client.select().from(f).where(eq(f.id, 1));
  assert.equal(afterRecheck.scheduleAlert, "time_changed");
  assert.equal(afterRecheck.scheduleAlertDetail, "Nisja 2099-01-01 10:00→2099-01-01 13:00, Mbërritja 2099-01-01 12:00→2099-01-01 15:00");
  const operational = ({ scheduleAlert, scheduleAlertDetail, scheduleCheckedAt, scheduleMissCount, ...rest }: typeof beforeRecheck) => rest;
  assert.deepEqual(operational(afterRecheck), operational(beforeRecheck), "only alert metadata may change, even without a fare and when excluded");
  assert.equal((await states()).has(1), false, "verified schedule alert replaces the found/missing badge");
  await client.update(f).set({ scheduleAlert: "not_found", scheduleCheckedAt: null }).where(eq(f.id, 1));
  await age(); await run(async () => {
    await client.update(f).set({ arrivalTime: "12:05" }).where(eq(f.id, 1));
    return changedSchedule;
  });
  assert.equal((await client.select().from(f).where(eq(f.id, 1)))[0].scheduleAlert, "not_found", "late results cannot override an arrival edit");
  await client.update(f).set({ arrivalTime: "12:00" }).where(eq(f.id, 1));
  console.log("PASS: existing recheck detects schedule changes without extra requests; errors/empty/ambiguous/wrong-date/late responses rejected.");

  // Candidate-price monitoring runs in the caller's existing refresh, never its
  // own scheduler and never through the operational seat-miss/Sold Out writer.
  const reset = async () => {
    await client.update(f).set({ status: "open", scheduleAlert: null, scheduleAlertDetail: null,
      scheduleMissCount: 0, scheduleCheckedAt: null, alertDismissedAt: null,
      seatAlert: null, seatAlertDetail: null, seatCheckedAt: null, seatMissCount: 2,
      excludeFromGoogleRule: true }).where(eq(f.id, 1));
    return (await client.select().from(f).where(eq(f.id, 1)))[0];
  };
  const row = async () => (await client.select().from(f).where(eq(f.id, 1)))[0];
  let seatCalls = 0;
  const deps = {
    database: client, enabled, notify, getConfig: async () => ({ minSeats: 5 }),
    fetchSeats: async (_from: string, _to: string, _date: string, persons: number) => {
      seatCalls++; assert.equal(persons, 5);
      return { availableFlightNumbers: new Set(["W6999"]), flightPriceMap: { W6999: 100 }, error: false };
    },
  };
  const priced = { ...missing, routePrice: 100, flightPriceMap: { W6123: 100 } };
  const moved = { ...priced, flights: [{ ...missing.flights[0], flightNumber: "W6123" }] };
  const snapshot = await reset();
  const protectedValues = (r: typeof snapshot) => [r.status, r.adultPrice, r.childPrice, r.infantPrice,
    r.totalSeats, r.soldSeats, r.seatMissCount, r.seatMissLastAt, r.updatedAt];
  await monitorNewPriceGroup([snapshot], moved, new Date(), deps);
  assert.equal((await row()).scheduleAlert, "time_changed", "excluded flights receive schedule warnings");
  assert.equal((await row()).seatAlert, "low_seats", "same run warns on configured party availability");
  assert.deepEqual(protectedValues(await row()), protectedValues(snapshot), "no price/seat/status/counter/edit-timestamp mutation");
  assert.equal(seatCalls, 1);
  await reset();
  for (let i = 0; i < 3; i++) {
    await client.update(f).set({ scheduleCheckedAt: null, seatCheckedAt: null }).where(eq(f.id, 1));
    await monitorNewPriceGroup([await row()], { ...priced, flightPriceMap: {} }, new Date(), deps);
  }
  assert.equal((await row()).scheduleAlert, "not_found", "route alternative does not hide repeated missing flight");
  assert.equal((await row()).seatMissCount, 2, "three informational misses cannot advance operational Sold Out counter");
  await reset();
  await monitorNewPriceGroup([await row()], { flights: [], flightPriceMap: {}, routePrice: null }, new Date(), deps);
  assert.equal((await row()).scheduleAlert, "price_retry", "empty schedules cannot prove flight absence");
  await reset();
  const callsBefore = seatCalls;
  await monitorNewPriceGroup([await row()], { ...missing, error: true }, new Date(), deps);
  assert.equal(seatCalls, callsBefore, "failed price lookup triggers no additional seat requests");
  assert.equal((await row()).scheduleAlert, "price_retry", "Technical error enters the stale retry cohort");
  await monitorNewPriceGroup([{ ...await row(), status: "soldout" }], moved, new Date(), deps);
  await monitorNewPriceGroup([await row()], moved, new Date(), { ...deps, enabled: async () => false });
  assert.equal(seatCalls, callsBefore, "Sold Out and module-off excluded");
  for (const action of ["empty", "error", "soldout", "dismiss", "identity"] as const) {
    const snap = await reset();
    await monitorNewPriceGroup([snap], moved, new Date(), {
      ...deps,
      fetchSeats: async () => {
        if (action === "soldout") await client.update(f).set({ status: "soldout" }).where(eq(f.id, 1));
        if (action === "dismiss") await client.update(f).set({ alertDismissedAt: new Date() }).where(eq(f.id, 1));
        if (action === "identity") await client.update(f).set({ flightNumber: "W6000" }).where(eq(f.id, 1));
        return { availableFlightNumbers: new Set(action === "empty" ? [] : ["W6999"]),
          flightPriceMap: {}, error: action === "error" };
      },
    });
    assert.equal((await row()).seatAlert, null, `no false/late seat alert: ${action}`);
    await client.update(f).set({ flightNumber: "W6123" }).where(eq(f.id, 1));
  }
  await reset();
  await client.update(f).set({ seatAlert: "low_seats", seatAlertDetail: "Manual acknowledgement required" }).where(eq(f.id, 1));
  await monitorNewPriceGroup([await row()], moved, new Date(), {
    ...deps, fetchSeats: async () => ({ availableFlightNumbers: new Set(["W6123"]), flightPriceMap: { W6123: 100 }, error: false }),
  });
  assert.equal((await row()).seatAlertDetail, "Manual acknowledgement required", "recovery never acknowledges an alert");
  console.log("PASS: candidate refresh schedule/no-price/missing/seat alerts, exclusions, immutable operational fields, module-off, empty/errors and late-result guards.");

  const [retryFlight] = await client.insert(f).values({ ...base, scheduleAlert: null, scheduleAlertDetail: null }).returning();
  await client.insert(s).values([
    { key: "unrelated-plain", value: "not JSON" },
    { key: "unrelated-malformed", value: "{" },
    { key: "unrelated-scalar", value: "true" },
    { key: "unrelated-identity", value: '{"identity":"not JSON"}' },
  ]);
  await client.insert(tables.googlePriceCacheTable).values({
    cacheKey: "TIA|MXP|2099-01-01|W6123", stale: true,
  });
  const staleCount = async () => Number((await client.select({ n: count() }).from(f)
    .where(and(eq(f.id, retryFlight.id), staleGooglePriceSql())))[0].n);
  const noFare = { price: null, routePrice: 99, specific: false };
  const exact = { googleCount: 1, match: { ...missing.flights[0], flightNumber: "W6123", departureTime: "10:00", arrivalTime: "12:00" } };
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (attempt > 1) {
      const [row] = await client.select().from(s).where(eq(s.key, retryKey(retryFlight.id)));
      const persisted = JSON.parse(row.value!);
      persisted.checkedAt = Date.now() - 8 * 60_000;
      await client.update(s).set({ value: JSON.stringify(persisted) }).where(eq(s.key, row.key));
    }
    await applyGoogleSearchScheduleAlert(retryFlight, new Date(), { ...noFare, error: attempt % 2 === 0 }, exact, client, 7);
    const [current] = await client.select().from(f).where(eq(f.id, retryFlight.id));
    assert.equal(current.scheduleMissCount, 0, "fare retry is not a flight absence counter");
    assert.equal(current.scheduleAlert, attempt % 2 === 0 ? "price_retry" : "verified_no_price");
    assert.equal(await staleCount(), 1, "no-fare and technical failures never hide from retries");
    // Manual/background checks do not accelerate the stale group's own cadence.
    await applyGoogleSearchScheduleAlert(retryFlight, new Date(), noFare, exact, client);
    await applyGoogleSearchScheduleAlert(retryFlight, new Date(), noFare, exact, client, 7);
    const [unchanged] = await client.select().from(f).where(eq(f.id, retryFlight.id));
    assert.equal(unchanged.scheduleMissCount, 0);
    assert.equal(unchanged.adultPrice, retryFlight.adultPrice);
    assert.equal(unchanged.soldSeats, retryFlight.soldSeats);
    assert.equal(unchanged.status, retryFlight.status);
  }
  const [validRetry] = await client.select().from(s).where(eq(s.key, retryKey(retryFlight.id)));
  for (const value of ["broken", "{", "null", "[]", '{"identity":"invalid"}',
    '{"identity":null}', '{"identity":"{}"}',
    JSON.stringify({ identity: JSON.stringify(["wrong-flight"]), misses: 5 })]) {
    await client.update(s).set({ value }).where(eq(s.key, validRetry.key));
    assert.equal(await staleCount(), 1, "malformed or outdated retry must not crash/hide flight");
  }
  await client.update(s).set({ value: validRetry.value }).where(eq(s.key, validRetry.key));
  assert.equal(await staleCount(), 1);
  await applyGoogleSearchScheduleAlert(retryFlight, new Date(), { price: 150, routePrice: 99, specific: true }, exact, client);
  const [recovered] = await client.select().from(f).where(eq(f.id, retryFlight.id));
  assert.equal(recovered.scheduleAlert, null);
  assert.equal(recovered.scheduleMissCount, 0);
  assert.equal((await client.select().from(s).where(eq(s.key, retryKey(retryFlight.id)))).length, 0);
  console.log("PASS: persisted five-check stale cohort, mixed technical/no-fare failures, interval gate, recovery and operational invariants.");
  const [manualFlight] = await client.insert(f).values({
    ...base, flightNumber: "W6888", departureDate: "2099-02-02", arrivalDate: "2099-02-02", status: "open",
  }).returning();
  const manual = async (sample: typeof missing = { ...missing, flights: missing.flights.map(g => ({
    ...g, departureDate: "2099-02-02", arrivalDate: "2099-02-02",
  })) }) => {
    const [snapshot] = await client.select().from(f).where(eq(f.id, manualFlight.id));
    return applyGoogleSearchScheduleAlert(snapshot, new Date(), noFare,
      googleScheduleSearchEvidence(sample.flights, snapshot),
      client, undefined, sample);
  };
  assert.equal((await manual())?.missingChecks, 1);
  assert.equal((await manual())?.missingChecks, 2);
  const manualKey = `suspectFlightRecheck.${manualFlight.id}`;
  const [beforeAuto] = await client.select().from(s).where(eq(s.key, manualKey));
  await client.update(s).set({ value: JSON.stringify({
    ...JSON.parse(beforeAuto.value!), checkedAt: "2000-01-01T00:00:00.000Z",
  }) }).where(eq(s.key, manualKey));
  await run();
  assert.equal((await states()).get(manualFlight.id)?.missingChecks, 3, "automatic continues manual counter");
  assert.equal((await manual())?.possibleCancellation, false);
  assert.equal((await manual())?.possibleCancellation, true, "manual fifth miss activates notification");
  assert.ok((await visible()).includes(manualFlight.id));
  const emptyManual = await manual({ ...missing, flights: [] });
  assert.equal(emptyManual?.missingChecks, 5);
  assert.equal(emptyManual?.possibleCancellation, false);
  const restored = await manual({ ...missing, flights: [{
    ...missing.flights[0], flightNumber: "W6888", departureDate: "2099-02-02", arrivalDate: "2099-02-02",
    departureTime: "10:00", arrivalTime: "12:00",
  }] });
  assert.equal(restored?.missingChecks, 0);
  assert.equal(restored?.possibleCancellation, false);
  const [manualSnapshot] = await client.select().from(f).where(eq(f.id, manualFlight.id));
  await applyGoogleSearchScheduleAlert(manualSnapshot, new Date(), noFare, exact, client, 7);
  const changed = await manual({ ...missing, flights: [{
    ...missing.flights[0], flightNumber: "W6888", departureDate: "2099-02-02", arrivalDate: "2099-02-02",
    departureTime: "18:00", arrivalTime: "20:00",
  }] });
  assert.equal(changed?.scheduleAlert, "time_changed", "no-price retry must not hide verified time change");
  console.log("PASS: shared manual/automatic 5-miss counter, empty/recovery, SQL notification, schedule change without fare.");
  await client.update(f).set({ arrivalDate: "2099-02-03", scheduleCheckedAt: null }).where(eq(f.id, manualFlight.id));
  const [badDateSnapshot] = await client.select().from(f).where(eq(f.id, manualFlight.id));
  const full = { ...missing.flights[0], flightNumber: "W6888", departureDate: "2099-02-02",
    arrivalDate: "2099-02-02", departureTime: "10:00", arrivalTime: "12:00" };
  const dateAlert = await applyGoogleSearchScheduleAlert(badDateSnapshot, new Date(), noFare,
    { googleCount: 1, match: full }, client);
  assert.equal(dateAlert?.scheduleAlert, "time_changed");
  assert.match(dateAlert!.scheduleAlertDetail!, /2099-02-03 12:00→2099-02-02 12:00/);
  assert.equal((await client.select().from(f).where(eq(f.id, manualFlight.id)))[0].arrivalDate, "2099-02-03",
    "Search only flags; it never repairs dates");
  await assert.rejects(() => applyStoredGoogleScheduleSync(manualFlight.id, { ...full, arrivalDate: "2099-02-04" }, client));
  const synced = await applyStoredGoogleScheduleSync(manualFlight.id, full, client);
  assert.equal(synced.before.arrivalDate, "2099-02-03");
  assert.equal(synced.updated.arrivalDate, "2099-02-02");
  assert.equal(synced.updated.scheduleAlert, null);
  const [now] = await client.select().from(f).where(eq(f.id, manualFlight.id));
  assert.equal(await applyGoogleSearchScheduleAlert(badDateSnapshot, new Date(), noFare,
    { googleCount: 1, match: full }, client), null, "Arrival-date-only edit rejects old in-flight results");
  assert.equal(now.status, "open");
  console.log("PASS: PostgreSQL date-only Google alert, manual exact sync, mismatched-date rejection, stale arrival-date guard.");
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  await tables.pool.end();
}