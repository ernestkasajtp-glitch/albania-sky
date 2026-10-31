import { googleMonitoringEnabledSql, googleMonitoringDisabled, googleMonitoringFlights } from "./googleMonitoringPolicy.js";
import { db, flightsTable, settingsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isModuleEnabled } from "./moduleControls.js";
import { notifyDataChanged } from "./liveEvents.js";
import { logger } from "./logger.js";
import { nextRecheck, recheckIdentity, recheckIntervalMs, type RecheckState, type SuspectFlight } from "./suspectFlightRecheckPolicy.js";
import type { GoogleScheduleResult } from "../routes/flights.js";
import { googleScheduleAlertForSearch } from "./googlePriceCachePolicy.js";
import { normalizeFlightCode } from "./suspectFlightRecheckPolicy.js";
import { retryKey } from "./stalePriceRetry.js";
import { matchingGoogleSchedule, googleScheduleSearchEvidence, scheduleEvidenceKey, scheduleIdentity } from "./googleScheduleEvidence.js";

// Separate evidence records; verified schedule changes may update the alert only.
// Never write operational times, flight status, prices or seats.
// Existing settings storage avoids altering shared flight/partner serializers.
const key = (id: number) => `suspectFlightRecheck.${id}`;
export async function loadSuspectRechecks(flights: SuspectFlight[], database = db) {
  const states = new Map<number, RecheckState>();
  if (!flights.length) return states;
  const rows = await database.select().from(settingsTable).where(inArray(settingsTable.key, flights.map(f => key(f.id))));
  const byKey = new Map(rows.map(r => [r.key, r.value]));
  for (const f of flights) {
    const value = byKey.get(key(f.id));
    if (!value || f.scheduleAlert !== "not_found" || f.status === "soldout" || f.status === "cancelled") continue;
    try {
      const state = JSON.parse(value) as RecheckState;
      if (state.identity === recheckIdentity(f) && Number.isFinite(Date.parse(state.checkedAt)) &&
          ["found", "missing", "empty", "error"].includes(state.outcome) && Number.isInteger(state.missingChecks))
        states.set(f.id, state);
    } catch { /* A malformed monitoring record is rechecked, never treated as proof. */ }
  }
  return states;
}
type FetchSchedules = (from: string, to: string, date: string, opts?: { directOnly?: boolean }) => Promise<GoogleScheduleResult>;
let running = false;
const future = sql`(${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) > to_char(NOW() AT TIME ZONE 'Europe/Tirane', 'YYYY-MM-DD HH24:MI')`;
export async function runSuspectRechecks(fetchSchedules: FetchSchedules, database = db,
  moduleEnabled = isModuleEnabled, notify = notifyDataChanged) {
  if (running || !await moduleEnabled("googlePrices")) return;
  if (running) return;
  running = true;
  try {
    const flights = await googleMonitoringFlights(await database.select().from(flightsTable).where(and(
      eq(flightsTable.scheduleAlert, "not_found"),
      sql`${flightsTable.status} NOT IN ('cancelled', 'soldout')`, future, googleMonitoringEnabledSql(),
    )), database);
    const states = await loadSuspectRechecks(flights, database);
    const due = flights.filter(f => !states.has(f.id) || Date.now() - Date.parse(states.get(f.id)!.checkedAt) >= recheckIntervalMs)
      .sort((a, b) => (Date.parse(states.get(a.id)?.checkedAt ?? "") || 0) - (Date.parse(states.get(b.id)?.checkedAt ?? "") || 0));
    const groups = new Map<string, typeof flights>();
    for (const f of due) {
      const route = `${f.fromCity}|${f.toCity}|${f.departureDate}`;
      groups.set(route, [...(groups.get(route) ?? []), f]);
    }
    const jobs = [...groups.values()];
    // Shared RapidAPI queue + bounded fetch timeout are inside fetchSchedules.
    // Four route/date groups at once; no duplicate lookups per flight.
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (jobs.length) {
        if (!await moduleEnabled("googlePrices")) return;
        const queuedGroup = jobs.shift();
        const group = queuedGroup ? await googleMonitoringFlights(queuedGroup, database) : undefined;
        if (!group) return;
        if (!group.length) continue;
        const first = group[0];
        const startedAt = new Date();
        let result: GoogleScheduleResult;
        try { result = await fetchSchedules(first.fromCity, first.toCity, first.departureDate, { directOnly: true }); }
        catch { result = { flights: [], routePrice: null, flightPriceMap: {}, error: true }; }
        if (!await moduleEnabled("googlePrices")) return;
        let changed = false;
        for (const snapshot of group) {
          await database.transaction(async tx => {
            const [current] = await tx.select().from(flightsTable).where(and(eq(flightsTable.id, snapshot.id), future)).for("update");
            if (!current || current.status === "cancelled" || current.status === "soldout" || current.scheduleAlert !== "not_found" ||
                recheckIdentity(current) !== recheckIdentity(snapshot) ||
                (current.scheduleCheckedAt && current.scheduleCheckedAt > startedAt)) return;
            if (await googleMonitoringDisabled(current.id, tx)) return;
            const [stored] = await tx.select().from(settingsTable).where(eq(settingsTable.key, key(current.id)));
            let previous: RecheckState | undefined;
            try { previous = stored?.value ? JSON.parse(stored.value) : undefined; } catch {}
            // Another process may have completed this same sample while we fetched.
            if (previous?.identity === recheckIdentity(current) &&
                startedAt.getTime() - Date.parse(previous.checkedAt) < recheckIntervalMs) return;
            const norm = normalizeFlightCode(current.flightNumber);
            const match = matchingGoogleSchedule(result.flights, current);
            if (!result.error && match) {
              const value = JSON.stringify({ identity: scheduleIdentity(current), schedule: match });
              await tx.insert(settingsTable).values({ key: scheduleEvidenceKey(current.id), value })
                .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
            } else {
              await tx.delete(settingsTable).where(eq(settingsTable.key, scheduleEvidenceKey(current.id)));
            }
            const price = result.flightPriceMap[norm] ?? null;
            let next = googleScheduleAlertForSearch(current,
              { price, routePrice: result.routePrice, specific: price != null, error: !!result.error },
              googleScheduleSearchEvidence(result.flights, current, !result.error && result.schedulesReliable !== false));
            if (!result.error && match && price != null && price > 0) {
              await tx.delete(settingsTable).where(eq(settingsTable.key, retryKey(current.id)));
            }
            const state = nextRecheck(current, previous, {
              ...result,
              evidence: {
                found: !result.error && !!match,
                missing: !result.error && !(price != null && price > 0)
                  && googleScheduleSearchEvidence(result.flights, current, result.schedulesReliable !== false).missing,
              },
            });
            if (next) next = { ...next, scheduleMissCount: state.missingChecks };
            // Bind evidence to the resulting classification, not the previous detail.
            state.identity = recheckIdentity({ ...current, ...(next ?? {}) });
            const value = JSON.stringify(state);
            await tx.insert(settingsTable).values({ key: key(current.id), value })
              .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
            if (next && (!current.scheduleCheckedAt || current.scheduleCheckedAt <= startedAt)) {
              await tx.update(flightsTable).set({
                ...next,
                scheduleCheckedAt: new Date(),
                updatedAt: sql`${flightsTable.updatedAt}`,
              }).where(eq(flightsTable.id, current.id));
            }
            changed = true;
          });
        }
        if (changed) notify("flights");
      }
    }));
    if (due.length) logger.info({ flights: due.length, routeDates: groups.size }, "Suspect-flight recheck cycle completed");
  } finally { running = false; }
}
let timer: ReturnType<typeof setInterval> | undefined;
export function startSuspectRecheckScheduler(fetchSchedules: FetchSchedules) {
  if (timer) return;
  const tick = () => void runSuspectRechecks(fetchSchedules).catch(err => logger.error({ err }, "Suspect-flight recheck failed"));
  timer = setInterval(tick, 60_000);
  timer.unref();
  setTimeout(tick, 15_000).unref();
}