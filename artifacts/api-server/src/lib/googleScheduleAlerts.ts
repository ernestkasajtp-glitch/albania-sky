import { db, flightsTable, settingsTable } from "@workspace/db";
import { advancePriceRetry, readPriceRetry, retryKey } from "./stalePriceRetry.js";
import { googleMonitoringDisabled } from "./googleMonitoringPolicy.js";
import { eq, sql } from "drizzle-orm";
import { googleScheduleAlertForSearch, type computePriceWrite } from "./googlePriceCachePolicy.js";
import { nextRecheck, recheckIdentity, type RecheckState } from "./suspectFlightRecheckPolicy.js";
import { matchingGoogleSchedule, scheduleEvidenceKey, scheduleIdentity, validatedGoogleSync, type GoogleSchedule } from "./googleScheduleEvidence.js";

type FlightSnapshot = Pick<typeof flightsTable.$inferSelect,
  "id" | "fromCity" | "toCity" | "departureDate" | "flightNumber" |
  "departureTime" | "arrivalTime" | "arrivalDate" | "alertDismissedAt"
>;

// Every saved-price lookup writer uses the same locked-row guard. Never call
// this from a cache read/backfill: null historical cache is not proof of a
// completed search.
export async function applyGoogleSearchScheduleAlert(
  snapshot: FlightSnapshot,
  requestStartedAt: Date,
  fresh: Parameters<typeof computePriceWrite>[0],
  schedule?: Parameters<typeof googleScheduleAlertForSearch>[2],
  database: Pick<typeof db, "transaction"> = db,
  retryIntervalMinutes?: number,
  _recheckSample?: Parameters<typeof nextRecheck>[2],
) {
  return database.transaction(async tx => {
    const [current] = await tx.select().from(flightsTable)
      .where(eq(flightsTable.id, snapshot.id)).for("update");
    if (!current) return null;
    if (await googleMonitoringDisabled(current.id, tx)) return null;
    const identity = (value: string | null) => (value ?? "").replace(/\s+/g, "").toUpperCase();
    const timestamp = (value: Date | null) => value?.getTime() ?? null;
    if (
      identity(current.fromCity) !== identity(snapshot.fromCity)
      || identity(current.toCity) !== identity(snapshot.toCity)
      || identity(current.flightNumber) !== identity(snapshot.flightNumber)
      || current.departureDate !== snapshot.departureDate
      || current.departureTime !== snapshot.departureTime
      || current.arrivalTime !== snapshot.arrivalTime
      || current.arrivalDate !== snapshot.arrivalDate
      || timestamp(current.alertDismissedAt) !== timestamp(snapshot.alertDismissedAt)
      || (current.alertDismissedAt && current.alertDismissedAt.getTime() >= requestStartedAt.getTime())
      || (current.scheduleCheckedAt && current.scheduleCheckedAt.getTime() > requestStartedAt.getTime())
      || current.status === "soldout" || current.status === "cancelled"
    ) return null;

    const evidenceKey = scheduleEvidenceKey(current.id);
    const match = schedule?.match ? matchingGoogleSchedule([schedule.match], current) : null;
    if (!fresh.error && match) {
      const value = JSON.stringify({ identity: scheduleIdentity(current), schedule: match });
      await tx.insert(settingsTable).values({ key: evidenceKey, value }).onConflictDoUpdate({
        target: settingsTable.key, set: { value, updatedAt: new Date() },
      });
    } else if (current.scheduleAlert !== "time_changed") {
      await tx.delete(settingsTable).where(eq(settingsTable.key, evidenceKey));
    }
    const previous = {
      scheduleAlert: current.scheduleAlert ?? null,
      scheduleAlertDetail: current.scheduleAlertDetail ?? null,
      scheduleMissCount: current.scheduleMissCount ?? 0,
    };
    let next = googleScheduleAlertForSearch({
      ...previous, departureDate: current.departureDate, arrivalDate: current.arrivalDate,
      departureTime: current.departureTime, arrivalTime: current.arrivalTime,
    }, fresh, schedule ? { ...schedule, match } : undefined);
    const scheduleResult = next;
    const retryIdentity = JSON.stringify([identity(current.fromCity), identity(current.toCity),
      identity(current.flightNumber), current.departureDate, current.departureTime, current.arrivalTime, current.arrivalDate]);
    const [stored] = await tx.select().from(settingsTable).where(eq(settingsTable.key, retryKey(current.id)));
    // An initial technical failure enters the stale cohort but is not itself
    // one of its five scheduled retries.
    const retry = readPriceRetry(stored?.value, retryIdentity) ??
      (next?.scheduleAlert === "price_retry" && retryIntervalMinutes === undefined
        ? { identity: retryIdentity, misses: 0, checkedAt: 0 } : null);
    const foundExactPrice = !fresh.error && fresh.specific && fresh.price != null && fresh.price > 0;
    if (retryIntervalMinutes !== undefined || retry) {
      const state = retryIntervalMinutes !== undefined
        ? advancePriceRetry(retry, retryIdentity, requestStartedAt.getTime(), retryIntervalMinutes, foundExactPrice)
        : foundExactPrice ? null : retry;
      if (state) {
        await tx.insert(settingsTable).values({ key: retryKey(current.id), value: JSON.stringify(state) })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(state), updatedAt: new Date() } });
        if (next?.scheduleAlert === "price_retry") next = {
          scheduleAlert: "price_retry",
          scheduleAlertDetail: `${state.misses}/5 kontrolle pa çmim — ${fresh.error ? "gabim teknik, jo provë anulimi" : "nuk u gjet çmimi i këtij fluturimi"}`,
          scheduleMissCount: next.scheduleMissCount,
        };
      } else {
        await tx.delete(settingsTable).where(eq(settingsTable.key, retryKey(current.id)));
        if (next && ["price_retry", "verified_no_price"].includes(next.scheduleAlert ?? "")
          && schedule?.match) {
          next = { scheduleAlert: null, scheduleAlertDetail: null, scheduleMissCount: 0 };
        }
      }
    } else if (stored) {
      await tx.delete(settingsTable).where(eq(settingsTable.key, retryKey(current.id)));
    }
    let evidence: RecheckState | undefined;
    {
      const key = `suspectFlightRecheck.${current.id}`;
      const [saved] = await tx.select().from(settingsTable).where(eq(settingsTable.key, key));
      let prior: RecheckState | undefined;
      try { prior = saved?.value ? JSON.parse(saved.value) : undefined; } catch {}
      evidence = nextRecheck(current, prior, {
        flights: [], error: fresh.error,
        evidence: {
          found: !!match && !fresh.error,
          missing: !!schedule?.missing && !fresh.error && !foundExactPrice,
        },
      });
      // Code absence and price absence have separate counters.
      if (evidence.outcome === "missing") next = scheduleResult;
      if (next) next = { ...next, scheduleMissCount: evidence.missingChecks };
      evidence.identity = recheckIdentity({ ...current, ...(next ?? {}) });
      const value = JSON.stringify(evidence);
      await tx.insert(settingsTable).values({ key, value }).onConflictDoUpdate({
        target: settingsTable.key, set: { value, updatedAt: new Date() },
      });
    }
    // Record even an unchanged/recovered result so a slower overlapping no-price
    // response cannot re-flag after this newer successful lookup.
    await tx.update(flightsTable).set({
      ...(next ?? previous),
      scheduleCheckedAt: new Date(),
      // Monitoring metadata must not pretend the flight was edited.
      updatedAt: sql`${flightsTable.updatedAt}`,
    }).where(eq(flightsTable.id, current.id));
    return {
      ...(next ?? previous),
      lookupOutcome: evidence?.outcome,
      missingChecks: evidence?.missingChecks,
      possibleCancellation: evidence?.outcome === "missing" && evidence.missingChecks >= 5,
    };
  });
}

/** Manual action only. Read saved search evidence under the same flight lock. */
export async function applyStoredGoogleScheduleSync(id: number, requested: GoogleSchedule,
  database: Pick<typeof db, "transaction"> = db) {
  return database.transaction(async tx => {
    const [current] = await tx.select().from(flightsTable).where(eq(flightsTable.id, id)).for("update");
    if (!current || current.status === "soldout" || current.status === "cancelled"
      || await googleMonitoringDisabled(id, tx)) throw new Error("Fluturimi nuk lejon sinkronizim Google.");
    const [stored] = await tx.select().from(settingsTable).where(eq(settingsTable.key, scheduleEvidenceKey(id)));
    const evidence = stored?.value ? JSON.parse(stored.value) : null;
    const schedule = validatedGoogleSync(current, evidence, requested);
    const [updated] = await tx.update(flightsTable).set({
      ...schedule, scheduleAlert: null, scheduleAlertDetail: null, scheduleMissCount: 0,
      scheduleCheckedAt: new Date(), updatedAt: new Date(),
    }).where(eq(flightsTable.id, id)).returning();
    await tx.delete(settingsTable).where(eq(settingsTable.key, scheduleEvidenceKey(id)));
    return { before: current, updated, schedule };
  });
}