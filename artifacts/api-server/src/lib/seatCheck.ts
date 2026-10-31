import { db, flightsTable, settingsTable, tasksTable, taskNotificationsTable, bookingUsersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { triggerCpExportSoon } from "./cpExport.js";
import { sendEmail, seatSoldOutEmail } from "./gmail.js";
import { fetchGoogleJson, type GoogleRequestPriority } from "./rapidLimiter.js";
import { googleMonitoringFlights as flightsEligibleForGoogleLookup } from "./googleMonitoringPolicy.js";
import { notifyDataChanged } from "./liveEvents.js";
import {
  applySeatCheckResultTransaction,
  // Kept as a stable export from this module for existing callers.
  type SeatCheckDatabase,
  type SeatCheckWriteOptions,
  type SeatCheckWriteResult,
} from "./seatCheckTransaction.js";
import { SEAT_MISS_THRESHOLD } from "./seatCheckState.js";
import { isModuleEnabled } from "./moduleControls.js";

// ── Seat-availability check vs Google Flights ────────────────────────────────
// Completely separate from the existing schedule/price check (fetchGoogleFlightSchedules).
// Searches Google for N persons; if a flight no longer appears with a price for that
// party size, it is flagged with `seatAlert` so it surfaces in the "Njoftime" tab.

export const SEAT_CHECK_KEYS = {
  enabled: "seatCheck.enabled",
  days: "seatCheck.days",
  minSeats: "seatCheck.minSeats",
  intervalHours: "seatCheck.intervalHours",
  flaggedIntervalMinutes: "seatCheck.flaggedIntervalMinutes",
  autoSoldOut: "seatCheck.autoSoldOut",
  refreshPrices: "seatCheck.refreshPrices",
  soldOutTask: "seatCheck.soldOutTask",
  lastRunAt: "seatCheck.lastRunAt",
} as const;

const DEFAULTS = { enabled: false, days: 10, minSeats: 5, intervalHours: 12, autoSoldOut: false, refreshPrices: false, soldOutTask: false };

// Number of consecutive valid "no seats" results required before a flight is
// flagged sold-out (when autoSoldOut is on). Manual and automatic checks share
// this same counter; upstream errors never reach the writer.
export { SEAT_MISS_THRESHOLD };

/**
 * Persist one valid Google seat observation.
 *
 * The flight row is locked for the whole read/derive/write transaction. This
 * is shared by the automatic warmer and the manual selected-flight check so
 * concurrent checks cannot lose a miss or both perform the third-miss
 * transition. History, CP export and live notifications happen only after the
 * transaction commits.
 */
export async function applySeatCheckResult(
  opts: SeatCheckWriteOptions,
  database: SeatCheckDatabase = db,
): Promise<SeatCheckWriteResult> {
  const committed = await applySeatCheckResultTransaction(opts, database);

  if (committed.transitionedToSoldOut && committed.oldStatus) {
    triggerCpExportSoon();
    notifyDataChanged("flights");
  }
  return committed;
}

export type SeatCheckConfig = {
  enabled: boolean;
  days: number;
  minSeats: number;
  intervalHours: number;
  flaggedIntervalMinutes: number;
  autoSoldOut: boolean;
  // When on, the same run also re-checks Google prices for the flights inside the
  // window and re-applies the price rules (folds the price refresh into this one check).
  refreshPrices: boolean;
  // When on, an in-app task (+ notification) is created for every flight that
  // gets auto-marked Sold Out. The email notification is always sent regardless.
  soldOutTask: boolean;
  lastRunAt: string | null;
};

function normFlightNum(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase().trim();
}

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
  } else {
    await db.insert(settingsTable).values({ key, value });
  }
}

export async function getSeatCheckConfig(): Promise<SeatCheckConfig> {
  const [enabled, days, minSeats, intervalHours, autoSoldOut, refreshPrices, soldOutTask, lastRunAt, flaggedIntervalMinutes] = await Promise.all([
    getSetting(SEAT_CHECK_KEYS.enabled),
    getSetting(SEAT_CHECK_KEYS.days),
    getSetting(SEAT_CHECK_KEYS.minSeats),
    getSetting(SEAT_CHECK_KEYS.intervalHours),
    getSetting(SEAT_CHECK_KEYS.autoSoldOut),
    getSetting(SEAT_CHECK_KEYS.refreshPrices),
    getSetting(SEAT_CHECK_KEYS.soldOutTask),
    getSetting(SEAT_CHECK_KEYS.lastRunAt),
    getSetting(SEAT_CHECK_KEYS.flaggedIntervalMinutes),
  ]);
  return {
    enabled: enabled === "true",
    days: Math.max(1, parseInt(days ?? "", 10) || DEFAULTS.days),
    minSeats: Math.max(1, parseInt(minSeats ?? "", 10) || DEFAULTS.minSeats),
    // Floor at 1 minute (1/60 h) so admin-typed sub-30-min intervals are honored.
    intervalHours: Math.max(1 / 60, parseFloat(intervalHours ?? "") || DEFAULTS.intervalHours),
    flaggedIntervalMinutes: Math.max(1, parseInt(flaggedIntervalMinutes ?? "", 10) || 5),
    autoSoldOut: autoSoldOut === "true",
    refreshPrices: refreshPrices === "true",
    soldOutTask: soldOutTask === "true",
    lastRunAt: lastRunAt ?? null,
  };
}

export async function saveSeatCheckConfig(cfg: Partial<SeatCheckConfig>): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (cfg.enabled !== undefined)       tasks.push(setSetting(SEAT_CHECK_KEYS.enabled, cfg.enabled ? "true" : "false"));
  if (cfg.days !== undefined)          tasks.push(setSetting(SEAT_CHECK_KEYS.days, String(cfg.days)));
  if (cfg.minSeats !== undefined)      tasks.push(setSetting(SEAT_CHECK_KEYS.minSeats, String(cfg.minSeats)));
  if (cfg.intervalHours !== undefined) tasks.push(setSetting(SEAT_CHECK_KEYS.intervalHours, String(cfg.intervalHours)));
  if (cfg.flaggedIntervalMinutes !== undefined) tasks.push(setSetting(SEAT_CHECK_KEYS.flaggedIntervalMinutes, String(cfg.flaggedIntervalMinutes)));
  if (cfg.autoSoldOut !== undefined)   tasks.push(setSetting(SEAT_CHECK_KEYS.autoSoldOut, cfg.autoSoldOut ? "true" : "false"));
  if (cfg.refreshPrices !== undefined) tasks.push(setSetting(SEAT_CHECK_KEYS.refreshPrices, cfg.refreshPrices ? "true" : "false"));
  if (cfg.soldOutTask !== undefined)   tasks.push(setSetting(SEAT_CHECK_KEYS.soldOutTask, cfg.soldOutTask ? "true" : "false"));
  await Promise.all(tasks);
}

type SeatAvailResult = {
  availableFlightNumbers: Set<string>; // flight numbers that appear with a price for N persons
  flightPriceMap: Record<string, number>; // normalised flight number → cheapest itinerary price for N persons
  error: boolean; // true when the upstream fetch failed (vs. legitimately empty)
};

// Query Google Flights for a route+date for a specific party size.
export async function fetchGoogleSeatAvailability(
  from: string, to: string, isoDate: string, persons: number, priority?: GoogleRequestPriority
): Promise<SeatAvailResult> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return { availableFlightNumbers: new Set(), flightPriceMap: {}, error: true };

  const url = new URL("https://google-flights2.p.rapidapi.com/api/v1/searchFlights");
  url.searchParams.set("departure_id",  from.toUpperCase());
  url.searchParams.set("arrival_id",    to.toUpperCase());
  url.searchParams.set("outbound_date", isoDate);
  url.searchParams.set("currency",      "EUR");
  url.searchParams.set("type",          "2"); // one-way
  url.searchParams.set("adults",        String(persons));

  try {
    // 55s (NOT 25s): legitimate seat responses can take 26–40s. The
    // coordinator retains the slot until the body has been consumed.
    const resp = await fetchGoogleJson(url, apiKey, 55_000, priority);
    if (!resp.ok) {
      logger.warn({ from, to, date: isoDate, persons, httpStatus: resp.status }, "[seat-check] fetch failed (HTTP)");
      return { availableFlightNumbers: new Set(), flightPriceMap: {}, error: true };
    }
    const data: any = resp.data;

    const topFlights: any[]   = data?.data?.itineraries?.topFlights   ?? [];
    const otherFlights: any[] = data?.data?.itineraries?.otherFlights ?? [];
    const allItineraries = [...topFlights, ...otherFlights];

    // PËRGJIGJE BOSHE ≠ "s'ka vende": kur upstream-i mbingarkohet, kthen 200 OK
    // me trup bosh (0 itinerare fare). Rrugët tona kanë gjithmonë ndonjë fluturim
    // në Google, kështu që bosh = përgjigje e degraduar; po ta numëronim si
    // mungesë, çdo fluturim i grupit merrte miss njëherësh (stuhia 27.07.2026).
    // error:true → ri-provohet me 5s/10s vonesë, pastaj grupi anashkalohet.
    if (allItineraries.length === 0) {
      logger.warn({ from, to, date: isoDate, persons }, "[seat-check] empty response (0 itineraries) — treated as upstream error, NOT as missing seats");
      return { availableFlightNumbers: new Set(), flightPriceMap: {}, error: true };
    }

    const availableFlightNumbers = new Set<string>();
    const flightPriceMap: Record<string, number> = {};

    for (const itinerary of allItineraries) {
      const itinPrice = Number(itinerary?.price ?? 0);
      const flightLegs: any[] = itinerary?.flights ?? itinerary?.legs ?? itinerary?.segments ?? [];
      for (const leg of flightLegs) {
        const rawNum = leg?.flight_number ?? leg?.flightNumber ?? leg?.number ?? "";
        const flightNum = normFlightNum(String(rawNum));
        if (!flightNum) continue;
        availableFlightNumbers.add(flightNum);
        if (itinPrice > 0 && (flightPriceMap[flightNum] === undefined || itinPrice < flightPriceMap[flightNum])) {
          flightPriceMap[flightNum] = itinPrice;
        }
      }
    }

    // Itinerare KA, por asnjë numër fluturimi s'u lexua dot → formati i
    // përgjigjes ka ndryshuar (parse drift); mos i numëro miss askujt.
    if (availableFlightNumbers.size === 0) {
      logger.warn({ from, to, date: isoDate, persons, itineraries: allItineraries.length }, "[seat-check] parsed 0 flight numbers from non-empty response — treated as upstream error");
      return { availableFlightNumbers: new Set(), flightPriceMap: {}, error: true };
    }

    return { availableFlightNumbers, flightPriceMap, error: false };
  } catch (err: any) {
    // TimeoutError = upstream s'u përgjigj brenda 55s; të tjerat = gabim rrjeti.
    logger.warn({ from, to, date: isoDate, persons, errName: err?.name ?? "Error" }, "[seat-check] fetch failed (network/timeout)");
    return { availableFlightNumbers: new Set(), flightPriceMap: {}, error: true };
  }
}

let seatCheckRunning = false;

export type SeatCheckRunResult = {
  ran: boolean;
  reason?: string;
  flightsChecked: number;
  flagged: number;
  cleared: number;
  soldOut: number;
  apiErrorGroups: number;
  // Number of route-date groups whose Google prices were refreshed when the
  // "also refresh prices" option is enabled (0 when the option is off).
  pricesRefreshed?: number;
};

// Shared core: checks the given flights (grouped per route+date) against Google,
// updates alerts/miss counters, auto-sold-outs and notifications. Used by both the
// full interval run and the 5-minute fast re-check of flagged flights.
type SeatCheckRunContext = {
  requestStartedAt: Date;
  windowStart: string;
  windowEnd: string;
};

async function processSeatGroups(
  flights: Array<typeof flightsTable.$inferSelect>,
  cfg: SeatCheckConfig,
  context: SeatCheckRunContext,
): Promise<{ checked: number; flagged: number; cleared: number; soldOut: number; apiErrorGroups: number; checkedAt: Date }> {
  flights = await flightsEligibleForGoogleLookup(flights);
  // Group by route + date so we make one API call per group.
  const groups = new Map<string, typeof flights>();
  for (const f of flights) {
    const key = `${f.fromCity.toUpperCase()}|${f.toCity.toUpperCase()}|${f.departureDate}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  let flagged = 0, cleared = 0, soldOut = 0, apiErrorGroups = 0, checked = 0;
  const checkedAt = new Date();
  // Flights newly auto-marked sold out this run — used for the email + tasks.
  const newlySoldOut: Array<{
    id: number;
    airline: string | null;
    flightNumber: string | null;
    route: string;
    departureDate: string | null;
    googlePrice: number | null;
  }> = [];

  try {
    for (const [key, queuedFlights] of groups) {
      const groupFlights = await flightsEligibleForGoogleLookup(queuedFlights);
      if (!groupFlights.length) continue;
      const [from, to, date] = key.split("|");
      // Deri në 3 tentativa për grup: dështimet e përkohshme të RapidAPI-t më parë
      // e kapërcenin grupin plotësisht dhe fluturimet e tij mbeteshin pa kontroll.
      let result = await fetchGoogleSeatAvailability(from, to, date, cfg.minSeats);
      for (let attempt = 2; result.error && attempt <= 3; attempt++) {
        // 5s/10s (jo 2s/4s): kur upstream-i është i mbingarkuar, ri-provat e
        // menjëhershme godasin të njëjtën gjendje dhe dështojnë të treja.
        await new Promise(r => setTimeout(r, 5000 * (attempt - 1)));
        if (!(await flightsEligibleForGoogleLookup(groupFlights)).length) break;
        result = await fetchGoogleSeatAvailability(from, to, date, cfg.minSeats);
      }
      if (result.error) {
        // Don't overwrite anything on API outage.
        apiErrorGroups++;
        logger.warn({ group: key }, "[seat-check] group skipped after 3 failed API attempts");
        continue;
      }

      const observedAt = new Date();
      for (const f of groupFlights) {
        checked++;
        const fnum = normFlightNum(f.flightNumber);
        const available = result.availableFlightNumbers.has(fnum);
        const price = result.flightPriceMap[fnum] ?? null;
        const write = await applySeatCheckResult({
          flightId: f.id,
          available,
          minSeats: cfg.minSeats,
          autoSoldOut: cfg.autoSoldOut,
          checkedAt: observedAt,
          snapshot: {
            fromCity: f.fromCity,
            toCity: f.toCity,
            departureDate: f.departureDate,
            flightNumber: f.flightNumber,
            windowStart: context.windowStart,
            windowEnd: context.windowEnd,
            requestStartedAt: context.requestStartedAt,
          },
          googlePrice: price,
        });
        if (write.applied && write.seatAlert && write.seatAlert !== write.previousSeatAlert) flagged++;
        if (write.applied && !write.seatAlert && write.previousSeatAlert) cleared++;
        if (write.applied && write.transitionedToSoldOut) {
          soldOut++;
          newlySoldOut.push({
            id: f.id,
            airline: f.airline ?? null,
            flightNumber: f.flightNumber ?? null,
            route: `${f.fromCity} → ${f.toCity}`,
            departureDate: f.departureDate ?? null,
            googlePrice: price,
          });
        }
      }
    }
  } finally {
    // Flush after every committed transition even when a later group fails.
    if (newlySoldOut.length > 0) {
      await notifySoldOut(newlySoldOut.splice(0), cfg.minSeats);
    }
  }

  return { checked, flagged, cleared, soldOut, apiErrorGroups, checkedAt };
}

// Runs the seat-availability check for all upcoming flights inside the configured window.
export async function runSeatAvailabilityCheck(force = false): Promise<SeatCheckRunResult> {
  if (seatCheckRunning) return { ran: false, reason: "already_running", flightsChecked: 0, flagged: 0, cleared: 0, soldOut: 0, apiErrorGroups: 0 };
  const requestStartedAt = new Date();
  const cfg = await getSeatCheckConfig();
  if (!force && !cfg.enabled) {
    return { ran: false, reason: "disabled", flightsChecked: 0, flagged: 0, cleared: 0, soldOut: 0, apiErrorGroups: 0 };
  }

  seatCheckRunning = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date();
    until.setDate(until.getDate() + cfg.days);
    const untilStr = until.toISOString().slice(0, 10);

    // Only upcoming, sellable flights inside the window. Skip cancelled/sold-out.
    // "Përjashtuar Online" flights are still checked and may receive an alert,
    // but processSeatGroups prevents Google misses from auto-marking them sold out.
    const flights = await db.select().from(flightsTable).where(and(
      gte(flightsTable.departureDate, today),
      lte(flightsTable.departureDate, untilStr),
      sql`${flightsTable.status} IN ('open', 'closed')`,
    ));

    const { checked, flagged, cleared, soldOut, apiErrorGroups, checkedAt } = await processSeatGroups(flights, cfg, {
      requestStartedAt,
      windowStart: today,
      windowEnd: untilStr,
    });

    await setSetting(SEAT_CHECK_KEYS.lastRunAt, checkedAt.toISOString());
    logger.info({ flightsChecked: checked, flagged, cleared, soldOut, apiErrorGroups, persons: cfg.minSeats, autoSoldOut: cfg.autoSoldOut }, "Seat availability check complete");

    // Optionally fold the Google PRICE refresh into this same check (same window):
    // re-fetch the standard single-adult Google price for the flights inside the
    // window and re-apply the price rules so the sale price reflects the fresh
    // price. Uses the seat-check `days` window so both checks stay in sync.
    // Dynamic import avoids a static circular dependency (flights.ts imports this file).
    let pricesRefreshed = 0;
    // This is a PRICE-ONLY optional add-on. Never stop seat safety checks,
    // sold-out protection or their notifications when Google Prices is off.
    if (cfg.refreshPrices && await isModuleEnabled("googlePrices")) {
      try {
        const { warmSoonFlights, applyGooglePriceRulesToFlights } = await import("../routes/flights.js");
        pricesRefreshed = await warmSoonFlights(cfg.days, true);
        if (pricesRefreshed > 0 && await isModuleEnabled("googlePrices")) {
          // Source string encodes manual vs automatic for the price-report-email gating
          // (manual = no "automatik" substring; scheduler = contains "automatik").
          const source = force ? "Kontroll manual (Kontrolli i Vendeve)" : "Rifreskim automatik (Kontrolli i Vendeve)";
          await applyGooglePriceRulesToFlights(source);
        }
      } catch (err) {
        logger.error({ err }, "[seat-check] price refresh step failed");
      }
    }

    return { ran: true, flightsChecked: checked, flagged, cleared, soldOut, apiErrorGroups, pricesRefreshed };
  } finally {
    seatCheckRunning = false;
  }
}

// Independent, configurable re-check for flights at 1/3 or 2/3.
// The shared request limiter and locked result writer still apply.
let flaggedRecheckRunning = false;

export async function runFlaggedFastRecheck(): Promise<void> {
  if (flaggedRecheckRunning) return;
  // Reserve before any await; independent of full/manual checks.
  flaggedRecheckRunning = true;
  try {
    const requestStartedAt = new Date();
    const cfg = await getSeatCheckConfig();
    if (!cfg.enabled) return;

    const today = new Date().toISOString().slice(0, 10);
    const until = new Date();
    until.setDate(until.getDate() + cfg.days);
    const untilStr = until.toISOString().slice(0, 10);
    const staleBefore = new Date(Date.now() - cfg.flaggedIntervalMinutes * 60 * 1000);

    // Vetëm fluturimet me alarm aktiv "pa vende" që s'kanë arritur ende pragun,
    // dhe që kanë kaluar intervalin e konfigurueshëm nga kontrolli i fundit.
    const flights = await db.select().from(flightsTable).where(and(
      gte(flightsTable.departureDate, today),
      lte(flightsTable.departureDate, untilStr),
      sql`${flightsTable.status} IN ('open', 'closed')`,
      eq(flightsTable.seatAlert, "low_seats"),
      sql`COALESCE(${flightsTable.seatMissCount}, 0) BETWEEN 1 AND ${SEAT_MISS_THRESHOLD - 1}`,
      sql`${flightsTable.seatCheckedAt} IS NOT NULL AND ${flightsTable.seatCheckedAt} <= ${staleBefore}`,
    ));
    if (flights.length === 0) return;

    const { checked, flagged, cleared, soldOut, apiErrorGroups } = await processSeatGroups(flights, cfg, {
      requestStartedAt,
      windowStart: today,
      windowEnd: untilStr,
    });
    logger.info({ flightsChecked: checked, flagged, cleared, soldOut, apiErrorGroups }, "[seat-check] fast re-check of flagged flights complete");
  } catch (e) {
    logger.error({ err: e }, "[seat-check] fast re-check failed");
  } finally {
    flaggedRecheckRunning = false;
  }
}

// Notify managers + admins about flights that were auto-marked Sold Out:
// 1) one email (to NOTIFY_EMAIL) listing all of them, and
// 2) one in-app task per flight, assigned to a manager (fallback admin), with
//    both manager+admin as watchers, explaining WHY it went sold out.
// Deduped per flight via autoRuleKey so re-runs never create duplicate tasks.
export async function notifySoldOut(
  flights: Array<{ id: number; airline: string | null; flightNumber: string | null; route: string; departureDate: string | null; googlePrice: number | null }>,
  minSeats: number,
): Promise<void> {
  // 1) Email
  try {
    const to = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
    if (to) {
      await sendEmail(to, `⛔ ${flights.length} fluturime dolën Sold Out`, seatSoldOutEmail(flights, minSeats));
    } else {
      logger.warn("[seat-check] No NOTIFY_EMAIL/SMTP_USER configured — skipping sold-out email");
    }
  } catch (err) {
    logger.error({ err }, "[seat-check] failed to send sold-out email");
  }

  // 2) In-app tasks for manager + admin — only when the admin toggle is ON.
  try {
    const cfgForTask = await getSeatCheckConfig();
    if (!cfgForTask.soldOutTask) {
      logger.info("[seat-check] sold-out task creation is OFF (seatCheck.soldOutTask) — skipping tasks");
      return;
    }
    const staff = await db.select().from(bookingUsersTable)
      .where(inArray(bookingUsersTable.role, ["admin", "manager"]));
    const admins = staff.filter(u => u.role === "admin");
    const managers = staff.filter(u => u.role === "manager");
    const adminId = admins[0]?.id ?? null;
    const managerId = managers[0]?.id ?? null;
    const creatorId = adminId ?? managerId;
    if (creatorId == null) {
      logger.warn("[seat-check] No admin/manager user found — skipping sold-out tasks");
      return;
    }
    const assigneeId = managerId ?? adminId!;
    const watchers = Array.from(new Set([adminId, managerId].filter((x): x is number => x != null)));

    for (const f of flights) {
      const ruleKey = `seat_soldout:${f.id}`;
      // Skip if a task for this flight already exists (any status).
      const existing = await db.select({ id: tasksTable.id }).from(tasksTable)
        .where(eq(tasksTable.autoRuleKey, ruleKey)).limit(1);
      if (existing.length > 0) continue;

      const fname = [f.airline, f.flightNumber].filter(Boolean).join(" ") || "Fluturim";
      const title = `Sold Out: ${fname} (${f.route})`;
      const description =
        `Fluturimi ${fname} në rrugën ${f.route}` +
        (f.departureDate ? ` më ${f.departureDate}` : "") +
        ` doli automatikisht Sold Out.\n\n` +
        `Arsyeja: kontrolli automatik i vendeve nuk gjeti ${minSeats} vende të disponueshme në Google për këtë fluturim` +
        (f.googlePrice != null ? ` (çmimi i fundit në Google: €${Math.round(Number(f.googlePrice))})` : "") +
        `. Shitja u ndal automatikisht.`;

      const [task] = await db.insert(tasksTable).values({
        title,
        description,
        status: "todo",
        priority: "high",
        assigneeId,
        creatorId,
        entityType: "flight",
        entityId: f.id,
        labels: ["Sold Out"],
        watchers,
        autoGenerated: true,
        autoRuleKey: ruleKey,
      }).returning();

      // In-app notifications for both manager and admin.
      if (task && watchers.length > 0) {
        await db.insert(taskNotificationsTable).values(
          watchers.map(uid => ({
            userId: uid,
            taskId: task.id,
            type: "soldout",
            title: `Fluturim Sold Out: ${fname}`,
            body: f.route,
          })),
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "[seat-check] failed to create sold-out tasks");
  }
}

// Scheduler: ticks every minute and runs the check when intervalHours has elapsed
// since the last run. A 1-minute tick lets admin-typed minute intervals fire on
// time. Reading settings each tick lets config changes take effect without a restart.
export function startSeatCheckScheduler(): void {
  const TICK_MS = 60 * 1000;
  const tick = async () => {
    try {
      const cfg = await getSeatCheckConfig();
      if (!cfg.enabled) return;
      const last = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0;
      const dueAt = last + cfg.intervalHours * 60 * 60 * 1000;
      // Start independently even when the full run is due or already running.
      void runFlaggedFastRecheck();
      if (Date.now() >= dueAt) {
        await runSeatAvailabilityCheck();
      }
    } catch (e) {
      logger.error({ err: e }, "Seat check scheduler tick failed");
    }
  };
  // First tick shortly after boot, then on the interval.
  setTimeout(tick, 30_000);
  setInterval(tick, TICK_MS);
}
