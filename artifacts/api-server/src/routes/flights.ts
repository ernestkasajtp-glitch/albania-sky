import { Router, type IRouter } from "express";
import { readGoogleRefreshSchedule, saveGoogleRefreshTime } from "../lib/googleRefreshSchedule";
import { isRefreshTime } from "../lib/googleRefreshTime";
import { loadSuspectRechecks } from "../lib/suspectFlightRecheck.js";
import { notifyDataChanged } from "../lib/liveEvents.js";
import { readFlightDiscount, readFlightDiscounts, readManualFlightDiscounts, flightDiscountKey, parseFlightDiscount, applyFlightDiscount } from "../lib/flightDiscounts";
import { NewPriceProgress } from "../lib/newPriceProgress.js";
import { reportPdfText } from "../lib/reportPdfText.js";
import { reportOperationalFailure } from "../lib/operationalFailures.js";
import { randomUUID } from "node:crypto";
import { eq, sql, and, or, ilike, gte, lte, lt, inArray, asc, desc, count, type SQL } from "drizzle-orm";
import multer from "multer";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import nodemailer from "nodemailer";
import { Readable } from "stream";
import { db, flightsTable, settingsTable, flightPriceHistoryTable, flightSeatHistoryTable, flightChangeHistoryTable, googlePriceCacheTable, foundFlightsTable, bookingsTable, passengersTable, tasksTable, flightNotesTable, agentFlightDefaultRulesTable } from "@workspace/db";
import { recordSeatEvent } from "../lib/seatHistory.js";
import { sendEmail, priceSyncEmail, type PriceSyncRow } from "../lib/gmail.js";
import { sendPriceRefreshReport } from "../lib/priceReportFiles.js";
import { scheduleGSheetsSync } from "../lib/googleSheets.js";
import { applySeatCheckResult, fetchGoogleSeatAvailability, getSeatCheckConfig, notifySoldOut } from "../lib/seatCheck.js";
import { isModuleEnabled } from "../lib/moduleControls.js";
import { fetchWhileEnabled } from "../lib/backgroundWork.js";
import {
  googleMonitoringFlights as flightsEligibleForGoogleLookup,
  googleMonitoringDisabledIds, googleMonitoringDisabled, googleMonitoringEnabledSql,
  saveGoogleMonitoringDisabled,
} from "../lib/googleMonitoringPolicy.js";
import { computePriceWrite, googlePriceResponse, savedGooglePrice, googleSearchItineraries } from "../lib/googlePriceCachePolicy.js";
import { applyGoogleSearchScheduleAlert, applyStoredGoogleScheduleSync } from "../lib/googleScheduleAlerts.js";
import { googleDateTime, googleScheduleChanges, matchingGoogleSchedule, googleScheduleSearchEvidence } from "../lib/googleScheduleEvidence.js";
import { readPriceRetry, retryKey } from "../lib/stalePriceRetry.js";
import { staleGooglePriceSql } from "../lib/staleGooglePriceSql.js";
import { inventoryNoPriceSql, inventoryNoPriceReasonSql } from "../lib/inventoryNoPrice.js";
import { googleLookupFailure, type GoogleLookupFailure } from "../lib/googleLookupDiagnostic.js";
import { monitorNewPriceGroup } from "../lib/newPriceMonitoring.js";
import { possibleCancellationSql } from "../lib/possibleCancellationSql.js";
import { fetchGoogleJson, GoogleResponseJsonError, manualGooglePriority, type GoogleRequestPriority } from "../lib/rapidLimiter.js";
import { GooglePriceWarmerQueue } from "../lib/googlePriceWarmerQueue.js";
import { triggerCpExportSoon } from "../lib/cpExport.js";
import { scheduleNextAutoSoldOut, flipSoldOutIfFull, flipSoldOutIfFullBulk, closeTsSql, getSellCutoffHours, getConfirmedSellCutoffHours } from "../lib/autoSoldOut.js";
import { clearOversellIfResolved, clearOversellIfResolvedBulk } from "../lib/oversell.js";
import { recordScheduleChange } from "../lib/scheduleChangeNotify.js";
import { fmtAmPm } from "../lib/timeFormat.js";
import { logger } from "../lib/logger.js";
import { normalizeAirportCode } from "../lib/airports.js";
import { flightTypeIdentity, normalizeFlightIdentifierPatch, normalizeFlightIdentifiers } from "../lib/flightIdentifiers.js";
import { formatFlightSalesSummary } from "../lib/flightSalesSummary.js";
import { getActiveGooglePriceRules, findGoogleRuleForFlight, computeGoogleSalePrice, computeGoogleOfflinePrice } from "../lib/googlePriceRules.js";
import {
  getCitizenPricingSettings,
  computeCitizenAdultPrice,
  computeCitizenDefault,
  citizenPriceSource,
  parseMoney as parseCitizenMoney,
  round2 as round2Citizen,
  CITIZEN_MARKUP_TYPE_KEY,
  CITIZEN_MARKUP_VALUE_KEY,
  CITIZEN_PRICING_KEYS,
  type CitizenMarkupType,
} from "../lib/citizenPricing.js";
import {
  ListFlightsQueryParams,
  CreateFlightBody,
  GetFlightParams,
  UpdateFlightParams,
  UpdateFlightBody,
  DeleteFlightParams,
  DuplicateFlightParams,
  ToggleFlightSalesParams,
  ToggleFlightSalesBody,
} from "@workspace/api-zod";
import { normalizeMonetaryFields, roundWholeEuro, formatWholeEuro } from "../lib/money.js";
import { groupFlightCondition, resolveGroupFlightFilter } from "../lib/groupFlightFilter.js";
import { noGoogleRuleFlightsSql } from "../lib/noGoogleRuleFlights.js";
import { calendarDateMs, FlightScheduleValidationError, normalizeArrivalDate, scheduleFieldsTouched, upcomingScheduleErrors } from "../lib/flightScheduleIntegrity.js";
export { normalizeArrivalDate } from "../lib/flightScheduleIntegrity.js";

const router: IRouter = Router();
router.use(manualGooglePriority);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FLIGHTS_GLOBAL_TABS_CACHE_TTL_MS = 15_000;

// A fresh, narrow read keeps the badge, filtered total, pagination and select-all
// consistent after writes. No unsafe timestamp casts, Google checks or polling.
async function readScheduleErrors(groupFilter: SQL | undefined, now: string) {
  const rows = await db.select({
    id: flightsTable.id, status: flightsTable.status,
    departureDate: flightsTable.departureDate, departureTime: flightsTable.departureTime,
    arrivalDate: flightsTable.arrivalDate, arrivalTime: flightsTable.arrivalTime,
  }).from(flightsTable).where(and(groupFilter,
    sql`${flightsTable.status} NOT IN ('soldout', 'cancelled')`));
  return upcomingScheduleErrors(rows, now);
}

function scheduleErrorIdsCondition(errors: Map<number, string>): SQL {
  const ids = [...errors.keys()];
  return ids.length ? inArray(flightsTable.id, ids) : sql`false`;
}

async function scheduleErrorWeekdayCondition(errors: Map<number, string>, weekdays: number[]): Promise<SQL> {
  if (!errors.size) return sql`false`;
  const rows = await db.select({ id: flightsTable.id, date: flightsTable.departureDate })
    .from(flightsTable).where(scheduleErrorIdsCondition(errors));
  const ids = rows.filter(row => {
    const ms = calendarDateMs(row.date);
    return ms !== null && weekdays.includes(new Date(ms).getUTCDay());
  }).map(row => row.id);
  return ids.length ? inArray(flightsTable.id, ids) : sql`false`;
}

async function queryFlightsGlobalTabData({
  today,
  tiraneNow,
  soonEndDate,
  groupFilter,
}: {
  today: string;
  tiraneNow: string;
  soonEndDate: string;
  groupFilter?: SQL;
}) {
  const notDeparted = sql`(${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) >= ${tiraneNow}`;
  const dupCondition = sql`(${flightsTable.fromCity}, ${flightsTable.toCity}, ${flightsTable.departureDate}, ${flightsTable.departureTime}, ${flightsTable.flightNumber}) IN (SELECT from_city, to_city, departure_date, departure_time, flight_number FROM ${flightsTable} GROUP BY from_city, to_city, departure_date, departure_time, flight_number HAVING count(*) > 1)`;

  const [
    statusCounts,
    [{ pastCnt }],
    [{ alertCnt }],
    [{ dupCnt }],
    [{ confirmedCnt }],
    [{ soonCnt }],
    [{ bookedCnt }],
    [{ noPriceCnt }],
    [{ staleCnt }],
    [{ excludedCnt }],
    [{ suspiciousCnt }],
    [{ noRuleCnt }],
    [{ noGroupCnt }],
    dupGroups,
  ] = await Promise.all([
    // Status tab counts reflect UPCOMING flights only (past flights live under the "past" tab).
    db.select({ status: flightsTable.status, cnt: count(), googleCnt: sql<number>`count(*) FILTER (WHERE ${googleMonitoringEnabledSql()})` }).from(flightsTable).where(and(groupFilter, gte(flightsTable.departureDate, today))).groupBy(flightsTable.status),
    db.select({ pastCnt: count() }).from(flightsTable).where(and(groupFilter, lt(flightsTable.departureDate, today))),
    // "Njoftime" tab: not-yet-departed flights (date+time) carrying a schedule OR seat alert.
    db.select({ alertCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, notificationAlertsSql())),
    // "Dublikate" tab: not-yet-departed flights that are duplicates of another flight.
    db.select({ dupCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, dupCondition)),
    // "Konfirmuar" tab: not-yet-departed flights with an acknowledged alert and no active alert.
    db.select({ confirmedCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, sql`(${flightsTable.alertDismissedAt} IS NOT NULL AND ${flightsTable.scheduleAlert} IS NULL AND ${flightsTable.seatAlert} IS NULL)`)),
    // "Të Aferta" tab: upcoming OPEN flights within the next N days (configurable from Settings).
    db.select({ soonCnt: count() }).from(flightsTable).where(and(groupFilter, gte(flightsTable.departureDate, today), lte(flightsTable.departureDate, soonEndDate), eq(flightsTable.status, "open"))),
    // "Të Konfirmuara" tab: not-yet-departed OPEN flights manually marked as confirmed (is_confirmed).
    db.select({ bookedCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, eq(flightsTable.status, "open"), sql`${flightsTable.isConfirmed} = true`)),
    // "Pa Çmim" tab: not-yet-departed flights whose Google price cache resolved to NULL (sold-out excluded).
    db.select({ noPriceCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, inventoryNoPriceSql())),
    // Unverified Google prices (including failed null rows); sold-out excluded.
    db.select({ staleCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, sql`${flightsTable.status} != 'soldout'`, staleGooglePriceSql())),
    // "Përjashtuar Online" tab: not-yet-departed ACTIVE flights (sold-out/cancelled hidden)
    // excluded from the Google price rule.
    db.select({ excludedCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, googleMonitoringEnabledSql(), eq(flightsTable.excludeFromGoogleRule, true), sql`${flightsTable.status} != 'soldout'`, sql`${flightsTable.status} != 'cancelled'`)),
    db.select({ suspiciousCnt: count() }).from(flightsTable).where(and(groupFilter, notDeparted, suspiciousFlightsSql())),
    (async () => db.select({ noRuleCnt: count() }).from(flightsTable)
      .where(and(groupFilter, await noGoogleRuleFlightsSql(tiraneNow))))(),
    db.select({ noGroupCnt: count() }).from(flightsTable)
      .where(and(groupFilter, notDeparted, sql`NOT (${groupFlightCondition()})`)),
    db.select({
      fromCity: flightsTable.fromCity,
      toCity: flightsTable.toCity,
      departureDate: flightsTable.departureDate,
      departureTime: flightsTable.departureTime,
      flightNumber: flightsTable.flightNumber,
    }).from(flightsTable).where(groupFilter)
      .groupBy(flightsTable.fromCity, flightsTable.toCity, flightsTable.departureDate, flightsTable.departureTime, flightsTable.flightNumber)
      .having(sql`count(*) > 1`),
  ]);

  return { statusCounts, pastCnt, alertCnt, dupCnt, confirmedCnt, soonCnt, bookedCnt, noPriceCnt, staleCnt, excludedCnt, suspiciousCnt, noRuleCnt, noGroupCnt, dupGroups };
}

type FlightsGlobalTabData = Awaited<ReturnType<typeof queryFlightsGlobalTabData>>;

const flightsGlobalTabsCache = new Map<string, {
  expiresAt: number;
  promise: Promise<FlightsGlobalTabData>;
}>();

function getCachedFlightsGlobalTabData(inputs: {
  today: string;
  tiraneDate: string;
  tiraneMinute: string;
  soonEndDate: string;
  groupId?: number;
  groupFilter?: SQL;
}): Promise<FlightsGlobalTabData> {
  const key = `${inputs.today}|${inputs.tiraneDate}|${inputs.tiraneMinute}|${inputs.soonEndDate}|${inputs.groupId ?? "all"}`;
  const now = Date.now();
  const cached = flightsGlobalTabsCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  for (const [cachedKey, cachedEntry] of flightsGlobalTabsCache) {
    if (cachedEntry.expiresAt <= now) flightsGlobalTabsCache.delete(cachedKey);
  }

  const promise = queryFlightsGlobalTabData({
    today: inputs.today,
    tiraneNow: `${inputs.tiraneDate} ${inputs.tiraneMinute}`,
    soonEndDate: inputs.soonEndDate,
    groupFilter: inputs.groupFilter,
  });
  const entry = { expiresAt: now + FLIGHTS_GLOBAL_TABS_CACHE_TTL_MS, promise };
  flightsGlobalTabsCache.set(key, entry);
  void promise.catch(() => {
    // Never retain rejected work; a subsequent request must be allowed to retry.
    if (flightsGlobalTabsCache.get(key) === entry) flightsGlobalTabsCache.delete(key);
  });
  return promise;
}

async function getFlightSalesSummaryMap(flightIds: number[]) {
  if (!flightIds.length) {
    return new Map<number, ReturnType<typeof formatFlightSalesSummary>>();
  }

  const aggregates = await db.select({
    flightId: bookingsTable.flightId,
    bookingCount: sql<number>`COUNT(*)::int`,
    netCount: sql<number>`COUNT(${bookingsTable.netPrice})::int`,
    totalSales: sql<number>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)::double precision`,
    totalNet: sql<number>`COALESCE(SUM(${bookingsTable.netPrice}), 0)::double precision`,
    totalCommission: sql<number>`COALESCE(SUM(
      CASE
        WHEN ${bookingsTable.netPrice} IS NULL THEN COALESCE(${bookingsTable.markup}, 0)
        WHEN ${bookingsTable.netPrice} <= 0 THEN 0
        ELSE ${bookingsTable.totalAmount} - ${bookingsTable.netPrice}
      END
    ), 0)::double precision`,
  })
    .from(bookingsTable)
    .where(and(
      inArray(bookingsTable.flightId, flightIds),
      sql`${bookingsTable.status} <> 'cancelled'`,
    ))
    .groupBy(bookingsTable.flightId);

  return new Map(aggregates.map(row => [
    row.flightId,
    formatFlightSalesSummary(row),
  ]));
}

// Lightweight count of not-yet-departed flights carrying a schedule or seat
// alert ("Njoftime"). Used for the sidebar badge next to "Fluturimet".
router.get("/flights/alert-count", async (req, res): Promise<void> => {
  const tiraneNow = sql`(now() AT TIME ZONE 'Europe/Tirane')`;
  const notDeparted = sql`(${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) >= to_char(${tiraneNow}, 'YYYY-MM-DD HH24:MI')`;
  const [{ cnt }] = await db.select({ cnt: count() }).from(flightsTable)
    .where(and(notDeparted, notificationAlertsSql()));
  res.json({ count: Number(cnt) });
});

// Flights that are about to reach their sell-cutoff ("end selling") moment
// within the next 60 minutes. Powers the red warning banner shown at the top
// of every internal page so staff can react before sales close automatically.
router.get("/flights/closing-soon", async (req, res): Promise<void> => {
  // Përdor TË NJËJTËN llogaritje si mbyllja automatike (autoSoldOut):
  // fluturimet e konfirmuara (⭐) ndjekin rregullin e konfirmuar
  // (confirmed_sell_cutoff_hours + zhvendosja 00:30–09:00), jo kufirin
  // për-fluturim — që banner-i të mos tregojë orë të gabuar.
  const globalCutoff = await getSellCutoffHours();
  const confirmedCutoff = await getConfirmedSellCutoffHours();

  const tiraneNow = sql`(now() AT TIME ZONE 'Europe/Tirane')`;
  const closeTs = closeTsSql(globalCutoff, confirmedCutoff);

  const rows = await db
    .select({
      id: flightsTable.id,
      airline: flightsTable.airline,
      flightNumber: flightsTable.flightNumber,
      fromCity: flightsTable.fromCity,
      toCity: flightsTable.toCity,
      departureDate: flightsTable.departureDate,
      departureTime: flightsTable.departureTime,
      closeAt: sql<string>`to_char(${closeTs}, 'YYYY-MM-DD HH24:MI')`,
      minutesLeft: sql<string>`CEIL(EXTRACT(EPOCH FROM (${closeTs} - ${tiraneNow})) / 60)`,
    })
    .from(flightsTable)
    .where(
      and(
        eq(flightsTable.status, "open"),
        sql`${closeTs} > ${tiraneNow}`, // sale not yet closed
        sql`${closeTs} <= ${tiraneNow} + interval '60 minutes'`, // closes within 1 hour
      ),
    )
    .orderBy(sql`${closeTs} asc`);

  res.json(rows.map(r => ({ ...r, minutesLeft: Math.max(0, Number(r.minutesLeft) || 0) })));
});

// GET /flights/seat-alerts — fluturimet e ardhshme ku kontrolli i Google gjeti
// MË PAK vende se pragu (seatAlert = 'low_seats'), që në humbjen e parë (1/3).
// Ushqen shiritin e kuq në krye të çdo faqeje të brendshme.
router.get("/flights/seat-alerts", async (req, res): Promise<void> => {
  const tiraneNow = sql`(now() AT TIME ZONE 'Europe/Tirane')`;
  const notDeparted = sql`(${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) >= to_char(${tiraneNow}, 'YYYY-MM-DD HH24:MI')`;
  const rows = await db
    .select({
      id: flightsTable.id,
      airline: flightsTable.airline,
      flightNumber: flightsTable.flightNumber,
      fromCity: flightsTable.fromCity,
      toCity: flightsTable.toCity,
      departureDate: flightsTable.departureDate,
      departureTime: flightsTable.departureTime,
      seatAlertDetail: flightsTable.seatAlertDetail,
      seatMissCount: flightsTable.seatMissCount,
      seatCheckedAt: flightsTable.seatCheckedAt,
    })
    .from(flightsTable)
    .where(and(
      notDeparted,
      sql`${flightsTable.seatAlert} = 'low_seats'`,
    ))
    .orderBy(sql`${flightsTable.departureDate} asc, ${flightsTable.departureTime} asc`)
    .limit(50);
  res.json(rows);
});

// GET /flights/soldout-recent — fluturimet që sapo kaluan në "Sold Out" (48h e fundit),
// nga çdo burim: mbushja e vendeve nga shitjet, kontrolli i Google, afati i shitjes,
// ose ndryshim manual nga një përdorues. Lexon flight_change_history (status → soldout).
router.get("/flights/soldout-recent", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      historyId: flightChangeHistoryTable.id,
      flightId: flightChangeHistoryTable.flightId,
      source: flightChangeHistoryTable.source,
      note: flightChangeHistoryTable.note,
      userName: flightChangeHistoryTable.userName,
      at: flightChangeHistoryTable.createdAt,
      airline: flightsTable.airline,
      flightNumber: flightsTable.flightNumber,
      fromCity: flightsTable.fromCity,
      toCity: flightsTable.toCity,
      departureDate: flightsTable.departureDate,
      departureTime: flightsTable.departureTime,
      status: flightsTable.status,
      totalSeats: flightsTable.totalSeats,
      soldSeats: flightsTable.soldSeats,
    })
    .from(flightChangeHistoryTable)
    .innerJoin(flightsTable, eq(flightChangeHistoryTable.flightId, flightsTable.id))
    .where(and(
      sql`${flightChangeHistoryTable.createdAt} > now() - interval '48 hours'`,
      sql`${flightChangeHistoryTable.changes} @> '[{"field":"status","new":"soldout"}]'::jsonb`,
      eq(flightsTable.status, "soldout"), // vetëm nëse është ende soldout tani
    ))
    .orderBy(desc(flightChangeHistoryTable.createdAt))
    .limit(100);

  // dedupe: vetëm ngjarja më e fundit për çdo fluturim
  const seen = new Set<number>();
  const out = rows.filter(r => {
    if (seen.has(r.flightId)) return false;
    seen.add(r.flightId);
    return true;
  }).map(r => ({
    ...r,
    at: r.at.toISOString(),
  }));
  res.json(out);
});

// Admin: all distinct routes (from→to) from all flights, regardless of status/date
router.get("/routes", async (req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ from: flightsTable.fromCity, to: flightsTable.toCity })
    .from(flightsTable)
    .orderBy(flightsTable.fromCity, flightsTable.toCity);
  const routes = new Map<string, { from: string; to: string }>();
  for (const row of rows) {
    const from = normalizeAirportCode(row.from);
    const to = normalizeAirportCode(row.to);
    routes.set(`${from}|${to}`, { from, to });
  }
  res.json([...routes.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)));
});

router.get("/flights", async (req, res): Promise<void> => {
  const q = req.query as Record<string, string>;
  const exactSeats = q.exactSeats == null ? 0 : Number(q.exactSeats);
  if (!Number.isSafeInteger(exactSeats) || exactSeats < 0) {
    res.status(400).json({ error: "Numri i vendeve duhet të jetë numër i plotë pozitiv." }); return;
  }
  const groupFilter = await resolveGroupFlightFilter(req.query.agencyGroupId, req.session?.role);
  if (groupFilter.error) {
    res.status(groupFilter.error.status).json({ error: groupFilter.error.message }); return;
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  const conditions: any[] = [];
  if (exactSeats > 0) conditions.push(sql`(${flightsTable.totalSeats} - ${flightsTable.soldSeats}) = ${exactSeats}`);
  if (groupFilter.condition) conditions.push(groupFilter.condition);
  if (q.fromCity) {
    const fc = q.fromCity.split(",").map((c: string) => c.trim().toUpperCase()).filter(Boolean);
    conditions.push(fc.length === 1 ? ilike(flightsTable.fromCity, `%${fc[0]}%`) : inArray(flightsTable.fromCity, fc));
  }
  if (q.toCity) {
    const tc = q.toCity.split(",").map((c: string) => c.trim().toUpperCase()).filter(Boolean);
    conditions.push(tc.length === 1 ? ilike(flightsTable.toCity, `%${tc[0]}%`) : inArray(flightsTable.toCity, tc));
  }
  if (q.airline)     conditions.push(ilike(flightsTable.airline,     `%${q.airline}%`));
  if (q.flightNumber)conditions.push(ilike(flightsTable.flightNumber,`%${q.flightNumber}%`));
  if (q.search) {
    const s = `%${q.search}%`;
    conditions.push(sql`(
      ${flightsTable.fromCity} ILIKE ${s}
      OR ${flightsTable.toCity} ILIKE ${s}
      OR ${flightsTable.airline} ILIKE ${s}
      OR ${flightsTable.flightNumber} ILIKE ${s}
      OR CONCAT(${flightsTable.fromCity}, ' ', ${flightsTable.toCity}) ILIKE ${s}
      OR CONCAT(${flightsTable.fromCity}, '-', ${flightsTable.toCity}) ILIKE ${s}
    )`);
  }
  if (q.startDate)   conditions.push(gte(flightsTable.departureDate, q.startDate));
  if (q.endDate)     conditions.push(lte(flightsTable.departureDate, q.endDate));
  // Flight-price range filter (adultPrice is numeric).
  const minPrice = q.minPrice != null && q.minPrice !== "" ? Number(q.minPrice) : null;
  const maxPrice = q.maxPrice != null && q.maxPrice !== "" ? Number(q.maxPrice) : null;
  if (minPrice != null && !Number.isNaN(minPrice)) conditions.push(sql`${flightsTable.adultPrice}::numeric >= ${minPrice}`);
  if (maxPrice != null && !Number.isNaN(maxPrice)) conditions.push(sql`${flightsTable.adultPrice}::numeric <= ${maxPrice}`);
  if (q.status && q.status !== "all") conditions.push(eq(flightsTable.status, q.status as any));
  // Schedule-alert filter: flights flagged by the Google schedule check.
  //   any       → has any alert (time change or possible cancellation)
  //   changed   → departure/arrival time changed on Google
  //   cancelled → not found on Google (possible cancellation)
  //   none      → no alert
  switch (q.scheduleAlert) {
    case "any":       conditions.push(sql`${flightsTable.scheduleAlert} IS NOT NULL`); break;
    case "changed":   conditions.push(eq(flightsTable.scheduleAlert, "time_changed")); break;
    case "cancelled": conditions.push(eq(flightsTable.scheduleAlert, "not_found")); break;
    case "seats":     conditions.push(sql`${flightsTable.seatAlert} IS NOT NULL`); break;
    case "none":      conditions.push(sql`(${flightsTable.scheduleAlert} IS NULL AND ${flightsTable.seatAlert} IS NULL)`); break;
  }
  // Njoftime tab uses anyAlert=true → flights carrying EITHER a schedule alert OR a seat alert.
  if (q.anyAlert === "true") {
    conditions.push(notificationAlertsSql());
  }
  if (q.suspicious === "true") conditions.push(suspiciousFlightsSql());
  if (q.noGroup === "true" && req.session?.role === "admin") conditions.push(sql`NOT (${groupFlightCondition()})`);
  // Dublikate tab uses duplicates=true → flights sharing the SAME route, date, time
  // AND flight number with at least one other flight.
  const dupCondition = sql`(${flightsTable.fromCity}, ${flightsTable.toCity}, ${flightsTable.departureDate}, ${flightsTable.departureTime}, ${flightsTable.flightNumber}) IN (SELECT from_city, to_city, departure_date, departure_time, flight_number FROM ${flightsTable} GROUP BY from_city, to_city, departure_date, departure_time, flight_number HAVING count(*) > 1)`;
  if (q.duplicates === "true") conditions.push(dupCondition);
  // "Pa Çmim" tab uses noGooglePrice=true → flights whose Google price cache entry
  // resolved to NULL (the "S'ka" state in the Google column). Matches the same
  // cacheKey the frontend uses: UPPER(FROM)|UPPER(TO)|DATE|normFlightNum.
  // Sold-out flights are excluded from "Pa Çmim" — they must not appear at all.
  const noPriceCondition = inventoryNoPriceSql();
  if (q.noGooglePrice === "true") {
    conditions.push(noPriceCondition);
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
  }
  // staleGooglePrice=true → failed Google verifications, not valid empty searches.
  // Sale prices/status stay unchanged; sold-out flights remain hidden.
  if (q.staleGooglePrice === "true") {
    conditions.push(staleGooglePriceSql());
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
  }
  // "Konfirmuar" tab uses confirmed=true → flights whose alert was acknowledged
  // (alertDismissedAt set) and that currently carry NO active alert.
  if (q.confirmed === "true") {
    conditions.push(sql`(${flightsTable.alertDismissedAt} IS NOT NULL AND ${flightsTable.scheduleAlert} IS NULL AND ${flightsTable.seatAlert} IS NULL)`);
  }
  // "Të Konfirmuara" tab uses bookedConfirmed=true → flights manually marked as
  // confirmed (the ⭐ "Konfirmuar" badge / is_confirmed flag).
  if (q.bookedConfirmed === "true") {
    conditions.push(sql`${flightsTable.isConfirmed} = true`);
  }
  // "Përjashtuar Online" tab uses excludedFromGoogle=true → flights manually excluded
  // from the automatic Google price rule (exclude_from_google_rule flag / red X badge).
  // Only ACTIVE flights: sold-out (or cancelled) hidden — user request 16.08.2026.
  if (q.excludedFromGoogle === "true") {
    conditions.push(googleMonitoringEnabledSql());
    conditions.push(eq(flightsTable.excludeFromGoogleRule, true));
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
    conditions.push(sql`${flightsTable.status} != 'cancelled'`);
  }
  if (q.googleMonitoringOnly === "true") conditions.push(googleMonitoringEnabledSql());
  // Filtri "Shitjet e jashtme": blocked → vetëm fluturimet me shitje të jashtme
  // të bllokuara; open → vetëm ato të hapura jashtë.
  if (q.externalBlocked === "true") conditions.push(eq(flightsTable.externalSalesBlocked, true));
  else if (q.externalBlocked === "false") conditions.push(eq(flightsTable.externalSalesBlocked, false));
  // Filtri i dukshmërisë në Booking Engine: hidden → vetëm të fshehurat; visible → vetëm të dukshmet.
  if (q.beVisible === "false") conditions.push(eq(flightsTable.showInBookingEngine, false));
  else if (q.beVisible === "true") conditions.push(eq(flightsTable.showInBookingEngine, true));
  // Timeframe: default "upcoming" (hide past-DATE flights); "past" shows only past flights;
  // "future" hides anything that has already departed by date+time (Tirane local time) —
  // used by the "Njoftime" tab so already-flown flights drop off.
  // "soon" shows only flights departing within the next N days (configurable from Settings).
  const today = new Date().toISOString().slice(0, 10);
  const upcomingDays = await getUpcomingDays();
  const soonEnd = new Date(today + "T00:00:00");
  soonEnd.setDate(soonEnd.getDate() + upcomingDays);
  const soonEndDate = soonEnd.toISOString().slice(0, 10);
  const nowInstant = new Date();
  const tiraneDate = nowInstant.toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
  const tiraneTime = nowInstant.toLocaleTimeString("en-GB", { timeZone: "Europe/Tirane", hour: "2-digit", minute: "2-digit" });
  const tiraneNow = `${tiraneDate} ${tiraneTime}`;
  const scheduleErrors = await readScheduleErrors(groupFilter.condition, tiraneNow);
  if (q.scheduleError === "true") conditions.push(scheduleErrorIdsCondition(scheduleErrors));
  if (q.noGoogleRule === "true") conditions.push(await noGoogleRuleFlightsSql(tiraneNow));
  const notDeparted = sql`(${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) >= ${tiraneNow}`;
  const timeframe = q.timeframe === "past" ? "past" : q.timeframe === "all" ? "all" : q.timeframe === "future" ? "future" : q.timeframe === "soon" ? "soon" : "upcoming";
  if (q.scheduleError === "true" && (!q.timeframe || q.timeframe === "future" || q.timeframe === "upcoming")) {
    // The audit already scopes by local departure time and also retains invalid
    // departure values (unknown timing) so they can be repaired.
  }
  else if (timeframe === "upcoming") conditions.push(gte(flightsTable.departureDate, today));
  else if (timeframe === "past")     conditions.push(lt(flightsTable.departureDate, today));
  else if (timeframe === "future")   conditions.push(notDeparted);
  else if (timeframe === "soon") {
    conditions.push(gte(flightsTable.departureDate, today));
    conditions.push(lte(flightsTable.departureDate, soonEndDate));
    // "Të Aferta" never shows sold-out flights — they can no longer be sold.
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
  }
  // Seats & Bookings filter (4 modes): with booking / without booking / no seat / with seat.
  // Legacy hasBookings=true is kept as an alias for "with".
  if (q.seatBooking === "with" || q.hasBookings === "true") conditions.push(sql`${flightsTable.soldSeats} > 0`);
  else if (q.seatBooking === "without") conditions.push(sql`${flightsTable.soldSeats} = 0`);
  else if (q.seatBooking === "noseat") conditions.push(sql`(${flightsTable.totalSeats} - ${flightsTable.soldSeats}) <= 0`);
  else if (q.seatBooking === "withseat") conditions.push(sql`(${flightsTable.totalSeats} - ${flightsTable.soldSeats}) > 0`);
  // Day-of-week filter: "Mon,Tue" → EXTRACT(DOW ...) 0=Sun,1=Mon,...,6=Sat
  if (q.days) {
    const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dowNums = q.days.split(",").map((d: string) => DOW[d.trim()]).filter((n: any) => n !== undefined);
    if (dowNums.length > 0) {
      conditions.push(q.scheduleError === "true"
        ? await scheduleErrorWeekdayCondition(scheduleErrors, dowNums)
        : sql`EXTRACT(DOW FROM ${flightsTable.departureDate}::date) = ANY(ARRAY[${sql.raw(dowNums.join(","))}])`);
    }
  }

  const where = conditions.length ? and(...conditions) : undefined;

  // ── Pagination ────────────────────────────────────────────────────────────
  const page  = Math.max(1, parseInt(q.page  || "1",  10));
  const limit = Math.min(100000, Math.max(10, parseInt(q.limit || "50", 10)));
  const offset = (page - 1) * limit;

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortDir = q.sortDir === "desc" ? "desc" : "asc";
  const sortFn  = sortDir === "asc" ? asc : desc;
  let orderBy: any;
  switch (q.sortKey) {
    case "route":    orderBy = [sortFn(flightsTable.fromCity), sortFn(flightsTable.toCity)]; break;
    case "flightNo": orderBy = [sortFn(flightsTable.airline), sortFn(flightsTable.flightNumber)]; break;
    case "seats":    orderBy = [sortFn(sql`${flightsTable.totalSeats} - ${flightsTable.soldSeats}`)]; break;
    case "price":    orderBy = [sortFn(flightsTable.adultPrice)]; break;
    case "baggage":
      // Sort by checked-baggage allowance (kg), nulls last, tie-break by count then price.
      orderBy = [
        sortFn(sql`COALESCE(${flightsTable.checkedBaggageKg}, 0)`),
        sortFn(sql`COALESCE(${flightsTable.checkedBaggageCount}, 0)`),
        sortFn(sql`COALESCE(${flightsTable.checkedBaggagePrice}, 0)`),
      ];
      break;
    case "alert":
      // Surface flagged flights: cancellations first, then time changes, then clean.
      // asc = alerts on top; desc = clean on top. Tie-break by departure date.
      orderBy = [
        sortFn(sql`CASE ${flightsTable.scheduleAlert} WHEN 'not_found' THEN 0 WHEN 'time_changed' THEN 1 ELSE 2 END`),
        asc(flightsTable.departureDate), asc(flightsTable.departureTime),
      ];
      break;
    case "date":
    default:         orderBy = [sortFn(flightsTable.departureDate), asc(flightsTable.departureTime)]; break;
  }

  // ── Run queries in parallel ───────────────────────────────────────────────
  // Only the role-independent global tab data is cached. Rows and filtered
  // totals remain fresh for every request.
  const [rows, [{ total }], globalTabData] = await Promise.all([
    db.select().from(flightsTable).where(where).orderBy(...(Array.isArray(orderBy) ? orderBy : [orderBy]), asc(flightsTable.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(flightsTable).where(where),
    getCachedFlightsGlobalTabData({
      today,
      tiraneDate,
      tiraneMinute: tiraneTime,
      soonEndDate,
      groupId: groupFilter.groupId,
      groupFilter: groupFilter.condition,
    }),
  ]);
  const { statusCounts, pastCnt, alertCnt, dupCnt, confirmedCnt, soonCnt, bookedCnt, noPriceCnt, staleCnt, excludedCnt, suspiciousCnt, noRuleCnt, dupGroups } = globalTabData;

  const isAdmin = req.session?.role === "admin";
  const includeSalesSummary = isAdmin && q.includeSalesSummary === "true";
  const listedFlightIds = rows.map(r => r.id);
  const googleDisabledIds = await googleMonitoringDisabledIds(listedFlightIds);
  // Sales summary for the visible flights. Keep this admin-only because net prices
  // are internal information and the shared /flights route serves other roles too.
  const bookingTotalsMap = includeSalesSummary
    ? await getFlightSalesSummaryMap(listedFlightIds)
    : new Map<number, ReturnType<typeof formatFlightSalesSummary>>();

  const dupKey = (f: { fromCity: string; toCity: string; departureDate: string; departureTime: string; flightNumber: string }) =>
    [f.fromCity, f.toCity, f.departureDate, f.departureTime, f.flightNumber].join("|");
  const dupSet = new Set(dupGroups.map(dupKey));

  const counts: Record<string, number> = { all: 0, open: 0, closed: 0, soldout: 0, past: Number(pastCnt), alerts: Number(alertCnt), duplicates: Number(dupCnt), confirmed: Number(confirmedCnt), soon: Number(soonCnt), booked: Number(bookedCnt), noprice: Number(noPriceCnt), stale: Number(staleCnt), excluded: Number(excludedCnt), suspicious: Number(suspiciousCnt) };
  for (const r of statusCounts) counts[r.status] = Number(r.cnt);
  counts.all = statusCounts.reduce((s, r) => s + Number(r.cnt), 0);
  counts.norule = Number(noRuleCnt);
  counts.scheduleerror = scheduleErrors.size;
  if (req.session?.role === "admin") counts.nogroup = Number(globalTabData.noGroupCnt);
  counts.newprice = Number(statusCounts.find(row => row.status === "open")?.googleCnt ?? 0);

  // CitizenPlane price: base adult + global markup, or per-flight manual override.
  // ADMIN-ONLY: these marketplace prices must never leak to manager/agent_staff
  // FMS users, so they are only attached for admins (the settings read is
  // skipped entirely otherwise). The "Fluturimet Citizen" page is admin-gated.
  const citizenSettings = isAdmin ? await getCitizenPricingSettings() : null;

  // Numri i shënimeve (chat) për fluturimet e faqes — ushqen badge-in te lista.
  const noteCountRows = listedFlightIds.length
    ? await db.select({ flightId: flightNotesTable.flightId, cnt: count() })
        .from(flightNotesTable)
        .where(inArray(flightNotesTable.flightId, listedFlightIds))
        .groupBy(flightNotesTable.flightId)
    : [];
  const noteCountMap = new Map(noteCountRows.map(r => [r.flightId, Number(r.cnt)]));
  const recheckStates = await loadSuspectRechecks(rows.filter(f => f.scheduleAlert === "not_found"));

  const formatFlight = (f: typeof rows[0]) => ({
    ...f,
    scheduleErrorReason: scheduleErrors.get(f.id) ?? null,
    googleMonitoringDisabled: googleDisabledIds.has(f.id),
    ...(googleDisabledIds.has(f.id) ? {
      scheduleAlert: null, scheduleAlertDetail: null, seatAlert: null, seatAlertDetail: null,
    } : {}),
    isDuplicate: dupSet.has(dupKey(f)),
    notesCount: noteCountMap.get(f.id) ?? 0,
    suspectRecheck: recheckStates.has(f.id) ? {
      outcome: recheckStates.get(f.id)!.outcome,
      checkedAt: recheckStates.get(f.id)!.checkedAt,
      missingChecks: recheckStates.get(f.id)!.missingChecks,
    } : null,
    ...(includeSalesSummary
      ? (bookingTotalsMap.get(f.id) ?? formatFlightSalesSummary(undefined))
      : {}),
    adultPrice: Number(f.adultPrice),
    childPrice: Number(f.childPrice),
    infantPrice: Number(f.infantPrice),
    ...(isAdmin && citizenSettings ? {
      citizenPrice: computeCitizenAdultPrice(f, citizenSettings),
      citizenPriceDefault: computeCitizenDefault(f.adultPrice, citizenSettings),
      citizenPriceSource: citizenPriceSource(f),
    } : {}),
    // Çmimi neto informativ — VETËM admin; për të tjerët hiqet fare nga JSON.
    netPrice: isAdmin ? (f.netPrice != null ? Number(f.netPrice) : null) : undefined,
    tax: Number(f.tax),
    cabinBaggageKg: f.cabinBaggageKg != null ? Number(f.cabinBaggageKg) : null,
    checkedBaggageCount: f.checkedBaggageCount ?? null,
    checkedBaggageKg: f.checkedBaggageKg != null ? Number(f.checkedBaggageKg) : null,
    checkedBaggagePrice: f.checkedBaggagePrice != null ? Number(f.checkedBaggagePrice) : null,
    seatSelectionPrice: f.seatSelectionPrice != null ? Number(f.seatSelectionPrice) : null,
    priorityBoardingPrice: f.priorityBoardingPrice != null ? Number(f.priorityBoardingPrice) : null,
    insurancePrice: f.insurancePrice != null ? Number(f.insurancePrice) : null,
    availableSeats: (f.status === "closed" || f.status === "soldout") ? 0 : f.totalSeats - f.soldSeats,
    scheduleCheckedAt: f.scheduleCheckedAt ? f.scheduleCheckedAt.toISOString() : null,
    seatGooglePrice: f.seatGooglePrice != null ? Number(f.seatGooglePrice) : null,
    seatCheckedAt: f.seatCheckedAt ? f.seatCheckedAt.toISOString() : null,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  });

  const discounts = await readFlightDiscounts(rows.map(f => f.id));
  const noPriceReasons = q.noGooglePrice === "true" && rows.length
    ? new Map((await db.select({ id: flightsTable.id, reason: inventoryNoPriceReasonSql() })
      .from(flightsTable).where(inArray(flightsTable.id, rows.map(f => f.id)))).map(r => [r.id, r.reason]))
    : new Map<number, string>();
  res.json({
    data: rows.map(f => ({ ...formatFlight(f), noPriceReason: noPriceReasons.get(f.id), flightDiscount: discounts.get(f.id) ?? null,
      discountedAdultPrice: applyFlightDiscount(Number(f.adultPrice), discounts.get(f.id) ?? null) })),
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
    counts,
  });
});

// ── Shënime brenda fluturimit (si bisedë) — të pandryshueshme pas dërgimit ──
// Vetëm për sistemin e brendshëm (FMS, të gjitha rolet); s'dalin kurrë te faqja
// publike (public.ts i heq) apo API i partnerëve (/v1 me allowlist).
router.put("/flights/:id/discount", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid flight" }); return; }
  let discount;
  try { discount = parseFlightDiscount(req.body?.discount === null ? null : req.body, true); }
  catch (err) { res.status(400).json({ error: (err as Error).message }); return; }
  const [flight] = await db.select({ id: flightsTable.id }).from(flightsTable).where(eq(flightsTable.id, id));
  if (!flight) { res.status(404).json({ error: "Flight not found" }); return; }
  if (!discount) await db.delete(settingsTable).where(eq(settingsTable.key, flightDiscountKey(id)));
  else await db.insert(settingsTable).values({ key: flightDiscountKey(id), value: JSON.stringify(discount) })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(discount), updatedAt: new Date() } });
  notifyDataChanged("flights");
  // A manual override can suppress/reveal a scheduled Offline offer, even if
  // the manual discount itself targets a different channel.
  triggerCpExportSoon();
  res.json({ flightDiscount: discount });
});

router.get("/flights/:id/notes", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const noteRows = await db.select().from(flightNotesTable)
    .where(eq(flightNotesTable.flightId, id))
    .orderBy(flightNotesTable.createdAt);
  res.json(noteRows.map(n => ({
    ...n,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
  })));
});

router.post("/flights/:id/notes", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) { res.status(400).json({ error: "Shënimi është bosh" }); return; }
  if (message.length > 2000) { res.status(400).json({ error: "Shënimi është shumë i gjatë (max 2000)" }); return; }
  const [flight] = await db.select({ id: flightsTable.id }).from(flightsTable).where(eq(flightsTable.id, id));
  if (!flight) { res.status(404).json({ error: "Fluturimi nuk u gjet" }); return; }
  const sess: any = (req as any).session;
  const [created] = await db.insert(flightNotesTable).values({
    flightId: id,
    authorId: sess?.userId ?? null,
    authorName: sess?.userName ?? "Staff",
    authorRole: sess?.role ?? null,
    message,
  }).returning();
  res.json({
    ...created,
    createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : created.createdAt,
  });
});

router.post("/flights", async (req, res): Promise<void> => {
  const parsed = CreateFlightBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status = "open", ...rest } = parsed.data;
  // Kolona e vjetër flights.notes u zëvendësua nga chat-i flight_notes (23.08.2026) —
  // hidhet çdo vlerë e dërguar që kolona të mbetet gjithmonë NULL.
  delete (rest as Record<string, unknown>).notes;
  const canonicalRest = normalizeMonetaryFields(normalizeFlightIdentifiers(rest) as Record<string, any>);
  const arrivalDate = normalizeArrivalDate(canonicalRest);
  // Çmimi neto informativ (jashtë zod-it të gjeneruar) — vetëm admin mund ta vendosë.
  const netPriceRaw = (req.body as Record<string, unknown>)?.netPrice;
  const netPatch: Record<string, unknown> = {};
  if (req.session?.role === "admin" && netPriceRaw !== undefined) {
    const n = netPriceRaw === null || netPriceRaw === "" ? null : Number(netPriceRaw);
    if (n === null || (Number.isFinite(n) && n >= 0)) netPatch.netPrice = n === null ? null : String(roundWholeEuro(n));
  }
  const [flight] = await db.insert(flightsTable).values({ ...canonicalRest, ...netPatch, ...(arrivalDate ? { arrivalDate } : {}), status } as any).returning();

  scheduleGSheetsSync();
  // Fluturimet e REJA nuk shkojnë menjëherë te CitizenPlane — dërgohen me
  // exportin e radhës të planifikuar (kërkesë e userit 15.08.2026). Vetëm
  // ndryshimet që ULIN vendet e shitshme kërkojnë export të menjëhershëm.
  // Recompute the precise auto-soldout cutoff timer for the new flight.
  void scheduleNextAutoSoldOut();
  void recordSeatEvent({ flightId: flight.id, type: "created", seats: flight.totalSeats, req });
  void recordFlightChange({ req, flightId: flight.id, source: "create", note: "Fluturimi u krijua" });
  applyGooglePriceRulesToNewFlights([flight.id]);
  res.status(201).json({
    ...flight,
    netPrice: req.session?.role === "admin" ? (flight.netPrice != null ? Number(flight.netPrice) : null) : undefined,
    adultPrice: Number(flight.adultPrice),
    childPrice: Number(flight.childPrice),
    infantPrice: Number(flight.infantPrice),
    tax: Number(flight.tax),
    cabinBaggageKg: flight.cabinBaggageKg != null ? Number(flight.cabinBaggageKg) : null,
    checkedBaggageCount: flight.checkedBaggageCount ?? null,
    checkedBaggageKg: flight.checkedBaggageKg != null ? Number(flight.checkedBaggageKg) : null,
    checkedBaggagePrice: flight.checkedBaggagePrice != null ? Number(flight.checkedBaggagePrice) : null,
    seatSelectionPrice: flight.seatSelectionPrice != null ? Number(flight.seatSelectionPrice) : null,
    priorityBoardingPrice: flight.priorityBoardingPrice != null ? Number(flight.priorityBoardingPrice) : null,
    insurancePrice: flight.insurancePrice != null ? Number(flight.insurancePrice) : null,
    availableSeats: (flight.status === "closed" || flight.status === "soldout") ? 0 : flight.totalSeats - flight.soldSeats,
    createdAt: flight.createdAt.toISOString(),
    updatedAt: flight.updatedAt.toISOString(),
  });
});

function formatFlight(f: typeof flightsTable.$inferSelect, isAdmin = false) {
  return {
    ...f,
    fromCity: normalizeAirportCode(f.fromCity),
    toCity: normalizeAirportCode(f.toCity),
    // Çmimi neto informativ — VETËM admin; për të tjerët hiqet fare nga JSON.
    netPrice: isAdmin ? (f.netPrice != null ? Number(f.netPrice) : null) : undefined,
    adultPrice: Number(f.adultPrice),
    childPrice: Number(f.childPrice),
    infantPrice: Number(f.infantPrice),
    tax: Number(f.tax),
    cabinBaggageKg: f.cabinBaggageKg != null ? Number(f.cabinBaggageKg) : null,
    checkedBaggageCount: f.checkedBaggageCount ?? null,
    checkedBaggageKg: f.checkedBaggageKg != null ? Number(f.checkedBaggageKg) : null,
    checkedBaggagePrice: f.checkedBaggagePrice != null ? Number(f.checkedBaggagePrice) : null,
    seatSelectionPrice: f.seatSelectionPrice != null ? Number(f.seatSelectionPrice) : null,
    priorityBoardingPrice: f.priorityBoardingPrice != null ? Number(f.priorityBoardingPrice) : null,
    insurancePrice: f.insurancePrice != null ? Number(f.insurancePrice) : null,
    availableSeats: (f.status === "closed" || f.status === "soldout") ? 0 : f.totalSeats - f.soldSeats,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

// ── Get all matching IDs (for "Select All" across pages) ──────────────────
router.get("/flights/ids", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const q = req.query as Record<string, string>;
  const exactSeats = q.exactSeats == null ? 0 : Number(q.exactSeats);
  if (!Number.isSafeInteger(exactSeats) || exactSeats < 0) {
    res.status(400).json({ error: "Numri i vendeve duhet të jetë numër i plotë pozitiv." }); return;
  }
  const groupFilter = await resolveGroupFlightFilter(req.query.agencyGroupId, req.session?.role);
  if (groupFilter.error) {
    res.status(groupFilter.error.status).json({ error: groupFilter.error.message }); return;
  }
  const conditions: any[] = [];
  if (exactSeats > 0) conditions.push(sql`(${flightsTable.totalSeats} - ${flightsTable.soldSeats}) = ${exactSeats}`);
  if (groupFilter.condition) conditions.push(groupFilter.condition);
  if (q.fromCity) {
    const fc = q.fromCity.split(",").map((c: string) => c.trim().toUpperCase()).filter(Boolean);
    conditions.push(fc.length === 1 ? ilike(flightsTable.fromCity, `%${fc[0]}%`) : inArray(flightsTable.fromCity, fc));
  }
  if (q.toCity) {
    const tc = q.toCity.split(",").map((c: string) => c.trim().toUpperCase()).filter(Boolean);
    conditions.push(tc.length === 1 ? ilike(flightsTable.toCity, `%${tc[0]}%`) : inArray(flightsTable.toCity, tc));
  }
  if (q.airline) conditions.push(ilike(flightsTable.airline, `%${q.airline}%`));
  if (q.flightNumber) conditions.push(ilike(flightsTable.flightNumber, `%${q.flightNumber}%`));
  if (q.search) {
    const s = `%${q.search}%`;
    conditions.push(sql`(
      ${flightsTable.fromCity} ILIKE ${s}
      OR ${flightsTable.toCity} ILIKE ${s}
      OR ${flightsTable.airline} ILIKE ${s}
      OR ${flightsTable.flightNumber} ILIKE ${s}
      OR CONCAT(${flightsTable.fromCity}, ' ', ${flightsTable.toCity}) ILIKE ${s}
      OR CONCAT(${flightsTable.fromCity}, '-', ${flightsTable.toCity}) ILIKE ${s}
    )`);
  }
  if (q.startDate)  conditions.push(gte(flightsTable.departureDate, q.startDate));
  if (q.endDate)    conditions.push(lte(flightsTable.departureDate, q.endDate));
  // Flight-price range — keep "select all across pages" consistent with the visible list.
  const idsMinPrice = q.minPrice != null && q.minPrice !== "" ? Number(q.minPrice) : null;
  const idsMaxPrice = q.maxPrice != null && q.maxPrice !== "" ? Number(q.maxPrice) : null;
  if (idsMinPrice != null && !Number.isNaN(idsMinPrice)) conditions.push(sql`${flightsTable.adultPrice}::numeric >= ${idsMinPrice}`);
  if (idsMaxPrice != null && !Number.isNaN(idsMaxPrice)) conditions.push(sql`${flightsTable.adultPrice}::numeric <= ${idsMaxPrice}`);
  if (q.status && q.status !== "all") conditions.push(eq(flightsTable.status, q.status as any));
  // Schedule-alert filter — keep "select all across pages" consistent with the visible list.
  switch (q.scheduleAlert) {
    case "any":       conditions.push(sql`${flightsTable.scheduleAlert} IS NOT NULL`); break;
    case "changed":   conditions.push(eq(flightsTable.scheduleAlert, "time_changed")); break;
    case "cancelled": conditions.push(eq(flightsTable.scheduleAlert, "not_found")); break;
    case "seats":     conditions.push(sql`${flightsTable.seatAlert} IS NOT NULL`); break;
    case "none":      conditions.push(sql`(${flightsTable.scheduleAlert} IS NULL AND ${flightsTable.seatAlert} IS NULL)`); break;
  }
  // Njoftime tab uses anyAlert=true → flights carrying EITHER a schedule alert OR a seat alert.
  if (q.anyAlert === "true") {
    conditions.push(notificationAlertsSql());
  }
  if (q.suspicious === "true") conditions.push(suspiciousFlightsSql());
  if (q.noGroup === "true" && req.session?.role === "admin") conditions.push(sql`NOT (${groupFlightCondition()})`);
  // Dublikate tab — keep "select all across pages" consistent with the visible list.
  if (q.duplicates === "true") {
    conditions.push(sql`(${flightsTable.fromCity}, ${flightsTable.toCity}, ${flightsTable.departureDate}, ${flightsTable.departureTime}, ${flightsTable.flightNumber}) IN (SELECT from_city, to_city, departure_date, departure_time, flight_number FROM ${flightsTable} GROUP BY from_city, to_city, departure_date, departure_time, flight_number HAVING count(*) > 1)`);
  }
  // Konfirmuar tab — keep "select all across pages" consistent with the visible list.
  if (q.confirmed === "true") {
    conditions.push(sql`(${flightsTable.alertDismissedAt} IS NOT NULL AND ${flightsTable.scheduleAlert} IS NULL AND ${flightsTable.seatAlert} IS NULL)`);
  }
  // "Të Konfirmuara" tab — keep "select all across pages" consistent with the visible list.
  if (q.bookedConfirmed === "true") {
    conditions.push(sql`${flightsTable.isConfirmed} = true`);
  }
  // "Pa Çmim" tab — select-all across pages must match the visible no-price list (sold-out excluded).
  if (q.noGooglePrice === "true") {
    conditions.push(inventoryNoPriceSql());
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
  }
  // "Çmim i Vjetër" tab — select-all across pages must match the visible stale list (sold-out excluded).
  if (q.staleGooglePrice === "true") {
    conditions.push(staleGooglePriceSql());
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
  }
  // "Përjashtuar Online" tab — select-all across pages must match the excluded list
  // (active only: sold-out/cancelled hidden).
  if (q.excludedFromGoogle === "true") {
    conditions.push(googleMonitoringEnabledSql());
    conditions.push(eq(flightsTable.excludeFromGoogleRule, true));
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
    conditions.push(sql`${flightsTable.status} != 'cancelled'`);
  }
  // Filtri "Shitjet e jashtme" — select-all across pages must match the visible list.
  if (q.externalBlocked === "true") conditions.push(eq(flightsTable.externalSalesBlocked, true));
  else if (q.externalBlocked === "false") conditions.push(eq(flightsTable.externalSalesBlocked, false));
  // Filtri i dukshmërisë në Booking Engine — select-all must match the visible list.
  if (q.beVisible === "false") conditions.push(eq(flightsTable.showInBookingEngine, false));
  else if (q.beVisible === "true") conditions.push(eq(flightsTable.showInBookingEngine, true));
  // Timeframe: keep "select all across pages" consistent with the visible list.
  const idsToday = new Date().toISOString().slice(0, 10);
  const idsNow = new Date();
  const idsTiraneDate = idsNow.toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
  const idsTiraneTime = idsNow.toLocaleTimeString("en-GB", { timeZone: "Europe/Tirane", hour: "2-digit", minute: "2-digit" });
  const scheduleErrors = q.scheduleError === "true"
    ? await readScheduleErrors(groupFilter.condition, `${idsTiraneDate} ${idsTiraneTime}`)
    : new Map<number, string>();
  if (q.scheduleError === "true") conditions.push(scheduleErrorIdsCondition(scheduleErrors));
  if (q.noGoogleRule === "true") {
    conditions.push(await noGoogleRuleFlightsSql(`${idsTiraneDate} ${idsTiraneTime}`));
  }
  if (q.googleMonitoringOnly === "true") conditions.push(googleMonitoringEnabledSql());
  const idsNotDeparted = sql`(${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) >= ${`${idsTiraneDate} ${idsTiraneTime}`}`;
  const idsTimeframe = q.timeframe === "past" ? "past" : q.timeframe === "all" ? "all" : q.timeframe === "future" ? "future" : q.timeframe === "soon" ? "soon" : "upcoming";
  if (q.scheduleError === "true" && (!q.timeframe || q.timeframe === "future" || q.timeframe === "upcoming")) {
    // Same audit scope as GET /flights, including malformed departure values.
  }
  else if (idsTimeframe === "upcoming") conditions.push(gte(flightsTable.departureDate, idsToday));
  else if (idsTimeframe === "past") conditions.push(lt(flightsTable.departureDate, idsToday));
  else if (idsTimeframe === "future") conditions.push(idsNotDeparted);
  else if (idsTimeframe === "soon") {
    // "Të Aferta" select-all must match the visible list: within the soon window
    // and never sold-out.
    const idsUpcomingDays = await getUpcomingDays();
    const idsSoonEnd = new Date(idsToday + "T00:00:00");
    idsSoonEnd.setDate(idsSoonEnd.getDate() + idsUpcomingDays);
    conditions.push(gte(flightsTable.departureDate, idsToday));
    conditions.push(lte(flightsTable.departureDate, idsSoonEnd.toISOString().slice(0, 10)));
    conditions.push(sql`${flightsTable.status} != 'soldout'`);
  }
  if (q.seatBooking === "with" || q.hasBookings === "true") conditions.push(sql`${flightsTable.soldSeats} > 0`);
  else if (q.seatBooking === "without") conditions.push(sql`${flightsTable.soldSeats} = 0`);
  else if (q.seatBooking === "noseat") conditions.push(sql`(${flightsTable.totalSeats} - ${flightsTable.soldSeats}) <= 0`);
  else if (q.seatBooking === "withseat") conditions.push(sql`(${flightsTable.totalSeats} - ${flightsTable.soldSeats}) > 0`);
  if (q.days) {
    const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dowNums = q.days.split(",").map(d => DOW[d.trim()]).filter(n => n !== undefined);
    if (dowNums.length) conditions.push(q.scheduleError === "true"
      ? await scheduleErrorWeekdayCondition(scheduleErrors, dowNums)
      : sql`EXTRACT(DOW FROM ${flightsTable.departureDate}::date) = ANY(ARRAY[${sql.raw(dowNums.join(","))}])`);
  }
  const rows = await db.select({ id: flightsTable.id }).from(flightsTable)
    .where(conditions.length ? and(...conditions) : undefined);
  res.json(rows.map(r => r.id));
});

// ── Unique flight types (distinct route + flight number combinations) ──────
router.get("/flights/unique-types", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      flightNumber: flightsTable.flightNumber,
      airline:      flightsTable.airline,
      fromCity:     flightsTable.fromCity,
      toCity:       flightsTable.toCity,
      departureDate: flightsTable.departureDate,
    })
    .from(flightsTable)
    .where(
      and(
        eq(flightsTable.status, "open"),
        sql`${flightsTable.departureDate} >= ${today}`
      )
    )
    .orderBy(flightsTable.fromCity, flightsTable.toCity, flightsTable.flightNumber);
  const types = new Map<string, {
    flightNumber: string; airline: string; fromCity: string; toCity: string;
    flightCount: number; firstDate: string; lastDate: string;
  }>();
  for (const row of rows) {
    const canonical = normalizeFlightIdentifiers(row);
    const key = flightTypeIdentity(canonical);
    const existing = types.get(key);
    if (existing) {
      existing.flightCount++;
      if (row.departureDate < existing.firstDate) existing.firstDate = row.departureDate;
      if (row.departureDate > existing.lastDate) existing.lastDate = row.departureDate;
    } else {
      types.set(key, {
        flightNumber: canonical.flightNumber,
        airline: canonical.airline,
        fromCity: canonical.fromCity,
        toCity: canonical.toCity,
        flightCount: 1,
        firstDate: row.departureDate,
        lastDate: row.departureDate,
      });
    }
  }
  res.json([...types.values()].sort((a, b) =>
    a.fromCity.localeCompare(b.fromCity) ||
    a.toCity.localeCompare(b.toCity) ||
    a.flightNumber.localeCompare(b.flightNumber)
  ));
});

// ── Min departure date for a route / flight ────────────────────────────────
router.get("/flights/min-date", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { from, to, flightNumber } = req.query as Record<string, string>;
  const conditions: any[] = [];
  if (from)         conditions.push(eq(flightsTable.fromCity,    from.trim().toUpperCase()));
  if (to)           conditions.push(eq(flightsTable.toCity,      to.trim().toUpperCase()));
  if (flightNumber) conditions.push(ilike(flightsTable.flightNumber, `%${flightNumber.trim()}%`));
  const row = await db.select({ minDate: sql<string>`MIN(${flightsTable.departureDate})` })
    .from(flightsTable)
    .where(conditions.length ? and(...conditions) : undefined);
  const minDate = row[0]?.minDate ?? null;
  res.json({ minDate });
});

// ── Google search for flight creation ────────────────────────────────────────
// Keep this synchronous endpoint for existing clients. The New Flight form uses
// the additive job API below so RapidAPI latency never blocks its request.
type GoogleSearchJob = {
  id: string;
  userId: number;
  searchKey: string;
  fromCity: string;
  toCity: string;
  date: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: number;
  expiresAt: number | null;
  error?: string;
  flights?: {
    flightNumber: string;
    airline: string;
    departureTime: string;
    arrivalTime: string;
    googlePrice: number | null;
  }[];
  routePrice?: number | null;
};

const GOOGLE_SEARCH_JOB_TTL_MS = 10 * 60_000;
const GOOGLE_SEARCH_JOB_LIMIT = 100;
const GOOGLE_SEARCH_ACTIVE_LIMIT = 8;
const googleSearchJobs = new Map<string, GoogleSearchJob>();
const googleSearchInFlight = new Map<string, string>();

function pruneGoogleSearchJobs(now = Date.now()): void {
  for (const [id, job] of googleSearchJobs) {
    if ((job.status === "completed" || job.status === "failed") && job.expiresAt != null && job.expiresAt <= now) {
      googleSearchJobs.delete(id);
      if (googleSearchInFlight.get(job.searchKey) === id) googleSearchInFlight.delete(job.searchKey);
    }
  }
}

function googleSearchJobResponse(job: GoogleSearchJob) {
  return {
    jobId: job.id,
    status: job.status,
    ...(job.status === "completed" ? { flights: job.flights ?? [], routePrice: job.routePrice ?? null } : {}),
    ...(job.status === "failed" ? { error: job.error ?? "Kërkimi në Google dështoi." } : {}),
  };
}

async function runGoogleSearchJob(job: GoogleSearchJob): Promise<void> {
  job.status = "running";
  try {
    // Do not race a route-level timeout around this promise: the shared helper
    // waits for a RapidAPI slot before its fetch timeout begins and cannot cancel
    // a queued slot. Racing it would free this job while its upstream work could
    // still run. fetchGoogleFlightSchedules bounds the fetch itself to 25 seconds.
    const result = await fetchGoogleFlightSchedules(job.fromCity, job.toCity, job.date, { directOnly: true });
    if (result.error) {
      job.status = "failed";
      job.error = "Google nuk mundi të kthejë oraret. Provo përsëri pas pak.";
      return;
    }
    job.flights = result.flights.map(f => ({
      flightNumber: f.flightNumber,
      airline: f.airline,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      googlePrice: result.flightPriceMap?.[normFlightNum(f.flightNumber)] ?? f.googlePrice ?? null,
    }));
    job.routePrice = result.routePrice ?? null;
    job.status = "completed";
  } catch (error) {
    logger.error({ err: error, jobId: job.id }, "Google flight search job failed");
    job.status = "failed";
    job.error = "Kërkimi në Google dështoi për shkak të një gabimi të papritur.";
  } finally {
    // Retention starts only once the shared RapidAPI operation has actually
    // settled. Active work has no expiry and continues to occupy its job slot.
    job.expiresAt = Date.now() + GOOGLE_SEARCH_JOB_TTL_MS;
    if (googleSearchInFlight.get(job.searchKey) === job.id) googleSearchInFlight.delete(job.searchKey);
  }
}

router.post("/flights/google-search/jobs", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fromCity = String(body.fromCity ?? "").trim().toUpperCase();
  const toCity = String(body.toCity ?? "").trim().toUpperCase();
  const date = String(body.date ?? "").trim();
  if (!fromCity || !toCity) {
    res.status(400).json({ error: "Plotëso aeroportet Nga dhe Për." }); return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "Data e pavlefshme (duhet sot ose në të ardhmen)." }); return;
  }
  if (!process.env.RAPIDAPI_KEY) {
    res.status(503).json({ error: "Kontrolli në Google nuk është i konfiguruar (mungon API key)." }); return;
  }

  const now = Date.now();
  pruneGoogleSearchJobs(now);
  const searchKey = `${userId}:${JSON.stringify([fromCity, toCity, date])}`;
  const existingId = googleSearchInFlight.get(searchKey);
  const existingJob = existingId ? googleSearchJobs.get(existingId) : undefined;
  if (existingJob && (existingJob.status === "queued" || existingJob.status === "running")) {
    res.json({ ...googleSearchJobResponse(existingJob), deduplicated: true });
    return;
  }

  const activeCount = [...googleSearchJobs.values()].filter(job => job.status === "queued" || job.status === "running").length;
  if (activeCount >= GOOGLE_SEARCH_ACTIVE_LIMIT) {
    res.status(429).json({ error: "Ka shumë kërkime Google aktive. Provo përsëri pas pak." }); return;
  }
  if (googleSearchJobs.size >= GOOGLE_SEARCH_JOB_LIMIT) {
    const completed = [...googleSearchJobs.values()]
      .filter(job => job.status === "completed" || job.status === "failed")
      .sort((a, b) => a.createdAt - b.createdAt);
    while (googleSearchJobs.size >= GOOGLE_SEARCH_JOB_LIMIT && completed.length) {
      const oldest = completed.shift()!;
      googleSearchJobs.delete(oldest.id);
    }
    if (googleSearchJobs.size >= GOOGLE_SEARCH_JOB_LIMIT) {
      res.status(429).json({ error: "Kërkimet Google janë përkohësisht të ngarkuara. Provo përsëri pas pak." }); return;
    }
  }

  const job: GoogleSearchJob = {
    id: randomUUID(),
    userId,
    searchKey,
    fromCity,
    toCity,
    date,
    status: "queued",
    createdAt: now,
    expiresAt: null,
  };
  googleSearchJobs.set(job.id, job);
  googleSearchInFlight.set(searchKey, job.id);
  res.status(202).json(googleSearchJobResponse(job));
  void runGoogleSearchJob(job);
});

router.get("/flights/google-search/jobs/:jobId", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  pruneGoogleSearchJobs();
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = googleSearchJobs.get(jobId);
  // Return the same not-found response for absent and foreign jobs to avoid
  // revealing another user's job IDs or results.
  if (!job || job.userId !== userId) {
    res.status(404).json({ error: "Kërkimi nuk ekziston ose ka skaduar." }); return;
  }
  res.json(googleSearchJobResponse(job));
});

router.post("/flights/google-search", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fromCity = String(body.fromCity ?? "").trim().toUpperCase();
  const toCity = String(body.toCity ?? "").trim().toUpperCase();
  const date = String(body.date ?? "").trim();
  if (!fromCity || !toCity) {
    res.status(400).json({ error: "Plotëso aeroportet Nga dhe Për." }); return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().slice(0, 10)) {
    res.status(400).json({ error: "Data e pavlefshme (duhet sot ose në të ardhmen)." }); return;
  }
  if (!process.env.RAPIDAPI_KEY) {
    res.status(503).json({ error: "Kontrolli në Google nuk është i konfiguruar (mungon API key)." }); return;
  }
  const result = await fetchGoogleFlightSchedules(fromCity, toCity, date, { directOnly: true });
  if (result.error) { res.status(502).json({ error: result.error }); return; }
  res.json({
    flights: result.flights.map(f => ({
      flightNumber: f.flightNumber,
      airline: f.airline,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      googlePrice: result.flightPriceMap?.[normFlightNum(f.flightNumber)] ?? f.googlePrice ?? null,
    })),
    routePrice: result.routePrice ?? null,
  });
});

// ── Extend flight dates: find NEW dates that Google has but we don't ─────────
// For a given flight type (flightNumber + route), search Google Flights across a
// date range and return the dates where that flight number operates but is NOT
// already in our inventory. Used by the "Llojet e Fluturimeve" admin page.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXTEND_MAX_DAYS = 62;

router.post("/flights/extend-search", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const flightNumber = String(body.flightNumber ?? "").trim();
  const airline = String(body.airline ?? "").trim();
  const fromCity = String(body.fromCity ?? "").trim().toUpperCase();
  const toCity = String(body.toCity ?? "").trim().toUpperCase();
  const startDate = String(body.startDate ?? "").trim();
  const endDate = String(body.endDate ?? "").trim();

  if (!flightNumber || !fromCity || !toCity) {
    res.status(400).json({ error: "Mungojnë të dhënat e fluturimit." }); return;
  }
  if (!ISO_DATE_RE.test(startDate) || !ISO_DATE_RE.test(endDate)) {
    res.status(400).json({ error: "Data e pavlefshme (formati: VVVV-MM-DD)." }); return;
  }
  const startMs = new Date(startDate + "T00:00:00Z").getTime();
  const endMs = new Date(endDate + "T00:00:00Z").getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
    res.status(400).json({ error: "Intervali i datave është i pavlefshëm." }); return;
  }
  const DAY_MS = 86400000;
  const totalDays = Math.floor((endMs - startMs) / DAY_MS) + 1;
  if (totalDays > EXTEND_MAX_DAYS) {
    res.status(400).json({ error: `Intervali është shumë i gjatë (maksimumi ${EXTEND_MAX_DAYS} ditë).` }); return;
  }
  if (!process.env.RAPIDAPI_KEY) {
    res.status(503).json({ error: "Kontrolli në Google nuk është i konfiguruar (mungon API key)." }); return;
  }

  const today = new Date().toISOString().slice(0, 10);

  // ONLY the code of the flight type being expanded — we surface from Google
  // just the flights that carry THIS code, never other codes on the route.
  const targetCode = normFlightNum(flightNumber);
  const codeMap = new Map<string, { flightNumber: string; airline: string }>();
  if (targetCode) codeMap.set(targetCode, { flightNumber, airline });
  if (codeMap.size === 0) {
    res.json({ newFlights: [], checkedDates: 0, alreadyHave: 0, apiErrors: 0, defaults: null }); return;
  }

  // (code|date) combos we already have on this route within the range — skip these.
  const existing = await db.select({ d: flightsTable.departureDate, fn: flightsTable.flightNumber })
    .from(flightsTable)
    .where(and(
      eq(flightsTable.fromCity, fromCity),
      eq(flightsTable.toCity, toCity),
      gte(flightsTable.departureDate, startDate),
      lte(flightsTable.departureDate, endDate),
    ));
  const haveSet = new Set(existing.map(r => `${normFlightNum(r.fn)}|${r.d}`));

  // Template = most recent existing flight of the EXPANDED type — used only to
  // pre-fill the "set prices/seats" confirm form.
  const [tpl] = await db.select().from(flightsTable)
    .where(and(
      eq(flightsTable.fromCity, fromCity),
      eq(flightsTable.toCity, toCity),
      eq(flightsTable.flightNumber, flightNumber),
      ...(airline ? [eq(flightsTable.airline, airline)] : []),
    ))
    .orderBy(desc(flightsTable.departureDate))
    .limit(1);
  const defaults = tpl ? {
    adultPrice: tpl.adultPrice,
    childPrice: tpl.childPrice,
    infantPrice: tpl.infantPrice,
    totalSeats: tpl.totalSeats,
    checkedBaggagePrice: tpl.checkedBaggagePrice,
    checkedBaggageCount: tpl.checkedBaggageCount,
    checkedBaggageKg: tpl.checkedBaggageKg != null ? Number(tpl.checkedBaggageKg) : null,
  } : null;

  // Candidate dates: inside range, not in the past.
  const candidates: string[] = [];
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (iso < today) continue;
    candidates.push(iso);
  }

  type Row = { date: string; flightNumber: string; airline: string; departureTime: string; arrivalTime: string; googlePrice: number | null };
  const newFlights: Row[] = [];
  // One row per (code|date): Google can return the same flight number several
  // times for a day (multiple itinerary legs/fares) — we only ever create one
  // flight per code+date, so collapse duplicates here to keep selection keys
  // (date|flightNumber) unique on the frontend.
  const seen = new Set<string>();
  let apiErrors = 0;

  // Limited concurrency so a long range doesn't hammer the upstream API.
  const CONCURRENCY = 4;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < candidates.length) {
      const date = candidates[cursor++];
      const result = await fetchGoogleFlightSchedules(fromCity, toCity, date);
      if (result.error) { apiErrors++; continue; }
      // Show EVERY distinct Google flight code we operate (could be several per
      // day), skipping codes/dates we already have in inventory.
      for (const gf of result.flights) {
        const k = normFlightNum(gf.flightNumber);
        const ours = codeMap.get(k);
        if (!ours) continue;
        if (haveSet.has(`${k}|${date}`)) continue;
        const dedupKey = `${k}|${date}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const price = (k in result.flightPriceMap) ? result.flightPriceMap[k] : (result.routePrice ?? null);
        newFlights.push({
          date,
          flightNumber: ours.flightNumber,
          airline: ours.airline,
          departureTime: gf.departureTime,
          arrivalTime: gf.arrivalTime,
          googlePrice: price,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));
  newFlights.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    (a.departureTime || "").localeCompare(b.departureTime || "") ||
    a.flightNumber.localeCompare(b.flightNumber)
  );

  res.json({
    newFlights,
    checkedDates: candidates.length,
    alreadyHave: haveSet.size,
    apiErrors,
    defaults,
  });
});

// ── Extend flight dates: create new flights by copying an existing template ──
// Copies times, prices, seats and extras from the most recent existing flight of
// the same type onto the chosen new dates (skipping any date we already have).
router.post("/flights/extend-create", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fromCity = String(body.fromCity ?? "").trim().toUpperCase();
  const toCity = String(body.toCity ?? "").trim().toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  // Each item is a (date, flightNumber) the admin picked. Multiple codes/day allowed.
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: { date: string; flightNumber: string }[] = [];
  const seenItems = new Set<string>();
  for (const raw of rawItems) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const date = String(it.date ?? "").trim();
    const fn = String(it.flightNumber ?? "").trim();
    if (!ISO_DATE_RE.test(date) || date < today || !fn) continue;
    const key = `${normFlightNum(fn)}|${date}`;
    if (seenItems.has(key)) continue;
    seenItems.add(key);
    items.push({ date, flightNumber: fn });
  }

  // Optional price/seat overrides set by the admin in the confirm form.
  // Only applied when provided and valid; otherwise the template value is kept.
  const parseMoney = (v: unknown): string | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? String(roundWholeEuro(n)) : undefined;
  };
  const parseSeats = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const parseCount = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };
  const ovAdult = parseMoney(body.adultPrice);
  const ovChild = parseMoney(body.childPrice);
  const ovInfant = parseMoney(body.infantPrice);
  const ovBaggage = parseMoney(body.checkedBaggagePrice);
  const ovBaggageCount = parseCount(body.checkedBaggageCount);
  const ovBaggageKg = parseMoney(body.checkedBaggageKg);
  const ovSeats = parseSeats(body.totalSeats);

  // Optional: an explicit template flight (e.g. the flight the admin JUST
  // created via "Përsërit deri më..."). When it matches the route + code,
  // it wins over the "latest existing" heuristic — otherwise a later-dated
  // pre-existing flight with the same code would silently become the template.
  const templateFlightId = Number(body.templateFlightId);
  let explicitTemplate: typeof flightsTable.$inferSelect | null = null;
  if (Number.isInteger(templateFlightId) && templateFlightId > 0) {
    const [tf] = await db.select().from(flightsTable).where(eq(flightsTable.id, templateFlightId)).limit(1);
    if (tf && tf.fromCity === fromCity && tf.toCity === toCity) explicitTemplate = tf;
  }

  if (!fromCity || !toCity) {
    res.status(400).json({ error: "Mungojnë të dhënat e fluturimit." }); return;
  }
  if (items.length === 0) {
    res.status(400).json({ error: "Asnjë fluturim i vlefshëm për t'u shtuar." }); return;
  }
  if (items.length > 300) {
    res.status(400).json({ error: "Shumë fluturime njëherësh (maksimumi 300)." }); return;
  }

  // Group the chosen dates by flight code so each code copies its own template.
  const byCode = new Map<string, { flightNumber: string; dates: string[] }>();
  for (const it of items) {
    const k = normFlightNum(it.flightNumber);
    if (!byCode.has(k)) byCode.set(k, { flightNumber: it.flightNumber, dates: [] });
    byCode.get(k)!.dates.push(it.date);
  }

  const toInsert: (typeof flightsTable.$inferInsert)[] = [];
  let skippedNoTemplate = 0;
  for (const [codeKey, grp] of byCode.entries()) {
    // Template = the explicitly-passed flight when its code matches, otherwise
    // the most recent existing flight of this exact code on the route.
    let template: typeof flightsTable.$inferSelect | undefined;
    if (explicitTemplate && normFlightNum(explicitTemplate.flightNumber) === codeKey) {
      template = explicitTemplate;
    } else {
      [template] = await db.select().from(flightsTable)
        .where(and(
          eq(flightsTable.fromCity, fromCity),
          eq(flightsTable.toCity, toCity),
          eq(flightsTable.flightNumber, grp.flightNumber),
        ))
        .orderBy(desc(flightsTable.departureDate))
        .limit(1);
    }
    if (!template) { skippedNoTemplate++; continue; }

    // Dates already present for this exact code — skip them.
    const existing = await db.select({ d: flightsTable.departureDate }).from(flightsTable)
      .where(and(
        eq(flightsTable.fromCity, fromCity),
        eq(flightsTable.toCity, toCity),
        eq(flightsTable.flightNumber, grp.flightNumber),
      ));
    const haveDates = new Set(existing.map(r => r.d));

    // Copy the template, but drop id/timestamps/dates AND any stale check/alert
    // metadata so the brand-new future flights don't inherit old alerts.
    const { id: _id, soldSeats: _ss, createdAt: _ca, updatedAt: _ua,
      departureDate: _dd, arrivalDate: _ad,
      scheduleAlert: _sa, scheduleAlertDetail: _sad, scheduleCheckedAt: _sca, scheduleMissCount: _smc,
      seatAlert: _sea, seatAlertDetail: _sead, seatCheckedAt: _seca, seatGooglePrice: _sgp, seatMissCount: _smc2,
      ...rest } = template;

    for (const date of grp.dates) {
      if (haveDates.has(date)) continue;
      toInsert.push(normalizeMonetaryFields(normalizeFlightIdentifiers({
        ...rest,
        departureDate: date,
        arrivalDate: normalizeArrivalDate({ departureDate: date, departureTime: rest.departureTime, arrivalTime: rest.arrivalTime }),
        soldSeats: 0,
        status: "open",
        ...(ovAdult !== undefined ? { adultPrice: ovAdult } : {}),
        ...(ovChild !== undefined ? { childPrice: ovChild } : {}),
        ...(ovInfant !== undefined ? { infantPrice: ovInfant } : {}),
        ...(ovBaggage !== undefined ? { checkedBaggagePrice: ovBaggage } : {}),
        ...(ovBaggageCount !== undefined ? { checkedBaggageCount: ovBaggageCount } : {}),
        ...(ovBaggageKg !== undefined ? { checkedBaggageKg: ovBaggageKg } : {}),
        ...(ovSeats !== undefined ? { totalSeats: ovSeats } : {}),
      })));
    }
  }

  if (toInsert.length === 0) {
    res.json({ created: 0, flights: [], skippedNoTemplate }); return;
  }

  const inserted = await db.insert(flightsTable).values(toInsert).returning();
  scheduleGSheetsSync();
  // Pa export të menjëhershëm CP — fluturimet e reja presin exportin e radhës.
  void scheduleNextAutoSoldOut();
  for (const f of inserted) {
    void recordSeatEvent({ flightId: f.id, type: "created", seats: f.totalSeats, req, note: "Zgjatje kalendari" });
    void recordFlightChange({ req, flightId: f.id, source: "extend", note: "Krijuar nga zgjatja e kalendarit" });
  }
  applyGooglePriceRulesToNewFlights(inserted.map(f => f.id));
  res.status(201).json({ created: inserted.length, flights: inserted.map(f => formatFlight(f, req.session?.role === "admin")), skippedNoTemplate });
});

// ── Found Flights: saved "new flights" per destination ───────────────────────
// Batch-search Google for new flights across several selected flight types over
// one interval, and PERSIST the results so the admin can review/add them later.
// A saved candidate is removed only when added (becomes a real flight) or
// dismissed — until then the saved list survives reloads.
const FOUND_TYPES_MAX = 40;
// Safety cap on total (route × date) Google lookups in one batch search, to
// keep the request bounded when many flights with long intervals are selected.
const FOUND_FETCH_MAX = 2000;

router.post("/flights/found-flights/search", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  // Global interval is OPTIONAL. When provided it overrides every flight's range;
  // otherwise each flight uses its OWN interval (sent per type = its existing
  // first→last date window). This makes the default date per-flight.
  const gStart = String(body.startDate ?? "").trim();
  const gEnd = String(body.endDate ?? "").trim();
  const rawTypes = Array.isArray(body.types) ? body.types : [];

  const hasGlobal = !!(gStart || gEnd);
  if (hasGlobal && (!ISO_DATE_RE.test(gStart) || !ISO_DATE_RE.test(gEnd))) {
    res.status(400).json({ error: "Data e pavlefshme (formati: VVVV-MM-DD)." }); return;
  }
  if (!process.env.RAPIDAPI_KEY) {
    res.status(503).json({ error: "Kontrolli në Google nuk është i konfiguruar (mungon API key)." }); return;
  }

  const DAY_MS = 86400000;
  const today = new Date().toISOString().slice(0, 10);

  // Normalize + dedupe the selected flight types, each carrying its OWN range.
  const types: { flightNumber: string; airline: string; fromCity: string; toCity: string; startDate: string; endDate: string }[] = [];
  const seenType = new Set<string>();
  for (const raw of rawTypes) {
    const t = (raw ?? {}) as Record<string, unknown>;
    const flightNumber = String(t.flightNumber ?? "").trim();
    const airline = String(t.airline ?? "").trim();
    const fromCity = String(t.fromCity ?? "").trim().toUpperCase();
    const toCity = String(t.toCity ?? "").trim().toUpperCase();
    if (!flightNumber || !fromCity || !toCity) continue;
    // Global override wins; else use the per-type interval.
    let s = hasGlobal ? gStart : String(t.startDate ?? "").trim();
    let e = hasGlobal ? gEnd : String(t.endDate ?? "").trim();
    if (!ISO_DATE_RE.test(s) || !ISO_DATE_RE.test(e)) continue;
    let sMs = new Date(s + "T00:00:00Z").getTime();
    let eMs = new Date(e + "T00:00:00Z").getTime();
    if (Number.isNaN(sMs) || Number.isNaN(eMs) || sMs > eMs) continue;
    // Clamp an overly long range to the max window (keeps Google calls bounded).
    if (Math.floor((eMs - sMs) / DAY_MS) + 1 > EXTEND_MAX_DAYS) {
      eMs = sMs + (EXTEND_MAX_DAYS - 1) * DAY_MS;
      e = new Date(eMs).toISOString().slice(0, 10);
    }
    const k = `${fromCity}|${toCity}|${normFlightNum(flightNumber)}`;
    if (seenType.has(k)) continue;
    seenType.add(k);
    types.push({ flightNumber, airline, fromCity, toCity, startDate: s, endDate: e });
  }
  if (types.length === 0) { res.status(400).json({ error: "Asnjë lloj fluturimi i vlefshëm (mungon intervali)." }); return; }
  if (types.length > FOUND_TYPES_MAX) {
    res.status(400).json({ error: `Shumë fluturime njëherësh (maksimumi ${FOUND_TYPES_MAX}).` }); return;
  }

  // Build each type's candidate dates (>= today) and a deduped (route, date) list.
  const typeDates = new Map<string, string[]>();
  const fetchSet = new Set<string>();
  const fetchTasks: { from: string; to: string; date: string }[] = [];
  for (const type of types) {
    const k = `${type.fromCity}|${type.toCity}|${normFlightNum(type.flightNumber)}`;
    const sMs = new Date(type.startDate + "T00:00:00Z").getTime();
    const eMs = new Date(type.endDate + "T00:00:00Z").getTime();
    const dates: string[] = [];
    for (let t = sMs; t <= eMs; t += DAY_MS) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (iso < today) continue;
      dates.push(iso);
    }
    typeDates.set(k, dates);
    for (const date of dates) {
      const fk = `${type.fromCity}|${type.toCity}|${date}`;
      if (!fetchSet.has(fk)) { fetchSet.add(fk); fetchTasks.push({ from: type.fromCity, to: type.toCity, date }); }
    }
  }
  if (fetchTasks.length === 0) {
    res.json({ found: 0, saved: 0, checkedDates: 0, types: types.length, apiErrors: 0 }); return;
  }
  if (fetchTasks.length > FOUND_FETCH_MAX) {
    res.status(400).json({ error: `Shumë data për t'u kontrolluar (${fetchTasks.length}). Zgjidh më pak fluturime ose ngushto intervalin.` }); return;
  }

  // Prefetch every (route, date) ONCE — types sharing a route reuse the result.
  type Sched = Awaited<ReturnType<typeof fetchGoogleFlightSchedules>>;
  const schedCache = new Map<string, Sched>();
  let apiErrors = 0;
  const CONCURRENCY = 5;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < fetchTasks.length) {
      const task = fetchTasks[cursor++];
      const r = await fetchGoogleFlightSchedules(task.from, task.to, task.date);
      schedCache.set(`${task.from}|${task.to}|${task.date}`, r);
      if (r.error) apiErrors++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, fetchTasks.length) }, () => worker()));

  const toUpsert: (typeof foundFlightsTable.$inferInsert)[] = [];
  const upsertSeen = new Set<string>();
  let checkedDates = 0;
  for (const type of types) {
    const targetCode = normFlightNum(type.flightNumber);
    if (!targetCode) continue;
    const dates = typeDates.get(`${type.fromCity}|${type.toCity}|${targetCode}`) ?? [];
    checkedDates += dates.length;
    // (code|date) we already have on this route in this type's range — skip.
    const existing = await db.select({ d: flightsTable.departureDate, fn: flightsTable.flightNumber })
      .from(flightsTable)
      .where(and(
        eq(flightsTable.fromCity, type.fromCity),
        eq(flightsTable.toCity, type.toCity),
        gte(flightsTable.departureDate, type.startDate),
        lte(flightsTable.departureDate, type.endDate),
      ));
    const haveSet = new Set(existing.map(r => `${normFlightNum(r.fn)}|${r.d}`));

    for (const date of dates) {
      const result = schedCache.get(`${type.fromCity}|${type.toCity}|${date}`);
      if (!result || result.error) continue;
      for (const gf of result.flights) {
        const k = normFlightNum(gf.flightNumber);
        if (k !== targetCode) continue;
        if (haveSet.has(`${k}|${date}`)) continue;
        const upKey = `${type.fromCity}|${type.toCity}|${k}|${date}`;
        if (upsertSeen.has(upKey)) continue;
        upsertSeen.add(upKey);
        const price = (k in result.flightPriceMap) ? result.flightPriceMap[k] : (result.routePrice ?? null);
        toUpsert.push({
          flightNumber: type.flightNumber,
          airline: type.airline,
          fromCity: type.fromCity,
          toCity: type.toCity,
          departureDate: date,
          departureTime: gf.departureTime || "",
          arrivalTime: gf.arrivalTime || "",
          googlePrice: price != null ? String(price) : null,
          searchStart: type.startDate,
          searchEnd: type.endDate,
        });
      }
    }
  }

  let saved = 0;
  if (toUpsert.length > 0) {
    const ins = await db.insert(foundFlightsTable)
      .values(toUpsert)
      .onConflictDoNothing({
        target: [foundFlightsTable.fromCity, foundFlightsTable.toCity, foundFlightsTable.flightNumber, foundFlightsTable.departureDate],
      })
      .returning({ id: foundFlightsTable.id });
    saved = ins.length;
  }

  res.json({ found: toUpsert.length, saved, checkedDates, types: types.length, apiErrors });
});

// List all saved candidate flights (grouped per destination on the frontend).
router.get("/flights/found-flights", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const rows = await db.select().from(foundFlightsTable)
    .orderBy(asc(foundFlightsTable.fromCity), asc(foundFlightsTable.toCity), asc(foundFlightsTable.departureDate), asc(foundFlightsTable.departureTime));
  res.json(rows.map(r => ({
    id: r.id,
    flightNumber: r.flightNumber,
    airline: r.airline,
    fromCity: r.fromCity,
    toCity: r.toCity,
    departureDate: r.departureDate,
    departureTime: r.departureTime,
    arrivalTime: r.arrivalTime,
    googlePrice: r.googlePrice != null ? Number(r.googlePrice) : null,
    searchStart: r.searchStart,
    searchEnd: r.searchEnd,
    foundAt: r.foundAt,
  })));
});

// Dismiss (delete) selected candidates without adding them.
router.post("/flights/found-flights/dismiss", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Asnjë rresht i zgjedhur." }); return; }
  await db.delete(foundFlightsTable).where(inArray(foundFlightsTable.id, ids));
  res.json({ dismissed: ids.length });
});

// Add selected candidates: create real flights (copying the existing template of
// each code on its route), then delete the candidate rows (admin acted on them).
router.post("/flights/found-flights/add", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Asnjë rresht i zgjedhur." }); return; }
  if (ids.length > 300) { res.status(400).json({ error: "Shumë fluturime njëherësh (maksimumi 300)." }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const candidates = await db.select().from(foundFlightsTable).where(inArray(foundFlightsTable.id, ids));
  if (candidates.length === 0) { res.json({ created: 0, skippedNoTemplate: 0, removed: 0 }); return; }

  // Optional price/seat overrides (applied to all created flights when valid).
  const parseMoney = (v: unknown): string | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? String(roundWholeEuro(n)) : undefined;
  };
  const parseSeats = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const parseCount = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };
  const ovAdult = parseMoney(body.adultPrice);
  const ovChild = parseMoney(body.childPrice);
  const ovInfant = parseMoney(body.infantPrice);
  const ovBaggage = parseMoney(body.checkedBaggagePrice);
  const ovBaggageCount = parseCount(body.checkedBaggageCount);
  const ovBaggageKg = parseMoney(body.checkedBaggageKg);
  const ovSeats = parseSeats(body.totalSeats);
  const defaultBaggage = await getDefaultBaggageRule();

  // Group selected candidates by route + flight code. Keep each candidate's id
  // and date so we can decide PER CANDIDATE whether it was materialized (and is
  // therefore safe to remove from the saved list).
  const groups = new Map<string, { fromCity: string; toCity: string; flightNumber: string; items: { id: number; date: string }[] }>();
  let skippedPast = 0;
  for (const c of candidates) {
    if (c.departureDate < today) { skippedPast++; continue; } // past dates stay saved, never auto-removed
    const k = `${c.fromCity}|${c.toCity}|${normFlightNum(c.flightNumber)}`;
    if (!groups.has(k)) groups.set(k, { fromCity: c.fromCity, toCity: c.toCity, flightNumber: c.flightNumber, items: [] });
    groups.get(k)!.items.push({ id: c.id, date: c.departureDate });
  }

  const toInsert: (typeof flightsTable.$inferInsert)[] = [];
  // Candidates eligible for removal: those that get created here, plus those
  // that already exist as real flights (no longer "new"). Candidates whose
  // route+code has no template, or whose date is in the past, are KEPT.
  const removableIds = new Set<number>();
  let skippedNoTemplate = 0;
  let alreadyExists = 0;
  for (const grp of groups.values()) {
    const [template] = await db.select().from(flightsTable)
      .where(and(
        eq(flightsTable.fromCity, grp.fromCity),
        eq(flightsTable.toCity, grp.toCity),
        eq(flightsTable.flightNumber, grp.flightNumber),
      ))
      .orderBy(desc(flightsTable.departureDate))
      .limit(1);
    if (!template) { skippedNoTemplate++; continue; }

    const existing = await db.select({ d: flightsTable.departureDate }).from(flightsTable)
      .where(and(
        eq(flightsTable.fromCity, grp.fromCity),
        eq(flightsTable.toCity, grp.toCity),
        eq(flightsTable.flightNumber, grp.flightNumber),
      ));
    const haveDates = new Set(existing.map(r => r.d));

    const { id: _id, soldSeats: _ss, createdAt: _ca, updatedAt: _ua,
      departureDate: _dd, arrivalDate: _ad,
      scheduleAlert: _sa, scheduleAlertDetail: _sad, scheduleCheckedAt: _sca, scheduleMissCount: _smc,
      seatAlert: _sea, seatAlertDetail: _sead, seatCheckedAt: _seca, seatGooglePrice: _sgp, seatMissCount: _smc2,
      ...rest } = template;

    for (const { id, date } of grp.items) {
      if (haveDates.has(date)) {
        // Already a real flight → no longer a "new" candidate, safe to remove.
        removableIds.add(id);
        alreadyExists++;
        continue;
      }
      removableIds.add(id); // will be created below → safe to remove
      toInsert.push(normalizeFlightIdentifiers({
        ...rest,
        departureDate: date,
        arrivalDate: normalizeArrivalDate({ departureDate: date, departureTime: rest.departureTime, arrivalTime: rest.arrivalTime }),
        soldSeats: 0,
        status: "open",
        ...(Number(rest.checkedBaggageCount ?? 0) === 0
          && Number(rest.checkedBaggageKg ?? 0) === 0
          && Number(rest.checkedBaggagePrice ?? 0) === 0
          ? {
              checkedBaggageCount: defaultBaggage.count,
              checkedBaggageKg: String(roundWholeEuro(defaultBaggage.kg)),
              checkedBaggagePrice: String(roundWholeEuro(defaultBaggage.price)),
            }
          : {}),
        ...(ovAdult !== undefined ? { adultPrice: ovAdult } : {}),
        ...(ovChild !== undefined ? { childPrice: ovChild } : {}),
        ...(ovInfant !== undefined ? { infantPrice: ovInfant } : {}),
        ...(ovBaggage !== undefined ? { checkedBaggagePrice: ovBaggage } : {}),
        ...(ovBaggageCount !== undefined ? { checkedBaggageCount: ovBaggageCount } : {}),
        ...(ovBaggageKg !== undefined ? { checkedBaggageKg: ovBaggageKg } : {}),
        ...(ovSeats !== undefined ? { totalSeats: ovSeats } : {}),
      }));
    }
  }

  let created = 0;
  if (toInsert.length > 0) {
    const inserted = await db.insert(flightsTable).values(toInsert).returning();
    created = inserted.length;
    scheduleGSheetsSync();
    // Pa export të menjëhershëm CP — fluturimet e reja presin exportin e radhës.
    void scheduleNextAutoSoldOut();
    for (const f of inserted) {
      void recordFlightChange({ req, flightId: f.id, source: "extend", note: "Shtuar nga fluturimet e gjetura" });
    }
    applyGooglePriceRulesToNewFlights(inserted.map(f => f.id));
  }
  // Remove ONLY candidates that were materialized (created) or already exist as
  // real flights. Candidates skipped because their route+code has no template,
  // or because the date is in the past, stay saved so the admin can act later.
  let removed = 0;
  if (removableIds.size > 0) {
    await db.delete(foundFlightsTable).where(inArray(foundFlightsTable.id, [...removableIds]));
    removed = removableIds.size;
  }
  res.status(201).json({
    created,
    alreadyExists,
    skippedNoTemplate,
    skippedPast,
    removed,
    kept: ids.length - removed,
  });
});

// ── Google Flights live price for a single flight ───────────────────────────
// Cached in-memory to avoid repeat RapidAPI calls when a booking is reopened.
const googlePriceCache = new Map<string, { price: number | null; routePrice: number | null; specific: boolean; ts: number; stale: boolean }>();
const GOOGLE_PRICE_DEFAULT_TTL_HOURS = 6;
const GOOGLE_PRICE_TTL_SETTING_KEY = "google_price_ttl_hours";

// How often (hours) Google prices are re-fetched, configurable from Settings.
// Cached in memory for 30s so we don't hit the DB on every row.
let cachedTtlHours: number | null = null;
let cachedTtlAt = 0;
async function getGooglePriceTtlHours(): Promise<number> {
  const now = Date.now();
  if (cachedTtlHours != null && now - cachedTtlAt < 30_000) return cachedTtlHours;
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, GOOGLE_PRICE_TTL_SETTING_KEY));
    const v = parseFloat(rows[0]?.value ?? "");
    cachedTtlHours = !isNaN(v) && v > 0 ? v : GOOGLE_PRICE_DEFAULT_TTL_HOURS;
  } catch {
    cachedTtlHours = GOOGLE_PRICE_DEFAULT_TTL_HOURS;
  }
  cachedTtlAt = now;
  return cachedTtlHours;
}

// ── "Pa Çmim" dedicated re-check interval ────────────────────────────────────
// A separate, more frequent check that re-queries Google ONLY for flights that
// currently have no price (the "Pa Çmim" set), so a price that becomes
// available is picked up quickly instead of waiting for the full Google TTL.
// Configurable from Settings; default 5 minutes, active by default.
const NO_PRICE_CHECK_DEFAULT_MIN = 5;
const NO_PRICE_CHECK_INTERVAL_KEY = "noPriceCheck.intervalMinutes";
const NO_PRICE_CHECK_ENABLED_KEY = "noPriceCheck.enabled";
const NO_PRICE_CHECK_LASTRUN_KEY = "noPriceCheck.lastRunAt";

export interface NoPriceCheckConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
}

async function readSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  if (existing.length) {
    await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
  } else {
    await db.insert(settingsTable).values({ key, value });
  }
}

export async function getNoPriceCheckConfig(): Promise<NoPriceCheckConfig> {
  const [enabled, interval, lastRunAt] = await Promise.all([
    readSetting(NO_PRICE_CHECK_ENABLED_KEY),
    readSetting(NO_PRICE_CHECK_INTERVAL_KEY),
    readSetting(NO_PRICE_CHECK_LASTRUN_KEY),
  ]);
  const mins = parseFloat(interval ?? "");
  return {
    // Enabled by default (only disabled when explicitly set to "false").
    enabled: enabled == null ? true : enabled === "true",
    intervalMinutes: Number.isFinite(mins) && mins >= 1 ? mins : NO_PRICE_CHECK_DEFAULT_MIN,
    lastRunAt: lastRunAt,
  };
}

export async function saveNoPriceCheckConfig(cfg: { enabled?: boolean; intervalMinutes?: number }): Promise<void> {
  const writes: Promise<void>[] = [];
  if (cfg.enabled !== undefined) writes.push(writeSetting(NO_PRICE_CHECK_ENABLED_KEY, cfg.enabled ? "true" : "false"));
  if (cfg.intervalMinutes !== undefined && Number.isFinite(cfg.intervalMinutes) && cfg.intervalMinutes >= 1) {
    writes.push(writeSetting(NO_PRICE_CHECK_INTERVAL_KEY, String(cfg.intervalMinutes)));
  }
  await Promise.all(writes);
}

// ── "Çmim i Vjetër" dedicated re-check interval ───────────────────────────────
// Kept separate from "Pa Çmim" because the stale set is much larger and must not
// inherit its aggressive cadence. Both controls are shown together in Settings.
const STALE_PRICE_CHECK_DEFAULT_MIN = 60;
const STALE_PRICE_CHECK_INTERVAL_KEY = "stalePriceCheck.intervalMinutes";
const STALE_PRICE_CHECK_ENABLED_KEY = "stalePriceCheck.enabled";
const STALE_PRICE_CHECK_LASTRUN_KEY = "stalePriceCheck.lastRunAt";

export interface StalePriceCheckConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
}

export async function getStalePriceCheckConfig(): Promise<StalePriceCheckConfig> {
  const [enabled, interval, lastRunAt] = await Promise.all([
    readSetting(STALE_PRICE_CHECK_ENABLED_KEY),
    readSetting(STALE_PRICE_CHECK_INTERVAL_KEY),
    readSetting(STALE_PRICE_CHECK_LASTRUN_KEY),
  ]);
  const mins = parseFloat(interval ?? "");
  return {
    enabled: enabled == null ? true : enabled === "true",
    intervalMinutes: Number.isFinite(mins) && mins >= 1 ? mins : STALE_PRICE_CHECK_DEFAULT_MIN,
    lastRunAt,
  };
}

export async function saveStalePriceCheckConfig(cfg: { enabled?: boolean; intervalMinutes?: number }): Promise<void> {
  const writes: Promise<void>[] = [];
  if (cfg.enabled !== undefined) writes.push(writeSetting(STALE_PRICE_CHECK_ENABLED_KEY, cfg.enabled ? "true" : "false"));
  if (cfg.intervalMinutes !== undefined && Number.isFinite(cfg.intervalMinutes) && cfg.intervalMinutes >= 1) {
    writes.push(writeSetting(STALE_PRICE_CHECK_INTERVAL_KEY, String(cfg.intervalMinutes)));
  }
  await Promise.all(writes);
}

// ── "Të Aferta" (soon) price refresh ─────────────────────────────────────────
// The soon-flights price refresh is OPT-IN and folded into the seat-availability
// check (see lib/seatCheck.ts, option "Përfshi edhe rifreskimin e çmimeve"). It
// reuses warmSoonFlights() below with the seat-check `days` window, then re-applies
// the price rules — no standalone scheduler/route/config of its own.

// ── "Çmim i Ri" candidate fetch interval ─────────────────────────────────────
// Drives the dedicated warmer that auto-fetches a LIVE Google price for ALL
// upcoming flights and stores it as a DISPLAY-ONLY candidate (candidate_price).
// This is ONLY a fetch INTERVAL — it is NOT a price rule and NEVER rewrites the
// real sale price. The admin promotes candidates to the saved Google price (and
// recomputes the sale price via the existing rules) via the bulk "Updato Çmimet".
const NEW_PRICE_CHECK_DEFAULT_MIN = 30;
const NEW_PRICE_CHECK_INTERVAL_KEY = "newPriceCheck.intervalMinutes";
const NEW_PRICE_CHECK_ENABLED_KEY = "newPriceCheck.enabled";
const NEW_PRICE_CHECK_LASTRUN_KEY = "newPriceCheck.lastRunAt";

export interface NewPriceCheckConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
}

export async function getNewPriceCheckConfig(): Promise<NewPriceCheckConfig> {
  const [enabled, interval, lastRunAt] = await Promise.all([
    readSetting(NEW_PRICE_CHECK_ENABLED_KEY),
    readSetting(NEW_PRICE_CHECK_INTERVAL_KEY),
    readSetting(NEW_PRICE_CHECK_LASTRUN_KEY),
  ]);
  const mins = parseFloat(interval ?? "");
  return {
    // Enabled by default (only disabled when explicitly set to "false").
    enabled: enabled == null ? true : enabled === "true",
    intervalMinutes: Number.isFinite(mins) && mins >= 1 ? mins : NEW_PRICE_CHECK_DEFAULT_MIN,
    lastRunAt,
  };
}

export async function saveNewPriceCheckConfig(cfg: { enabled?: boolean; intervalMinutes?: number }): Promise<void> {
  const writes: Promise<void>[] = [];
  if (cfg.enabled !== undefined) writes.push(writeSetting(NEW_PRICE_CHECK_ENABLED_KEY, cfg.enabled ? "true" : "false"));
  if (cfg.intervalMinutes !== undefined && Number.isFinite(cfg.intervalMinutes) && cfg.intervalMinutes >= 1) {
    writes.push(writeSetting(NEW_PRICE_CHECK_INTERVAL_KEY, String(cfg.intervalMinutes)));
  }
  await Promise.all(writes);
}

// ── "Raport Ndryshimi Çmimesh" email mode ────────────────────────────────────
// Controls WHEN the price-change report email is sent after the Google price
// rules rewrite at least one sale price. The price CHANGES always happen — this
// only gates the notification email so the admin isn't flooded.
//   always       – email on every refresh that changes ≥1 price (default; old behavior)
//   daily_manual – only the daily 02:00 forced refresh + manual refreshes;
//                  suppresses the periodic automatic warmer ("...automatik...")
//   threshold    – only when ≥ N flights changed in a single refresh
//   off          – never send the email (prices still update silently)
export type PriceReportEmailMode = "always" | "daily_manual" | "threshold" | "off";
const PRICE_REPORT_MODE_KEY = "priceReport.emailMode";
const PRICE_REPORT_THRESHOLD_KEY = "priceReport.emailThreshold";
const PRICE_REPORT_DEFAULT_THRESHOLD = 10;
const PRICE_REPORT_VALID_MODES: PriceReportEmailMode[] = ["always", "daily_manual", "threshold", "off"];

export interface PriceReportEmailConfig {
  mode: PriceReportEmailMode;
  threshold: number;
}

export async function getPriceReportEmailConfig(): Promise<PriceReportEmailConfig> {
  const [mode, threshold] = await Promise.all([
    readSetting(PRICE_REPORT_MODE_KEY),
    readSetting(PRICE_REPORT_THRESHOLD_KEY),
  ]);
  const n = parseInt(threshold ?? "", 10);
  return {
    mode: PRICE_REPORT_VALID_MODES.includes(mode as PriceReportEmailMode) ? (mode as PriceReportEmailMode) : "always",
    threshold: Number.isFinite(n) && n >= 1 ? n : PRICE_REPORT_DEFAULT_THRESHOLD,
  };
}

export async function savePriceReportEmailConfig(cfg: { mode?: PriceReportEmailMode; threshold?: number }): Promise<void> {
  const writes: Promise<void>[] = [];
  if (cfg.mode !== undefined && PRICE_REPORT_VALID_MODES.includes(cfg.mode)) {
    writes.push(writeSetting(PRICE_REPORT_MODE_KEY, cfg.mode));
  }
  if (cfg.threshold !== undefined && Number.isFinite(cfg.threshold) && cfg.threshold >= 1) {
    writes.push(writeSetting(PRICE_REPORT_THRESHOLD_KEY, String(Math.round(cfg.threshold))));
  }
  await Promise.all(writes);
}

// Decide whether to send the price-change report email for this refresh, based
// on the configured mode. `source` is the refresh label (e.g. the automatic
// warmer says "...automatik..."), `changeCount` is how many flights changed.
function shouldSendPriceReport(cfg: PriceReportEmailConfig, source: string, changeCount: number): boolean {
  switch (cfg.mode) {
    case "off": return false;
    case "threshold": return changeCount >= cfg.threshold;
    case "daily_manual": return !/automatik/i.test(source);
    case "always":
    default: return true;
  }
}

// "Fluturime të Aferta" tab: how many days ahead to consider "upcoming soon".
const UPCOMING_DAYS_SETTING_KEY = "upcoming_days";
let cachedUpcomingDays: number | null = null;
let cachedUpcomingDaysAt = 0;
async function getUpcomingDays(): Promise<number> {
  const now = Date.now();
  if (cachedUpcomingDays != null && now - cachedUpcomingDaysAt < 30_000) return cachedUpcomingDays;
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, UPCOMING_DAYS_SETTING_KEY));
    const v = parseInt(rows[0]?.value ?? "", 10);
    cachedUpcomingDays = !isNaN(v) && v > 0 ? v : 7;
  } catch {
    cachedUpcomingDays = 7;
  }
  cachedUpcomingDaysAt = now;
  return cachedUpcomingDays;
}

// Write a freshly-fetched Google price into both the in-memory cache and the
// persistent DB cache, so the per-row "Google" column reflects it immediately
// (the column reads from /flights/google-price, which serves these caches).
async function upsertGooglePriceCacheEntry(
  cacheKey: string, price: number | null, routePrice: number | null, specific: boolean, ts: number,
  stale = false,
): Promise<void> {
  // Even legacy/caller-supplied stale numbers must never become current prices.
  ({ price, routePrice, specific, stale } = googlePriceResponse({ price, routePrice, specific, stale }));
  googlePriceCache.set(cacheKey, { price, routePrice, specific, ts, stale });
  try {
    await db.insert(googlePriceCacheTable).values({
      cacheKey,
      price: price != null ? price.toString() : null,
      routePrice: routePrice != null ? routePrice.toString() : null,
      specific,
      stale,
      fetchedAt: new Date(ts),
    }).onConflictDoUpdate({
      target: googlePriceCacheTable.cacheKey,
      set: {
        // Stash the pre-update price as prevPrice (old row value in Postgres SET).
        prevPrice: sql`COALESCE(${googlePriceCacheTable.price}, ${googlePriceCacheTable.prevPrice})`,
        price: price != null ? price.toString() : null,
        routePrice: routePrice != null ? routePrice.toString() : null,
        specific,
        stale,
        fetchedAt: new Date(ts),
      },
    });
  } catch (err) {
    logger.error({ err, cacheKey }, "Failed to persist google price cache");
  }
}

// Record a failed verification for EVERY requested key, including missing/null
// rows and the route key. History stays in prevPrice; public prices are null.
async function markGroupStale(
  from: string, to: string, date: string, groupFlights: Array<typeof flightsTable.$inferSelect>,
  requestStartedAt: Date,
): Promise<void> {
  for (const flight of groupFlights) {
    await applyGoogleSearchScheduleAlert(flight, requestStartedAt,
      { price: null, routePrice: null, specific: false, error: true });
  }
  const keys = new Set([
    `${from}|${to}|${date}|`,
    ...groupFlights.map(f =>
      `${from}|${to}|${date}|${f.flightNumber ? normFlightNum(String(f.flightNumber)) : ""}`),
  ]);
  const ts = Date.now();
  for (const k of keys) {
    await upsertGooglePriceCacheEntry(k, null, null, false, ts, true);
  }
}

// Bulk endpoint: returns all currently-cached Google prices for upcoming flights
// in a single response. The frontend pre-populates its per-row react-query cache
// and localStorage on page load so individual cells never need to refetch on
// every filter change — one fetch per configured TTL interval is enough.
router.get("/flights/google-prices-bulk", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const today = new Date().toISOString().slice(0, 10);

  const upcomingFlights = await db.select({
    id: flightsTable.id,
    fromCity: flightsTable.fromCity,
    toCity: flightsTable.toCity,
    departureDate: flightsTable.departureDate,
    flightNumber: flightsTable.flightNumber,
  }).from(flightsTable).where(gte(flightsTable.departureDate, today));

  if (upcomingFlights.length === 0) { res.json([]); return; }

  type FlightRow = typeof upcomingFlights[0];
  const keyToFlight = new Map<string, FlightRow>();
  for (const f of upcomingFlights) {
    const from = f.fromCity.toUpperCase();
    const to = f.toCity.toUpperCase();
    const norm = f.flightNumber ? normFlightNum(f.flightNumber) : "";
    const key = `${from}|${to}|${f.departureDate}|${norm}`;
    if (!keyToFlight.has(key)) keyToFlight.set(key, f);
  }

  const keys = [...keyToFlight.keys()];
  const results: Array<{
    flightId: number; from: string; to: string; date: string;
    flightNumber: string | null; price: number | null; specific: boolean; stale: boolean;
  }> = [];

  // Cache-only display: return the cached value for every key REGARDLESS of age.
  // Viewing must never refresh prices — only the admin/background refresh paths
  // (warmer/daily/manual) update the cache. Showing the last cached value keeps
  // the UI consistent for all users and avoids per-row live fetches.
  // First: in-memory cache (instant, no DB hit)
  const keysNeedingDB: string[] = [];
  for (const key of keys) {
    const mem = googlePriceCache.get(key);
    if (mem) {
      const f = keyToFlight.get(key)!;
      const { price, specific, stale } = googlePriceResponse(mem);
      results.push({ flightId: f.id, from: f.fromCity, to: f.toCity, date: f.departureDate, flightNumber: f.flightNumber, price, specific, stale });
    } else {
      keysNeedingDB.push(key);
    }
  }

  // Second: DB cache for keys not in memory (one batch query)
  if (keysNeedingDB.length > 0) {
    const dbRows = await db.select().from(googlePriceCacheTable).where(inArray(googlePriceCacheTable.cacheKey, keysNeedingDB));
    for (const row of dbRows) {
      const fetchedAtMs = new Date(row.fetchedAt).getTime();
      const f = keyToFlight.get(row.cacheKey);
      if (!f) continue;
      const dbPrice = row.price != null ? Number(row.price) : null;
      const { price, specific, stale } = googlePriceResponse(row);
      results.push({ flightId: f.id, from: f.fromCity, to: f.toCity, date: f.departureDate, flightNumber: f.flightNumber, price, specific, stale });
      googlePriceCache.set(row.cacheKey, { price: dbPrice, routePrice: row.routePrice != null ? Number(row.routePrice) : null, specific: row.specific, ts: fetchedAtMs, stale: row.stale });
    }
  }

  res.json(results);
});

router.get("/flights/google-price", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  const date = String(req.query.date ?? "").trim();
  const flightNumber = String(req.query.flightNumber ?? "").trim();
  if (!from || !to || !date) { res.status(400).json({ error: "from, to, date required" }); return; }

  const norm = flightNumber ? normFlightNum(flightNumber) : "";
  const cacheKey = `${from.toUpperCase()}|${to.toUpperCase()}|${date}|${norm}`;

  // Display is CACHE-ONLY: opening/viewing a flight must NEVER trigger a live
  // Google fetch. A live fetch would (a) burn RapidAPI quota on every page view
  // and (b) refresh the cached reference price at an unpredictable moment, which
  // then makes the 30-min rule pass change sale prices "just because someone
  // opened a flight". Fresh Google prices are fetched ONLY by admin/background
  // refresh paths: the price warmer (configured interval/TTL), the daily 02:00
  // forced refresh, and the manual "Rifresko Tani" button. Everyone reads the
  // same cached value, so an admin refresh is what shows for all users.
  const cached = googlePriceCache.get(cacheKey);
  if (cached) {
    res.json({ ...googlePriceResponse(cached), currency: "EUR", cached: true });
    return;
  }

  // Persistent fallback: mirror the DB cache into memory (no live fetch). This
  // survives server restarts so a fresh process serves the last cached value.
  try {
    const [row] = await db.select().from(googlePriceCacheTable).where(eq(googlePriceCacheTable.cacheKey, cacheKey));
    if (row) {
      const dbPrice = row.price != null ? Number(row.price) : null;
      const dbRoutePrice = row.routePrice != null ? Number(row.routePrice) : null;
      googlePriceCache.set(cacheKey, { price: dbPrice, routePrice: dbRoutePrice, specific: row.specific, ts: new Date(row.fetchedAt).getTime(), stale: row.stale });
      res.json({ ...googlePriceResponse(row), currency: "EUR", cached: true });
      return;
    }
  } catch (err) {
    req.log?.error?.({ err }, "Failed to read google price cache from DB");
    res.status(503).json({ price: null, routePrice: null, specific: false, stale: true, currency: "EUR", cached: true, error: "Nuk u verifikua" });
    return;
  }

  // No cached price yet — the background warmer fills missing prices on its next
  // cycle. Return null instead of fetching live, so the view stays read-only.
  res.json({ price: null, routePrice: null, specific: false, stale: false, currency: "EUR", cached: true });
});

// ── Admin: live Google price peek + apply for a single flight ───────────────
// Opening a flight/booking detail shows three prices: our sale price, the SAVED
// (cached) Google price, and a NEWLY fetched live Google price. The live fetch
// here is admin-only and does NOT write the cache (peek only) — the saved price
// only changes when the admin presses "Përditëso çmimin nga Google" (apply).
router.get("/flights/:id/google-price/live", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admini" }); return; }
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, id));
  if (!flight) { res.status(404).json({ error: "Fluturimi nuk u gjet" }); return; }
  if (await googleMonitoringDisabled(id)) {
    res.status(409).json({ error: "Kontrolli Google është çaktivizuar për këtë fluturim" }); return;
  }

  const fromU = String(flight.fromCity).toUpperCase();
  const toU = String(flight.toCity).toUpperCase();
  const date = String(flight.departureDate);
  const norm = flight.flightNumber ? normFlightNum(String(flight.flightNumber)) : "";
  const specificKey = `${fromU}|${toU}|${date}|${norm}`;
  const routeKey = `${fromU}|${toU}|${date}|`;

  // Saved (cached) Google price — read-only: in-memory first, then DB fallback.
  const memSpecific = googlePriceCache.get(specificKey);
  let savedGooglePriceValue = savedGooglePrice(memSpecific, googlePriceCache.get(routeKey));
  if (!memSpecific) {
    try {
      const rows = await db.select().from(googlePriceCacheTable)
        .where(inArray(googlePriceCacheTable.cacheKey, [specificKey, routeKey]));
      const map = new Map(rows.map(r => [r.cacheKey, r]));
      savedGooglePriceValue = savedGooglePrice(map.get(specificKey), googlePriceCache.get(routeKey) ?? map.get(routeKey));
    } catch (err) {
      req.log?.error?.({ err, id }, "[google-price/live] cache read failed");
    }
  }

  // Live Google price (NO cache write). Flight-specific first, route min fallback.
  let newGooglePrice: number | null = null;
  let stale = false;
  try {
    const r = await fetchGoogleFlightSchedules(flight.fromCity, flight.toCity, date);
    if (!r.error) {
      const specificPrice = norm && norm in r.flightPriceMap ? r.flightPriceMap[norm] : null;
      newGooglePrice = specificPrice ?? r.routePrice ?? null;
    } else stale = true;
  } catch (err) {
    stale = true;
    req.log?.error?.({ err, id }, "[google-price/live] live fetch failed");
  }

  // Preview: what our sale price WOULD become per the active Google rule.
  let hasRule = false;
  let wouldBeOurPrice: number | null = null;
  try {
    const rules = await getActiveGooglePriceRules();
    const internalRules = rules.filter(r => r.applyInternal !== false);
    const rule = findGoogleRuleForFlight(internalRules, {
      id: flight.id, fromCity: flight.fromCity, toCity: flight.toCity,
      airline: flight.airline, flightNumber: flight.flightNumber, departureDate: flight.departureDate,
    });
    hasRule = !!rule;
    if (rule && newGooglePrice != null) wouldBeOurPrice = computeGoogleSalePrice(newGooglePrice, rule);
  } catch (err) {
    req.log?.error?.({ err, id }, "[google-price/live] rule preview failed");
  }

  res.json({
    ourPrice: flight.adultPrice != null ? Number(flight.adultPrice) : null,
    savedGooglePrice: savedGooglePriceValue,
    newGooglePrice,
    stale,
    hasRule,
    wouldBeOurPrice,
    currency: "EUR",
  });
});

// Admin: persist a freshly fetched Google price for ONE flight and recompute its
// sale price from the active Google rule (−%/fixed). Writes the cache (fresh,
// non-stale) then re-applies the rule for just this flight (email suppressed —
// single manual updates must not spam the price-change report).
router.post("/flights/:id/google-price/apply", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admini" }); return; }
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const googlePrice = parseFloat(req.body?.googlePrice ?? "");
  if (isNaN(googlePrice) || googlePrice <= 0) { res.status(400).json({ error: "Çmim Google i pavlefshëm" }); return; }

  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, id));
  if (!flight) { res.status(404).json({ error: "Fluturimi nuk u gjet" }); return; }
  if (await googleMonitoringDisabled(id)) {
    res.status(409).json({ error: "Kontrolli Google është çaktivizuar për këtë fluturim" }); return;
  }

  const fromU = String(flight.fromCity).toUpperCase();
  const toU = String(flight.toCity).toUpperCase();
  const date = String(flight.departureDate);
  const norm = flight.flightNumber ? normFlightNum(String(flight.flightNumber)) : "";
  const cacheKey = `${fromU}|${toU}|${date}|${norm}`;

  // Overwrite the saved Google price with the new value (fresh, not stale).
  await upsertGooglePriceCacheEntry(cacheKey, googlePrice, googlePrice, !!norm, Date.now(), false);

  // Recompute THIS flight's sale price from the rule (cache-only, no email).
  // Scoped runs bypass the global apply guard, so this always executes even if a
  // warmer cycle is in progress. The return is the number of flights whose price
  // actually changed (0 or 1 here) — used to report priceRecomputed honestly.
  const changed = await applyGooglePriceRulesToFlights(
    "Përditësim manual nga Google (një fluturim)",
    { onlyFlightId: id, suppressEmail: true },
  );

  const [updated] = await db.select().from(flightsTable).where(eq(flightsTable.id, id));

  let hasRule = false;
  try {
    const rules = await getActiveGooglePriceRules();
    const internalRules = rules.filter(r => r.applyInternal !== false);
    hasRule = !!findGoogleRuleForFlight(internalRules, {
      id: flight.id, fromCity: flight.fromCity, toCity: flight.toCity,
      airline: flight.airline, flightNumber: flight.flightNumber, departureDate: flight.departureDate,
    });
  } catch { /* best-effort */ }

  res.json({
    savedGooglePrice: googlePrice,
    ourPrice: updated?.adultPrice != null ? Number(updated.adultPrice) : null,
    // A rule exists for this flight (so a recompute was attempted from the rule).
    ruleApplied: hasRule,
    // The sale price actually moved as a result of this apply (>=1 row changed).
    priceChanged: changed > 0,
  });
});

// ── "Çmim i Ri" bulk read ────────────────────────────────────────────────────
// Returns the saved Google price AND the latest DISPLAY-ONLY candidate price for
// every cache row, so the "Çmim i Ri" tab can show old vs new side-by-side. The
// candidate is written by the dedicated warmer and is never auto-applied.
router.get("/flights/new-prices-bulk", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admini" }); return; }
  try {
    const rows = await db.select({
      cacheKey: googlePriceCacheTable.cacheKey,
      price: googlePriceCacheTable.price,
      stale: googlePriceCacheTable.stale,
      candidatePrice: googlePriceCacheTable.candidatePrice,
      candidateAt: googlePriceCacheTable.candidateAt,
    }).from(googlePriceCacheTable);
    res.json(rows.map(r => ({
      cacheKey: r.cacheKey,
      price: googlePriceResponse(r).price,
      stale: r.stale,
      candidatePrice: r.candidatePrice != null ? Number(r.candidatePrice) : null,
      candidateAt: r.candidateAt ? new Date(r.candidateAt).toISOString() : null,
    })));
  } catch (err) {
    req.log?.error?.({ err }, "[new-prices-bulk] failed");
    res.status(500).json({ error: "Gabim gjatë leximit të çmimeve" });
  }
});

// Admin: promote the CANDIDATE Google price (the value shown in the "Çmim i Ri"
// column) into the saved Google price for a set of flights, then recompute their
// sale prices from the active Google rule (email suppressed). This is the "Updato
// Çmimet" bulk action. It reads each flight's candidate under the specific key then
// the route key — the SAME resolution the "Çmim i Ri" column uses — so the applied
// value matches exactly what the admin saw in that column (apply==display).
router.post("/flights/google-price/apply-bulk", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admini" }); return; }
  const rawIds = Array.isArray(req.body?.flightIds) ? req.body.flightIds : [];
  const flightIds = Array.from(new Set(
    rawIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0),
  )) as number[];
  if (!flightIds.length) { res.status(400).json({ error: "Asnjë fluturim i zgjedhur" }); return; }

  const applyCandidates = await db.select().from(flightsTable).where(inArray(flightsTable.id, flightIds));
  const disabledApplyIds = await googleMonitoringDisabledIds(applyCandidates.map(f => f.id));
  const flights = applyCandidates.filter(f => !disabledApplyIds.has(f.id));
  if (!flights.length) { res.status(404).json({ error: "Fluturimet nuk u gjetën" }); return; }

  // Resolve every flight's candidate from the cache (specific key then route key).
  const keyMap = new Map<number, { specificKey: string; routeKey: string; norm: string }>();
  const allKeys = new Set<string>();
  for (const f of flights) {
    const fromU = String(f.fromCity).toUpperCase();
    const toU = String(f.toCity).toUpperCase();
    const date = String(f.departureDate);
    const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
    const specificKey = `${fromU}|${toU}|${date}|${norm}`;
    const routeKey = `${fromU}|${toU}|${date}|`;
    keyMap.set(f.id, { specificKey, routeKey, norm });
    allKeys.add(specificKey); allKeys.add(routeKey);
  }
  const cacheRows = await db.select({
    cacheKey: googlePriceCacheTable.cacheKey,
    candidatePrice: googlePriceCacheTable.candidatePrice,
  }).from(googlePriceCacheTable).where(inArray(googlePriceCacheTable.cacheKey, [...allKeys]));
  const candMap = new Map<string, number | null>(
    cacheRows.map(r => [r.cacheKey, r.candidatePrice != null ? Number(r.candidatePrice) : null]),
  );

  const appliedIds: number[] = [];
  let skippedNoCandidate = 0;
  for (const f of flights) {
    const km = keyMap.get(f.id)!;
    const cand = candMap.get(km.specificKey) ?? candMap.get(km.routeKey) ?? null;
    if (cand == null || cand <= 0) { skippedNoCandidate++; continue; }
    // Promote candidate → saved Google price (fresh, not stale), keyed exactly like
    // the single-flight apply so the rule reads it on recompute.
    await upsertGooglePriceCacheEntry(km.specificKey, cand, cand, !!km.norm, Date.now(), false);
    appliedIds.push(f.id);
  }

  // Recompute the sale price for the promoted flights in ONE scoped run (rule
  // logic reused; email suppressed so bulk applies don't spam the report).
  let changed = 0;
  if (appliedIds.length) {
    changed = await applyGooglePriceRulesToFlights(
      "Përditësim manual nga Google (Çmim i Ri)",
      { onlyFlightIds: appliedIds, suppressEmail: true },
    );
  }

  res.json({
    requested: flightIds.length,
    applied: appliedIds.length,
    skippedNoCandidate,
    priceChanged: changed,
  });
});

// ── Flight price-change history ─────────────────────────────────────────────
// Snapshot the most recent Google Flights price we have cached for a flight's
// route/date, so the history can show "our price vs Google" at change time.
function snapshotGooglePriceForFlight(flight: any): number | null {
  try {
    const from = String(flight.fromCity ?? "").toUpperCase();
    const to = String(flight.toCity ?? "").toUpperCase();
    const date = String(flight.departureDate ?? "");
    if (!from || !to || !date) return null;
    const norm = flight.flightNumber ? normFlightNum(String(flight.flightNumber)) : "";
    // Try the specific-flight key first, then the route-only key.
    const keys = [`${from}|${to}|${date}|${norm}`, `${from}|${to}|${date}|`];
    for (const k of keys) {
      const c = googlePriceCache.get(k);
      if (c && c.price != null) return c.price;
    }
    return null;
  } catch {
    return null;
  }
}

// Insert a history row when a flight's own ("adult") price actually changed.
async function recordFlightPriceChange(req: any, oldFlight: any, newFlight: any): Promise<void> {
  try {
    const oldP = oldFlight?.adultPrice != null ? Number(oldFlight.adultPrice) : null;
    const newP = newFlight?.adultPrice != null ? Number(newFlight.adultPrice) : null;
    if (newP == null || oldP === newP) return;
    const google = snapshotGooglePriceForFlight(newFlight);
    await db.insert(flightPriceHistoryTable).values({
      flightId: newFlight.id,
      oldAdultPrice: oldP != null ? oldP.toString() : null,
      newAdultPrice: newP.toString(),
      googlePrice: google != null ? google.toString() : null,
      userId: req.session?.userId ?? null,
      userName: req.session?.userName ?? "Staff",
      userRole: req.session?.role ?? null,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to record flight price history");
  }
}

// Insert a history row from explicit values (used by the Google price sync endpoint,
// where we already know the live Google price). No-op when the price didn't change.
async function recordPriceHistoryRow(
  req: any, flightId: number, oldP: number | null, newP: number, googlePrice: number | null,
): Promise<void> {
  try {
    if (oldP === newP) return;
    await db.insert(flightPriceHistoryTable).values({
      flightId,
      oldAdultPrice: oldP != null ? oldP.toString() : null,
      newAdultPrice: newP.toString(),
      googlePrice: googlePrice != null ? googlePrice.toString() : null,
      userId: req.session?.userId ?? null,
      userName: req.session?.userName ?? "Staff",
      userRole: req.session?.role ?? null,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to record flight price history (sync)");
  }
}

// ── Historiku i detajuar i ndryshimeve të fluturimit ────────────────────────
// Një rresht për çdo ngjarje (krijim, editim, sinkronizim orari, dublikim,
// ndryshim masiv...). `changes` = lista e fushave të ndryshuara old → new.
// Ndryshimet automatike të çmimit nga rregullat Google NUK regjistrohen këtu
// (kanë historikun e vet të çmimeve) që historiku të mos mbushet me spam.
const FLIGHT_CHANGE_FIELDS = [
  "airline", "flightNumber", "fromCity", "toCity",
  "departureDate", "departureTime", "arrivalDate", "arrivalTime",
  "adultPrice", "childPrice", "infantPrice", "citizenPrice", "tax",
  "totalSeats", "status", "isConfirmed",
  "cabinBaggageKg", "checkedBaggageCount", "checkedBaggageKg", "checkedBaggagePrice",
  "seatSelectionPrice", "priorityBoardingPrice", "insurancePrice",
  "notes", "sellCutoffHours", "showInBookingEngine", "excludeFromGoogleRule",
  "externalSalesBlocked",
] as const;

const FLIGHT_CHANGE_NUMERIC_FIELDS = new Set([
  "adultPrice", "childPrice", "infantPrice", "citizenPrice", "tax",
  "cabinBaggageKg", "checkedBaggageKg", "checkedBaggagePrice",
  "seatSelectionPrice", "priorityBoardingPrice", "insurancePrice",
]);

function normFlightChangeVal(field: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (FLIGHT_CHANGE_NUMERIC_FIELDS.has(field)) {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : String(v);
  }
  if (field === "departureTime" || field === "arrivalTime") {
    return extractHHMM(String(v)) || String(v);
  }
  return String(v);
}

// ── Njoftim me email për çdo ndryshim fluturimi ─────────────────────────────
// Çdo ngjarje e historikut të ndryshimeve dërgohet edhe me email te NOTIFY_EMAIL.
// Ngjarjet grumbullohen për 60 sekonda dhe dërgohen si NJË email i vetëm, që
// ndryshimet masive (bulk / import / zgjatje kalendari) të mos mbushin inbox-in
// me qindra email-e veç e veç.
const FLIGHT_FIELD_LABELS_SQ: Record<string, string> = {
  airline: "Kompania ajrore",
  flightNumber: "Numri i fluturimit",
  fromCity: "Nga",
  toCity: "Për",
  departureDate: "Data e nisjes",
  departureTime: "Ora e nisjes",
  arrivalDate: "Data e mbërritjes",
  arrivalTime: "Ora e mbërritjes",
  adultPrice: "Çmimi Adult",
  childPrice: "Çmimi Fëmijë",
  infantPrice: "Çmimi Bebe",
  citizenPrice: "Çmimi Offline",
  tax: "Taksa",
  totalSeats: "Vendet totale",
  status: "Statusi",
  isConfirmed: "I konfirmuar",
  cabinBaggageKg: "Bagazh kabine (kg)",
  checkedBaggageCount: "Nr. bagazhesh të regjistruara",
  checkedBaggageKg: "Bagazh i regjistruar (kg)",
  checkedBaggagePrice: "Çmimi i bagazhit",
  seatSelectionPrice: "Zgjedhja e vendit",
  priorityBoardingPrice: "Hipja me përparësi",
  insurancePrice: "Sigurimi",
  notes: "Shënime",
  sellCutoffHours: "Kufiri i shitjes (orë)",
  showInBookingEngine: "Shfaq në Booking Engine",
  excludeFromGoogleRule: "Përjashtuar nga rregulli Google",
  externalSalesBlocked: "Shitjet e jashtme të bllokuara",
};

const FLIGHT_SOURCE_LABELS_SQ: Record<string, string> = {
  create: "Krijim fluturimi",
  edit: "Modifikim",
  bulk: "Ndryshim masiv",
  import: "Import nga Excel",
  "sync-schedule": "Sinkronizim orari (Google)",
  duplicate: "Dublikim",
  "toggle-sales": "Hapje/Mbyllje shitjesh",
  "citizen-price": "Çmimi Offline",
  extend: "Zgjatje kalendari",
  delete: "Fshirje fluturimi",
};

type PendingFlightChangeEmail = {
  flightId: number;
  source: string;
  changes: { field: string; old: string | null; new: string | null }[];
  note: string | null;
  userName: string;
  at: Date;
  // Për fluturimet e fshira: fluturimi s'ekziston më në DB në momentin e
  // dërgimit, prandaj titulli jepet i gatshëm këtu.
  headOverride?: string;
};

const pendingFlightChangeEmails: PendingFlightChangeEmail[] = [];
let flightChangeEmailTimer: NodeJS.Timeout | null = null;
const FLIGHT_CHANGE_EMAIL_DELAY_MS = 60 * 1000;

function escFcHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtFcDate(d: unknown): string {
  const s = String(d ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

function queueFlightChangeEmail(item: PendingFlightChangeEmail): void {
  if (!process.env.NOTIFY_EMAIL) return;
  pendingFlightChangeEmails.push(item);
  if (!flightChangeEmailTimer) {
    flightChangeEmailTimer = setTimeout(() => {
      flightChangeEmailTimer = null;
      void flushFlightChangeEmails();
    }, FLIGHT_CHANGE_EMAIL_DELAY_MS);
    // Mos e mbaj procesin gjallë vetëm për këtë timer.
    flightChangeEmailTimer.unref?.();
  }
}

async function flushFlightChangeEmails(): Promise<void> {
  const items = pendingFlightChangeEmails.splice(0);
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!items.length || !notifyTo) return;
  try {
    const ids = [...new Set(items.filter(i => !i.headOverride).map(i => i.flightId))];
    const rows = ids.length
      ? await db.select({
          id: flightsTable.id, airline: flightsTable.airline, flightNumber: flightsTable.flightNumber,
          fromCity: flightsTable.fromCity, toCity: flightsTable.toCity, departureDate: flightsTable.departureDate,
        }).from(flightsTable).where(inArray(flightsTable.id, ids))
      : [];
    const byId = new Map(rows.map(f => [f.id, f]));

    // Kufi për madhësinë e email-it: mbi 50 ndryshime shfaqen vetëm 50 të parat
    // (Gmail e pret shfaqjen e email-eve shumë të mëdha); pjesa tjetër përmendet
    // si numër — historiku i plotë gjendet gjithmonë te "Historiku" në sistem.
    const MAX_EMAIL_BLOCKS = 50;
    const shownItems = items.slice(0, MAX_EMAIL_BLOCKS);
    const hiddenCount = items.length - shownItems.length;

    const blocks = shownItems.map(it => {
      const f = byId.get(it.flightId);
      const head = it.headOverride
        ? it.headOverride
        : f
          ? `${(f.flightNumber || "").trim()} · ${f.fromCity} → ${f.toCity} · ${fmtFcDate(f.departureDate)} · Kodi #${it.flightId}`
          : `Fluturimi me kod #${it.flightId} (nuk ekziston më)`;
      const srcLabel = FLIGHT_SOURCE_LABELS_SQ[it.source] || it.source;
      const when = it.at.toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane", day: "2-digit", month: "2-digit", year: "numeric" })
        + ", " + it.at.toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true });
      // Vetëm PARAQITJA e orëve në email kalon në format 12-orësh me AM/PM.
      const fcShow = (field: string, v: string | null) =>
        (field === "departureTime" || field === "arrivalTime") && v ? fmtAmPm(v) : (v ?? "—");
      const changeRows = it.changes.map(c => `
        <tr>
          <td style="padding:4px 10px;border:1px solid #e2e8f0;color:#334155;">${escFcHtml(FLIGHT_FIELD_LABELS_SQ[c.field] || c.field)}</td>
          <td style="padding:4px 10px;border:1px solid #e2e8f0;color:#991b1b;">${escFcHtml(fcShow(c.field, c.old))}</td>
          <td style="padding:4px 10px;border:1px solid #e2e8f0;color:#166534;font-weight:600;">${escFcHtml(fcShow(c.field, c.new))}</td>
        </tr>`).join("");
      return `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:14px;background:#ffffff;">
        <div style="font-weight:700;font-size:14px;color:#0f172a;">${escFcHtml(head)}</div>
        <div style="font-size:12px;color:#64748b;margin:4px 0 8px;">
          ${escFcHtml(srcLabel)} · nga <b>${escFcHtml(it.userName)}</b> · ${escFcHtml(when)}
        </div>
        ${it.changes.length ? `
        <table style="border-collapse:collapse;font-size:12px;width:100%;">
          <tr>
            <th style="padding:4px 10px;border:1px solid #e2e8f0;background:#f8fafc;text-align:left;color:#475569;">Fusha</th>
            <th style="padding:4px 10px;border:1px solid #e2e8f0;background:#f8fafc;text-align:left;color:#475569;">Para</th>
            <th style="padding:4px 10px;border:1px solid #e2e8f0;background:#f8fafc;text-align:left;color:#475569;">Pas</th>
          </tr>
          ${changeRows}
        </table>` : ""}
        ${it.note ? `<div style="font-size:12px;color:#475569;margin-top:8px;"><b>Shënim:</b> ${escFcHtml(it.note)}</div>` : ""}
      </div>`;
    }).join("");

    const first = items[0];
    const firstFlight = byId.get(first.flightId);
    const subject = items.length === 1
      ? `✈️ Ndryshim fluturimi${firstFlight ? `: ${(firstFlight.flightNumber || "").trim()} ${firstFlight.fromCity} → ${firstFlight.toCity} ${fmtFcDate(firstFlight.departureDate)}` : ` #${first.flightId}`} — ${FLIGHT_SOURCE_LABELS_SQ[first.source] || first.source}`
      : `✈️ ${items.length} ndryshime fluturimesh — Albania Sky`;

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#f1f5f9;padding:18px;border-radius:12px;">
      <h2 style="font-size:16px;color:#0f172a;margin:0 0 12px;">✈️ Ndryshime fluturimesh (${items.length})</h2>
      ${blocks}
      ${hiddenCount > 0 ? `<div style="font-size:13px;font-weight:600;color:#475569;margin:4px 0 8px;">… dhe ${hiddenCount} ndryshime të tjera (shih "Historikun" e fluturimeve në sistem).</div>` : ""}
      <div style="font-size:11px;color:#94a3b8;margin-top:6px;">Ky njoftim u gjenerua automatikisht nga sistemi për çdo ndryshim fluturimi.</div>
    </div>`;

    await sendEmail(notifyTo, subject, html);
  } catch (err) {
    logger.error({ err }, "Deshtoi dergimi i email-it te ndryshimit te fluturimit");
  }
}

// Regjistron një ngjarje në historikun e ndryshimeve. Kur jepen before/after,
// diff-on fushat e gjurmuara; pa asnjë fushë të ndryshuar dhe pa note → no-op.
// `after` mund të jetë i pjesshëm (vetëm fushat e prekura). Fire-and-forget.
export async function recordFlightChange(opts: {
  req: any; flightId: number; source: string; note?: string | null;
  before?: Record<string, unknown> | null; after?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { req, flightId, source, note, before, after } = opts;
    const changes: { field: string; old: string | null; new: string | null }[] = [];
    if (before && after) {
      for (const f of FLIGHT_CHANGE_FIELDS) {
        if (!(f in after)) continue;
        const o = normFlightChangeVal(f, (before as any)[f]);
        const n = normFlightChangeVal(f, (after as any)[f]);
        if (o !== n) changes.push({ field: f, old: o, new: n });
      }
      if (!changes.length && !note) return;
    }
    await db.insert(flightChangeHistoryTable).values({
      flightId, source, changes, note: note ?? null,
      userId: req?.session?.userId ?? null,
      userName: req?.session?.userName ?? "Sistemi",
      userRole: req?.session?.role ?? null,
    });
    // Njofto edhe me email (grumbullohet 60s → një email i vetëm).
    queueFlightChangeEmail({
      flightId, source, changes, note: note ?? null,
      userName: req?.session?.userName ?? "Sistemi",
      at: new Date(),
    });
  } catch (err) {
    opts.req?.log?.error?.({ err }, "Failed to record flight change history");
  }
}

// Kontroll leje për veprime mbi fluturime (dublikim/fshirje): admin kalon
// gjithmonë; manager/agent_staff vetëm nëse leja efektive është e ndezur.
async function checkFlightActionPerm(req: any, res: any, permKey: string): Promise<boolean> {
  const role = req.session?.role;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (role === "admin") return true;
  if (!["manager", "agent_staff"].includes(role || "")) {
    res.status(403).json({ error: "Nuk keni leje për këtë veprim" }); return false;
  }
  const { getEffectivePermissions } = await import("./permissions");
  const perms = await getEffectivePermissions(role, userId);
  if (!perms[permKey]) {
    res.status(403).json({ error: "Nuk keni leje për këtë veprim" }); return false;
  }
  return true;
}

router.get("/flights/:id/activity-history", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.session.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = Number(req.params.id), offset = Number(req.query.offset ?? 0);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(offset) || offset < 0) {
    res.status(400).json({ error: "Invalid parameters" }); return;
  }
  const { readFlightActivity } = await import("../lib/flightActivityHistory.js");
  res.json(await readFlightActivity(id, offset));
});

router.get("/flights/:id/change-history", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(flightChangeHistoryTable)
    .where(eq(flightChangeHistoryTable.flightId, id))
    .orderBy(desc(flightChangeHistoryTable.createdAt), desc(flightChangeHistoryTable.id));
  res.json(rows.map(r => ({
    id: r.id,
    source: r.source,
    changes: r.changes ?? [],
    note: r.note,
    userName: r.userName,
    userRole: r.userRole,
    createdAt: r.createdAt,
  })));
});

router.get("/flights/:id/price-history", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(flightPriceHistoryTable)
    .where(eq(flightPriceHistoryTable.flightId, id))
    .orderBy(desc(flightPriceHistoryTable.createdAt));
  res.json(rows.map(r => ({
    id: r.id,
    oldAdultPrice: r.oldAdultPrice != null ? Number(r.oldAdultPrice) : null,
    newAdultPrice: Number(r.newAdultPrice),
    googlePrice: r.googlePrice != null ? Number(r.googlePrice) : null,
    userName: r.userName,
    userRole: r.userRole,
    createdAt: r.createdAt,
  })));
});

// Historiku i vendeve për një fluturim (Volumi i Biletave → Historiku).
router.get("/flights/:id/seat-history", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(flightSeatHistoryTable)
    .where(eq(flightSeatHistoryTable.flightId, id))
    .orderBy(desc(flightSeatHistoryTable.createdAt), desc(flightSeatHistoryTable.id));
  res.json(rows.map(r => ({
    id: r.id,
    eventType: r.eventType,
    seats: r.seats,
    oldTotal: r.oldTotal,
    totalSeats: r.totalSeats,
    soldSeats: r.soldSeats,
    userName: r.userName,
    userRole: r.userRole,
    note: r.note,
    createdAt: r.createdAt,
  })));
});

// ── Google price refresh interval (TTL) setting ─────────────────────────────
// GET is readable by any logged-in user so the flights list respects the TTL.
router.get("/settings/google-price-ttl", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const hours = await getGooglePriceTtlHours();
  res.json({ hours, schedule: await readGoogleRefreshSchedule() });
});

router.put("/settings/google-price-ttl", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    const role = req.session?.role || "";
    const userId = req.session?.userId;
    if (!userId || !["manager", "agent_staff"].includes(role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { getEffectivePermissions } = await import("./permissions");
    const perms = await getEffectivePermissions(role, userId);
    if (!perms["can_use_google_price_tools"]) {
      res.status(403).json({ error: "Nuk keni leje për këtë veprim" }); return;
    }
  }
  if (req.body?.dailyTime !== undefined) {
    if (!isRefreshTime(req.body.dailyTime)) {
      res.status(400).json({ error: "Ora duhet të jetë në formatin HH:mm" }); return;
    }
    const schedule = await saveGoogleRefreshTime(req.body.dailyTime);
    res.json({ schedule }); return;
  }
  const hours = parseFloat(req.body?.hours ?? "");
  if (isNaN(hours) || hours < 0.25) { res.status(400).json({ error: "Vlera e pavlefshme (minimumi 0.25 orë)" }); return; }
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, GOOGLE_PRICE_TTL_SETTING_KEY));
  if (existing.length) {
    await db.update(settingsTable).set({ value: String(hours), updatedAt: new Date() }).where(eq(settingsTable.key, GOOGLE_PRICE_TTL_SETTING_KEY));
  } else {
    await db.insert(settingsTable).values({ key: GOOGLE_PRICE_TTL_SETTING_KEY, value: String(hours) });
  }
  cachedTtlHours = hours;
  cachedTtlAt = Date.now();
  // Interval changed → re-fetch any now-due Google prices and re-apply the price
  // rules immediately so rule-driven sale prices update directly under the new
  // interval, instead of waiting for the next warmer cycle.
  kickGooglePriceRefreshAndApply("Ndryshim intervali");
  res.json({ hours });
});

router.get("/settings/upcoming-days", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const days = await getUpcomingDays();
  res.json({ days });
});

router.put("/settings/upcoming-days", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const days = parseInt(req.body?.days ?? "", 10);
  if (isNaN(days) || days < 1) { res.status(400).json({ error: "Vlera e pavlefshme (minimumi 1 ditë)" }); return; }
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, UPCOMING_DAYS_SETTING_KEY));
  if (existing.length) {
    await db.update(settingsTable).set({ value: String(days), updatedAt: new Date() }).where(eq(settingsTable.key, UPCOMING_DAYS_SETTING_KEY));
  } else {
    await db.insert(settingsTable).values({ key: UPCOMING_DAYS_SETTING_KEY, value: String(days) });
  }
  cachedUpcomingDays = days;
  cachedUpcomingDaysAt = Date.now();
  res.json({ days });
});

// ── Default checked-baggage rule for new flights ─────────────────────────────
// Auto-fills "Bagazhi i Kontrolluar" in the flight-create form. Stored as JSON
// {count,kg,price} under one settings key; default 1 copë / 20 kg / 60 €.
const DEFAULT_BAGGAGE_SETTING_KEY = "default_baggage_rule";
const DEFAULT_BAGGAGE_FALLBACK = { count: 1, kg: 20, price: 60 };

export async function getDefaultBaggageRule(client: any = db): Promise<{ count: number; kg: number; price: number }> {
  const rows = await client.select().from(settingsTable).where(eq(settingsTable.key, DEFAULT_BAGGAGE_SETTING_KEY));
  if (!rows[0]?.value) return DEFAULT_BAGGAGE_FALLBACK;
  try {
    const parsed = JSON.parse(rows[0].value);
    return {
      count: Number.isInteger(parsed?.count) && parsed.count >= 0 ? parsed.count : DEFAULT_BAGGAGE_FALLBACK.count,
      kg: Number.isFinite(Number(parsed?.kg)) && Number(parsed.kg) >= 0 ? Number(parsed.kg) : DEFAULT_BAGGAGE_FALLBACK.kg,
      price: Number.isFinite(Number(parsed?.price)) && Number(parsed.price) >= 0 ? Math.round(Number(parsed.price)) : DEFAULT_BAGGAGE_FALLBACK.price,
    };
  } catch {
    return DEFAULT_BAGGAGE_FALLBACK;
  }
}

router.get("/settings/default-baggage", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const value = await getDefaultBaggageRule();
  res.json(value);
});

router.put("/settings/default-baggage", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const count = Number(req.body?.count);
  const kg = Number(req.body?.kg);
  const price = Number(req.body?.price);
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(kg) || kg < 0 || !Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Vlera të pavlefshme (numra ≥ 0)." }); return;
  }
  const value = JSON.stringify({ count, kg, price: Math.round(price) });
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, DEFAULT_BAGGAGE_SETTING_KEY));
  if (existing.length) {
    await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, DEFAULT_BAGGAGE_SETTING_KEY));
  } else {
    await db.insert(settingsTable).values({ key: DEFAULT_BAGGAGE_SETTING_KEY, value });
  }
  res.json({ count, kg, price: Math.round(price) });
});

// Force-refresh: clear the in-memory Google price cache so the next request
// re-fetches live prices from Google for every row.
router.post("/flights/google-price/refresh", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    const role = req.session?.role || "";
    const userId = req.session?.userId;
    if (!userId || !["manager", "agent_staff"].includes(role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { getEffectivePermissions } = await import("./permissions");
    const perms = await getEffectivePermissions(role, userId);
    if (!perms["can_use_google_price_tools"]) {
      res.status(403).json({ error: "Nuk keni leje për këtë veprim" }); return;
    }
  }
  const count = googlePriceCache.size;
  googlePriceCache.clear();
  try {
    await db.delete(googlePriceCacheTable);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to clear google price cache in DB");
  }
  // Cache cleared → re-fetch fresh Google prices AND re-apply the price rules in
  // the background so rule-driven sale prices update directly (not just the
  // displayed Google value). Runs async so the request returns immediately.
  kickGooglePriceRefreshAndApply("Rifresko Tani");
  res.json({ cleared: true, count, reapplying: true });
});

// ── Bulk update seats ──────────────────────────────────────────────────────
router.patch("/flights/bulk-seats", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const { ids, availableSeats, totalSeats } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    res.status(400).json({ error: "ids të vlefshme nevojiten" }); return;
  }
  const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  // Snapshot i totaleve para ndryshimit — për historikun e vendeve.
  const beforeRows = await db.select({ id: flightsTable.id, totalSeats: flightsTable.totalSeats })
    .from(flightsTable).where(inArray(flightsTable.id, numIds));
  const beforeTotals = new Map(beforeRows.map(r => [r.id, r.totalSeats]));
  const recordBulkSeatChanges = async () => {
    const afterRows = await db.select({ id: flightsTable.id, totalSeats: flightsTable.totalSeats })
      .from(flightsTable).where(inArray(flightsTable.id, numIds));
    for (const r of afterRows) {
      const oldT = beforeTotals.get(r.id);
      if (oldT != null && oldT !== r.totalSeats) {
        void recordSeatEvent({
          flightId: r.id, type: "total_changed",
          seats: r.totalSeats, oldTotal: oldT, req, note: "Ndryshim masiv vendesh",
        });
        void recordFlightChange({
          req, flightId: r.id, source: "bulk", note: "Ndryshim masiv vendesh",
          before: { totalSeats: oldT }, after: { totalSeats: r.totalSeats },
        });
      }
    }
  };
  // Preferred path: set the AVAILABLE (free) seats. Available = totalSeats - soldSeats,
  // so to make available == N for each flight we set totalSeats = soldSeats + N
  // (soldSeats differs per flight, hence the SQL expression).
  if (typeof availableSeats === "number" && availableSeats >= 0) {
    await db.update(flightsTable)
      .set({ totalSeats: sql`${flightsTable.soldSeats} + ${availableSeats}` })
      .where(inArray(flightsTable.id, numIds));
    await recordBulkSeatChanges();
    // Setting available seats to 0 (or below sold) flips full open flights to sold-out.
    await flipSoldOutIfFullBulk(numIds);
    // Adding seats may resolve an oversell — clear the MBISHITJE markers.
    await clearOversellIfResolvedBulk(numIds);
    scheduleGSheetsSync();
    res.json({ updated: numIds.length }); return;
  }
  // Backward-compat: older clients send totalSeats directly.
  if (typeof totalSeats === "number" && totalSeats >= 0) {
    await db.update(flightsTable).set({ totalSeats }).where(inArray(flightsTable.id, numIds));
    await recordBulkSeatChanges();
    await flipSoldOutIfFullBulk(numIds);
    await clearOversellIfResolvedBulk(numIds);
    scheduleGSheetsSync();
    res.json({ updated: numIds.length }); return;
  }
  res.status(400).json({ error: "availableSeats e vlefshme nevojitet" });
});

router.patch("/flights/bulk-price", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const { ids, adultPrice, childPrice, infantPrice, checkedBaggagePrice, checkedBaggageKg } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    res.status(400).json({ error: "ids nevojiten" }); return;
  }

  const updates: Record<string, string> = {};
  const parseOpt = (v: any): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = parseFloat(v);
    return isNaN(n) || n < 0 ? undefined : n;
  };
  const aP = parseOpt(adultPrice);
  const cP = parseOpt(childPrice);
  const iP = parseOpt(infantPrice);
  const bP = parseOpt(checkedBaggagePrice);
  const bKg = checkedBaggageKg === undefined || checkedBaggageKg === null || checkedBaggageKg === ""
    ? undefined : Number(checkedBaggageKg);

  if (aP !== undefined) {
    updates.adultPrice = String(roundWholeEuro(aP));
    // Backward compat: if child not specified separately, mirror adult
    if (cP === undefined) updates.childPrice = String(roundWholeEuro(aP));
  }
  if (cP !== undefined) updates.childPrice = String(roundWholeEuro(cP));
  if (iP !== undefined) updates.infantPrice = String(roundWholeEuro(iP));
  if (bP !== undefined) updates.checkedBaggagePrice = String(roundWholeEuro(bP));
  if (bKg !== undefined && Number.isFinite(bKg) && bKg >= 0) updates.checkedBaggageKg = bKg.toString();
  const setsBaggage = bP !== undefined || bKg !== undefined;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Të paktën një çmim duhet të jepet" }); return;
  }

  const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  // Capture old values before the update — for the price history AND the
  // detailed change history (all updated fields, old → new).
  const oldFlights = await db.select().from(flightsTable).where(inArray(flightsTable.id, numIds));
  await db.update(flightsTable)
    .set({
      ...updates,
      // Setting baggage data implies "1 bag" so it renders as e.g. "1×20kg €40",
      // but never clobber a flight that intentionally has 2+ bags.
      ...(setsBaggage
        ? { checkedBaggageCount: sql`GREATEST(COALESCE(${flightsTable.checkedBaggageCount}, 0), 1)` }
        : {}),
    })
    .where(inArray(flightsTable.id, numIds));
  if (updates.adultPrice !== undefined && oldFlights.length) {
    const newP = Number(updates.adultPrice);
    const histRows = oldFlights
      .filter(f => Number(f.adultPrice) !== newP)
      .map(f => ({
        flightId: f.id,
        oldAdultPrice: f.adultPrice != null ? Number(f.adultPrice).toString() : null,
        newAdultPrice: newP.toString(),
        googlePrice: (() => { const g = snapshotGooglePriceForFlight(f); return g != null ? g.toString() : null; })(),
        userId: (req as any).session?.userId ?? null,
        userName: (req as any).session?.userName ?? "Staff",
        userRole: (req as any).session?.role ?? null,
      }));
    if (histRows.length) {
      try { await db.insert(flightPriceHistoryTable).values(histRows); }
      catch (err) { (req as any).log?.error?.({ err }, "Failed to record bulk flight price history"); }
    }
  }
  // Historiku i detajuar: diff-o vetëm fushat e dërguara (updates është i pjesshëm).
  for (const f of oldFlights) {
    void recordFlightChange({ req, flightId: f.id, source: "bulk", before: f, after: updates });
  }
  scheduleGSheetsSync();
  res.json({ updated: numIds.length, fields: Object.keys(updates) });
});

// ── Bulk status ────────────────────────────────────────────────────────────
router.patch("/flights/bulk-status", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const { ids, status } = req.body;
  const validStatuses = ["open", "closed", "soldout", "cancelled"];
  if (!Array.isArray(ids) || !ids.length || !validStatuses.includes(status)) {
    res.status(400).json({ error: "ids dhe status të vlefshme nevojiten" }); return;
  }
  const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  const beforeStatuses = await db.select({ id: flightsTable.id, status: flightsTable.status })
    .from(flightsTable).where(inArray(flightsTable.id, numIds));
  await db.update(flightsTable).set({ status }).where(inArray(flightsTable.id, numIds));
  for (const r of beforeStatuses) {
    if (r.status !== status) {
      void recordFlightChange({
        req, flightId: r.id, source: "bulk", note: "Ndryshim masiv statusi",
        before: { status: r.status }, after: { status },
      });
    }
  }
  scheduleGSheetsSync();
  triggerCpExportSoon();
  void scheduleNextAutoSoldOut();
  res.json({ updated: numIds.length });
});

// ── Bulk: block/unblock EXTERNAL sales (booking-engine, partner API, CP export) ─
// Internal (flight-system) bookings are NOT affected. Admin/Manager only.
router.patch("/flights/bulk-external-block", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const { ids, blocked } = req.body as { ids: number[]; blocked: boolean };
  if (!Array.isArray(ids) || !ids.length || typeof blocked !== "boolean") {
    res.status(400).json({ error: "ids dhe blocked (true/false) nevojiten" }); return;
  }
  const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (!numIds.length) { res.status(400).json({ error: "ids të pavlefshme" }); return; }
  const beforeRows = await db.select({ id: flightsTable.id, blocked: flightsTable.externalSalesBlocked })
    .from(flightsTable).where(inArray(flightsTable.id, numIds));
  await db.update(flightsTable).set({ externalSalesBlocked: blocked }).where(inArray(flightsTable.id, numIds));
  for (const r of beforeRows) {
    if (r.blocked !== blocked) {
      void recordFlightChange({
        req, flightId: r.id, source: "bulk",
        note: blocked ? "Bllokim i shitjeve të jashtme (faqja publike, API partnerësh, CitizenPlane)" : "Hapje e shitjeve të jashtme",
        before: { externalSalesBlocked: r.blocked }, after: { externalSalesBlocked: blocked },
      });
    }
  }
  // Blocking lowers the seats CitizenPlane sees → refresh the CP export promptly.
  triggerCpExportSoon();
  res.json({ updated: beforeRows.filter(r => r.blocked !== blocked).length });
});

// ── Bulk: fshih/shfaq në Booking Engine (dukshmëria publike) — vetëm admin ─
// Njësoj si PATCH /booking-engine/flights/:id/visibility, por për shumë fluturime.
router.patch("/flights/bulk-be-visibility", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori" }); return;
  }
  const { ids, show } = req.body as { ids: number[]; show: boolean };
  if (!Array.isArray(ids) || !ids.length || typeof show !== "boolean") {
    res.status(400).json({ error: "ids dhe show (true/false) nevojiten" }); return;
  }
  const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (!numIds.length) { res.status(400).json({ error: "ids të pavlefshme" }); return; }
  const beforeRows = await db.select({ id: flightsTable.id, show: flightsTable.showInBookingEngine })
    .from(flightsTable).where(inArray(flightsTable.id, numIds));
  await db.update(flightsTable).set({ showInBookingEngine: show }).where(inArray(flightsTable.id, numIds));
  for (const r of beforeRows) {
    if (r.show !== show) {
      void recordFlightChange({
        req, flightId: r.id, source: "bulk",
        note: show ? "Shfaqje në Booking Engine (faqja publike)" : "Fshehje nga Booking Engine (e shohin vetëm agjentët me akses)",
        before: { showInBookingEngine: r.show }, after: { showInBookingEngine: show },
      });
    }
  }
  res.json({ updated: beforeRows.filter(r => r.show !== show).length });
});

// ── Report data: return full details for a list of flight IDs (admin only) ─
router.post("/flights/report-data", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm administratori mund të gjenerojë raporte" }); return;
  }
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids nevojiten" }); return;
  }
  const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (!numIds.length) { res.json([]); return; }
  const flights = await db.select().from(flightsTable).where(inArray(flightsTable.id, numIds));
  const salesSummaryMap = await getFlightSalesSummaryMap(numIds);

  // Build cache keys and fetch Google prices from persistent cache
  const cacheKeys = flights.map(f =>
    `${f.fromCity.toUpperCase()}|${f.toCity.toUpperCase()}|${f.departureDate}|${normFlightNum(String(f.flightNumber))}`
  );
  const gRows = cacheKeys.length
    ? await db.select().from(googlePriceCacheTable).where(inArray(googlePriceCacheTable.cacheKey, cacheKeys))
    : [];
  const gMap = new Map(gRows.map(r => [r.cacheKey, googlePriceResponse(r).price]));

  const payload = flights.map((f, i) => ({
    id: f.id,
    airline: f.airline,
    flightNumber: f.flightNumber,
    fromCity: f.fromCity,
    toCity: f.toCity,
    departureDate: f.departureDate,
    departureTime: f.departureTime,
    arrivalTime: f.arrivalTime,
    adultPrice: Number(f.adultPrice),
    childPrice: Number(f.childPrice),
    infantPrice: Number(f.infantPrice),
    totalSeats: f.totalSeats,
    soldSeats: f.soldSeats,
    availableSeats: f.totalSeats - f.soldSeats,
    status: f.status,
    salesOpen: (f as any).salesOpen,
    checkedBaggagePrice: f.checkedBaggagePrice != null ? Number(f.checkedBaggagePrice) : null,
    checkedBaggageKg: f.checkedBaggageKg != null ? Number(f.checkedBaggageKg) : null,
    googlePrice: gMap.get(cacheKeys[i]) ?? null,
    ...(salesSummaryMap.get(f.id) ?? formatFlightSalesSummary(undefined)),
  }));

  res.json(payload);

  // Send email notification asynchronously (fire-and-forget)
  const notifyTo = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  if (notifyTo) {
    (async () => {
      try {
        const { bookingUsersTable } = await import("@workspace/db");
        const [actor] = await db.select({ name: bookingUsersTable.name }).from(bookingUsersTable)
          .where(eq(bookingUsersTable.id, req.session!.userId!));
        const generatedBy = actor?.name || "Admin";
        const nowD = new Date();
        const now = `${nowD.toLocaleDateString("sq-AL", { dateStyle: "full" })}, ${nowD.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
        const statusLabel: Record<string, string> = { open: "I Hapur", closed: "I Mbyllur", soldout: "Plotë", cancelled: "Anuluar" };
        const statusColor: Record<string, string> = { open: "#16a34a", closed: "#dc2626", soldout: "#d97706", cancelled: "#6b7280" };

        const rows = [...payload]
          .sort((a, b) => new Date(`${a.departureDate}T${a.departureTime}`).getTime() - new Date(`${b.departureDate}T${b.departureTime}`).getTime())
          .map((f, idx) => `
            <tr style="background:${idx % 2 === 0 ? "#fff" : "#f8fafc"}">
              <td style="padding:8px 10px;white-space:nowrap">${f.fromCity} → ${f.toCity}</td>
              <td style="padding:8px 10px;white-space:nowrap">${f.departureDate} ${fmtAmPm(f.departureTime)}–${fmtAmPm(f.arrivalTime)}</td>
              <td style="padding:8px 10px;font-weight:600">${f.flightNumber}</td>
              <td style="padding:8px 10px;text-align:center">${f.totalSeats}</td>
              <td style="padding:8px 10px;text-align:center;color:#dc2626">${f.soldSeats}</td>
              <td style="padding:8px 10px;text-align:center;color:#16a34a;font-weight:600">${f.availableSeats}</td>
              <td style="padding:8px 10px;text-align:right">€${f.adultPrice}</td>
              <td style="padding:8px 10px;text-align:right">€${f.infantPrice}</td>
              <td style="padding:8px 10px;text-align:right">${f.checkedBaggagePrice != null ? `€${f.checkedBaggagePrice}${f.checkedBaggageKg ? ` / ${f.checkedBaggageKg}kg` : ""}` : "—"}</td>
              <td style="padding:8px 10px;text-align:right">${f.googlePrice != null ? `€${f.googlePrice}` : "—"}</td>
              <td style="padding:8px 10px;text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:${statusColor[f.status] || "#6b7280"}">${statusLabel[f.status] || f.status}</span></td>
            </tr>`).join("");

        const totalSeats = payload.reduce((s, f) => s + f.totalSeats, 0);
        const totalSold  = payload.reduce((s, f) => s + f.soldSeats, 0);
        const totalFree  = payload.reduce((s, f) => s + f.availableSeats, 0);

        const html = `<!DOCTYPE html><html lang="sq"><head><meta charset="UTF-8"/></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:24px">
<div style="max-width:900px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:12px;padding:20px 24px;margin-bottom:16px;color:#fff;display:flex;justify-content:space-between">
    <div>
      <div style="font-size:20px;font-weight:700">✈ Raport Fluturimesh</div>
      <div style="font-size:12px;opacity:.75;margin-top:3px">Kings Travel Flights — Flight Management System</div>
    </div>
    <div style="text-align:right;font-size:12px;opacity:.85">
      <div>Gjeneruar nga <strong>${generatedBy}</strong></div>
      <div style="margin-top:3px">${now}</div>
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:14px">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;flex:1;text-align:center"><div style="font-size:20px;font-weight:700;color:#1e3a5f">${payload.length}</div><div style="font-size:11px;color:#64748b">Fluturime</div></div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;flex:1;text-align:center"><div style="font-size:20px;font-weight:700;color:#1e3a5f">${totalSeats}</div><div style="font-size:11px;color:#64748b">Totale</div></div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;flex:1;text-align:center"><div style="font-size:20px;font-weight:700;color:#dc2626">${totalSold}</div><div style="font-size:11px;color:#64748b">Shitura</div></div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;flex:1;text-align:center"><div style="font-size:20px;font-weight:700;color:#16a34a">${totalFree}</div><div style="font-size:11px;color:#64748b">Të Lira</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;font-size:12.5px">
    <thead><tr style="background:#1e3a5f;color:#fff">
      <th style="padding:9px 10px;text-align:left;font-size:10.5px;text-transform:uppercase">Rruga</th>
      <th style="padding:9px 10px;text-align:left;font-size:10.5px;text-transform:uppercase">Data &amp; Ora</th>
      <th style="padding:9px 10px;text-align:left;font-size:10.5px;text-transform:uppercase">Fluturimi</th>
      <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase">Totale</th>
      <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase">Shitura</th>
      <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase">Të Lira</th>
      <th style="padding:9px 10px;text-align:right;font-size:10.5px;text-transform:uppercase">Adulte</th>
      <th style="padding:9px 10px;text-align:right;font-size:10.5px;text-transform:uppercase">Infant</th>
      <th style="padding:9px 10px;text-align:right;font-size:10.5px;text-transform:uppercase">Bag</th>
      <th style="padding:9px 10px;text-align:right;font-size:10.5px;text-transform:uppercase">Google</th>
      <th style="padding:9px 10px;text-align:center;font-size:10.5px;text-transform:uppercase">Statusi</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body></html>`;

        await sendEmail(notifyTo, `✈ Raport Fluturimesh — ${payload.length} fluturime (${generatedBy})`, html);
      } catch (err) {
        logger.error({ err }, "[report-email] failed to send report email");
      }
    })();
  }
});

// ── Sync schedule from Google Flights ─────────────────────────────────────
router.patch("/flights/:id/sync-schedule", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID i pavlefshëm" }); return; }
  const { departureDate, departureTime, arrivalDate, arrivalTime } = req.body;
  if (!departureDate || !departureTime || !arrivalDate || !arrivalTime) {
    res.status(400).json({ error: "Datat dhe orët e plota Google nevojiten. Kryeni kontrollin përsëri." }); return;
  }
  const [existing] = await db.select().from(flightsTable).where(eq(flightsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Fluturimi nuk u gjet" }); return; }
  if (existing.status === "soldout" || existing.status === "cancelled" || await googleMonitoringDisabled(id)) {
    res.status(409).json({ error: "Kontrolli Google nuk lejohet për këtë fluturim." }); return;
  }
  let applied;
  try {
    applied = await applyStoredGoogleScheduleSync(id, { departureDate, departureTime, arrivalDate, arrivalTime });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Orari Google nuk mund të aplikohet." }); return;
  }
  // Applying the Google schedule resolves the alert, so clear it immediately
  // (otherwise the badge lingers until the next warmer pass).
  const { updated } = applied;
  if (!updated) { res.status(404).json({ error: "Fluturimi nuk u gjet" }); return; }
  scheduleGSheetsSync();
  // Departure time moved — recompute the auto-soldout cutoff timer.
  void scheduleNextAutoSoldOut();
  // Schedule changed via Google sync — record it in "Fluturimet me Ndryshime Orari"
  // if the flight has active bookings (fire-and-forget).
  void recordScheduleChange(
    applied.before,
    updated,
    "sync",
  );
  void recordFlightChange({
    req, flightId: id, source: "sync-schedule", note: "Sinkronizim orari nga Google",
    before: applied.before, after: applied.schedule,
  });
  notifyDataChanged("flights");
  res.json({ ok: true, id: updated.id, ...applied.schedule });
});

// KUJDES: kjo rrugë me :id duhet të regjistrohet PAS çdo rruge statike
// /flights/... (p.sh. check-google-progress), përndryshe emri i rrugës statike
// kapet si "id" dhe kthen 400. Prandaj GET check-google-progress është këtu,
// PARA /flights/:id (gjendja googleCheckProgress deklarohet më poshtë; callback-u
// ekzekutohet vetëm në kohë kërkese, kur ajo është inicializuar).
router.get("/flights/check-google-progress", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(googleCheckProgress);
});

// Shabllon Excel-i për importin e fluturimeve — rrugë statike, duhet të rrijë
// PARA /flights/:id (ndryshe "template.xlsx" kapet si :id dhe kthen 400).
router.get("/flights/template.xlsx", async (_req, res): Promise<void> => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Flights Template");

  ws.columns = [
    { header: "Airline",         key: "airline",     width: 14 },
    { header: "Flight Number",   key: "flightNum",   width: 14 },
    { header: "From City",       key: "fromCity",    width: 10 },
    { header: "To City",         key: "toCity",      width: 10 },
    { header: "Departure Date",  key: "depDate",     width: 16 },
    { header: "Departure Time",  key: "depTime",     width: 14 },
    { header: "Arrival Date",    key: "arrDate",     width: 14 },
    { header: "Arrival Time",    key: "arrTime",     width: 12 },
    { header: "Adult Price",     key: "adultPrice",  width: 12 },
    { header: "Infant Price",    key: "infantPrice", width: 12 },
    { header: "Tax",             key: "tax",         width: 8  },
    { header: "Total Seats",     key: "seats",       width: 12 },
    { header: "Status",          key: "status",      width: 10 },
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // Sample rows
  ws.addRow(["WIZZ AIR", "W45047", "TIA", "BLQ", "15-08-2026", "06:00", "15-08-2026", "07:45", 130, 35, 0, 180, "open"]);
  ws.addRow(["WIZZ AIR", "W45048", "TIA", "BLQ", "16-08-2026", "06:00", "16-08-2026", "07:45", 130, 35, 0, 180, "open"]);

  // Light blue tint on sample rows
  [2, 3].forEach(r => {
    ws.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  });

  const buf = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="flights_template.xlsx"');
  res.send(buf);
});

router.get("/flights/:id", async (req, res): Promise<void> => {
  const params = GetFlightParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, params.data.id));
  if (!flight) {
    res.status(404).json({ error: "Flight not found" });
    return;
  }

  res.json({ ...formatFlight(flight, req.session?.role === "admin"),
    flightDiscount: await readFlightDiscount(flight.id),
    ...(req.session?.role === "admin" ? { manualFlightDiscount: (await readManualFlightDiscounts([flight.id])).get(flight.id) ?? null } : {}),
    googleMonitoringDisabled: await googleMonitoringDisabled(flight.id) });
});

router.patch("/flights/:id/google-monitoring", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admini" }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof req.body?.disabled !== "boolean") {
    res.status(400).json({ error: "Fluturimi ose vlera është e pavlefshme" }); return;
  }
  if (!await saveGoogleMonitoringDisabled(id, req.body.disabled)) {
    res.status(404).json({ error: "Fluturimi nuk u gjet" }); return;
  }
  flightsGlobalTabsCache.clear();
  notifyDataChanged("flights");
  res.json({ googleMonitoringDisabled: req.body.disabled });
});

router.patch("/flights/:id", async (req, res): Promise<void> => {
  const params = UpdateFlightParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateFlightBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(flightsTable).where(eq(flightsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Flight not found" });
    return;
  }

  // confirmDateChange është vetëm flamur konfirmimi — nuk ruhet në DB.
  const { confirmDateChange, ...updateData } = parsed.data;
  // Kolona e vjetër flights.notes u zëvendësua nga chat-i flight_notes (23.08.2026) —
  // hidhet çdo vlerë e dërguar që kolona të mbetet gjithmonë NULL.
  delete (updateData as Record<string, unknown>).notes;
  Object.assign(updateData, normalizeFlightIdentifierPatch(updateData));
  Object.assign(updateData, normalizeMonetaryFields(updateData as Record<string, any>));

  // Çmimi neto informativ (jashtë zod-it të gjeneruar) — vetëm admin mund ta ndryshojë.
  {
    const netPriceRaw = (req.body as Record<string, unknown>)?.netPrice;
    if (req.session?.role === "admin" && netPriceRaw !== undefined) {
      const n = netPriceRaw === null || netPriceRaw === "" ? null : Number(netPriceRaw);
      if (n === null || (Number.isFinite(n) && n >= 0)) (updateData as Record<string, unknown>).netPrice = n === null ? null : String(n);
    }
  }

  // Normalize after all request-body augmentations (including admin-only netPrice).
  Object.assign(updateData, normalizeMonetaryFields(updateData as Record<string, any>));

  // Dukshmëria në Booking Engine (jashtë zod-it të gjeneruar) — vetëm admin,
  // njësoj si PATCH /booking-engine/flights/:id/visibility (settings).
  {
    const raw = (req.body as Record<string, unknown>)?.showInBookingEngine;
    if (req.session?.role === "admin" && typeof raw === "boolean") {
      (updateData as Record<string, unknown>).showInBookingEngine = raw;
    }
  }

  // Bllokimi i shitjeve të jashtme lejohet vetëm nga admin/menaxher —
  // gardhi bëhet në server, jo vetëm në UI.
  if (
    updateData.externalSalesBlocked !== undefined &&
    req.session?.role !== "admin" &&
    req.session?.role !== "manager"
  ) {
    delete (updateData as Record<string, unknown>).externalSalesBlocked;
  }

  // ── Mbrojtje: ndryshimi i datës së nisjes zhvendos TË GJITHA rezervimet
  // (të çdo burimi — manuale, agjentë, CP) bashkë me fluturimin. Pa konfirmim
  // eksplicit kthejmë 409, që frontend-i të shfaqë dialogun e konfirmimit.
  // (sync-schedule është rrugë më vete dhe s'preket nga kjo.)
  if (
    updateData.departureDate !== undefined &&
    updateData.departureDate !== existing.departureDate &&
    confirmDateChange !== true
  ) {
    const [impact] = await db
      .select({
        bookings: sql<number>`COUNT(DISTINCT ${bookingsTable.id})::int`,
        passengers: sql<number>`COUNT(${passengersTable.id}) FILTER (WHERE NOT ${passengersTable.cancelled})::int`,
      })
      .from(bookingsTable)
      .leftJoin(passengersTable, eq(passengersTable.bookingId, bookingsTable.id))
      .where(and(eq(bookingsTable.flightId, existing.id), sql`${bookingsTable.status} <> 'cancelled'`));
    if (impact && impact.bookings > 0) {
      res.status(409).json({
        error: `Fluturimi ka ${impact.bookings} ${impact.bookings === 1 ? "rezervim aktiv" : "rezervime aktive"} me ${impact.passengers} pasagjerë. Ndryshimi i datës i zhvendos të gjithë bashkë me fluturimin — kërkohet konfirmim.`,
        code: "DATE_CHANGE_NEEDS_CONFIRM",
        bookings: impact.bookings,
        passengers: impact.passengers,
        oldDate: existing.departureDate,
        newDate: updateData.departureDate,
      });
      return;
    }
  }

  Object.assign(updateData, normalizeMonetaryFields(updateData as Record<string, any>));
  const merged = { ...existing, ...updateData };
  const arrivalDate = scheduleFieldsTouched(updateData as Record<string, unknown>)
    ? normalizeArrivalDate(merged) : undefined;
  const aiConfirmationOnly =
    Boolean(req.headers["x-ai-action"]) &&
    Object.keys(updateData).length === 1 &&
    typeof (updateData as Record<string, unknown>).isConfirmed === "boolean";
  const aiExpectedConfirmedRaw =
    req.headers["x-ai-action"] &&
    typeof req.headers["x-ai-expected-confirmed"] === "string"
      ? req.headers["x-ai-expected-confirmed"]
      : null;
  const aiExpectedConfirmed =
    aiExpectedConfirmedRaw === "true"
      ? true
      : aiExpectedConfirmedRaw === "false"
        ? false
        : null;
  const [flight] = await db
    .update(flightsTable)
    .set(
      (aiConfirmationOnly
        ? { isConfirmed: updateData.isConfirmed }
        : { ...updateData, ...(arrivalDate ? { arrivalDate } : {}) }) as any,
    )
    .where(
      aiExpectedConfirmed === null
        ? eq(flightsTable.id, params.data.id)
        : and(
            eq(flightsTable.id, params.data.id),
            eq(flightsTable.isConfirmed, aiExpectedConfirmed),
          ),
    )
    .returning();

  if (!flight) {
    res.status(aiExpectedConfirmed === null ? 404 : 409).json({
      error:
        aiExpectedConfirmed === null
          ? "Flight not found"
          : "Fluturimi ndryshoi pas krijimit të propozimit.",
    });
    return;
  }

  await recordFlightPriceChange(req, existing, flight);

  // Historiku i vendeve: regjistro kur ndryshon numri total i vendeve.
  if (flight.totalSeats !== existing.totalSeats) {
    void recordSeatEvent({
      flightId: flight.id, type: "total_changed",
      seats: flight.totalSeats, oldTotal: existing.totalSeats, req,
    });
  }

  // Manually editing seats down to 0 available (totalSeats <= soldSeats) must
  // flip an open flight to sold-out, same as selling the last seat.
  const wentSoldOut = await flipSoldOutIfFull(flight.id);
  if (wentSoldOut) flight.status = "soldout";

  // Adding seats may resolve an oversell — clear the MBISHITJE markers from
  // this flight's bookings once soldSeats fits inside totalSeats again.
  if (flight.totalSeats > existing.totalSeats) {
    await clearOversellIfResolved(flight.id);
  }

  scheduleGSheetsSync();
  // A status change adds/removes the flight from the CitizenPlane export set —
  // sync immediately instead of waiting for the 30-min interval.
  if (
    existing.status !== flight.status ||
    existing.externalSalesBlocked !== flight.externalSalesBlocked
  ) triggerCpExportSoon();
  // Departure/status may have changed — recompute the auto-soldout cutoff timer.
  void scheduleNextAutoSoldOut();
  // Manual schedule edit — record it in "Fluturimet me Ndryshime Orari" if the
  // flight has active bookings (fire-and-forget).
  void recordScheduleChange(existing, flight, "manual");
  // Historiku i detajuar i ndryshimeve — çdo fushë e ndryshuar old → new.
  void recordFlightChange({ req, flightId: flight.id, source: "edit", before: existing, after: flight });
  res.json(formatFlight(flight, req.session?.role === "admin"));
});

router.delete("/flights/:id", async (req, res): Promise<void> => {
  if (!(await checkFlightActionPerm(req, res, "can_delete_flights"))) return;
  const params = DeleteFlightParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [toDelete] = await db.select().from(flightsTable).where(eq(flightsTable.id, params.data.id));
  const [bk] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where status != 'cancelled')::int`,
  }).from(bookingsTable).where(eq(bookingsTable.flightId, params.data.id));
  const [tk] = await db.select({
    total: sql<number>`count(*)::int`,
  }).from(tasksTable).where(and(eq(tasksTable.entityType, "flight"), eq(tasksTable.entityId, params.data.id)));
  const [defaultRule] = await db.select({ id: agentFlightDefaultRulesTable.id })
    .from(agentFlightDefaultRulesTable).where(eq(agentFlightDefaultRulesTable.flightId, params.data.id));
  if ((bk && bk.total > 0) || (tk && tk.total > 0) || defaultRule) {
    const arsye: string[] = [];
    if (bk && bk.active > 0) arsye.push(`${bk.active} rezervime aktive`);
    if (bk && bk.total > bk.active) arsye.push(`${bk.total - bk.active} rezervime të anuluara`);
    if (tk && tk.total > 0) arsye.push(`${tk.total} taska`);
    if (defaultRule) arsye.push("një rregull default të agjencive");
    res.status(409).json({ error: `Fluturimi nuk mund të fshihet: ka ${arsye.join(", ")} të lidhura me të.` });
    return;
  }
  try {
    // Atomike: mos fshi nëse ndërkohë u shtua rezervim, task apo rregull default.
    const deletedRows = await db.delete(flightsTable)
      .where(and(
        eq(flightsTable.id, params.data.id),
        sql`NOT EXISTS (SELECT 1 FROM ${bookingsTable} WHERE ${bookingsTable.flightId} = ${flightsTable.id})`,
        sql`NOT EXISTS (SELECT 1 FROM ${tasksTable} WHERE ${tasksTable.entityType} = 'flight' AND ${tasksTable.entityId} = ${flightsTable.id})`,
        sql`NOT EXISTS (SELECT 1 FROM ${agentFlightDefaultRulesTable} WHERE ${agentFlightDefaultRulesTable.flightId} = ${flightsTable.id})`,
      ))
      .returning({ id: flightsTable.id });
    if (deletedRows.length === 0) {
      res.status(409).json({ error: "Fluturimi nuk mund të fshihet: ka një rezervim, task ose rregull default të lidhur. Rifreskoni faqen." });
      return;
    }
  } catch (err: any) {
    if (err?.code === "23503" || err?.cause?.code === "23503") {
      res.status(409).json({ error: "Fluturimi nuk mund të fshihet: ka rezervime ose rregulla default të lidhura me të." });
      return;
    }
    throw err;
  }
  scheduleGSheetsSync();
  triggerCpExportSoon();
  if (toDelete) {
    queueFlightChangeEmail({
      flightId: toDelete.id, source: "delete", changes: [],
      note: "Fluturimi u fshi nga sistemi.",
      userName: (req.session as any)?.userName ?? "Sistemi", at: new Date(),
      headOverride: `${(toDelete.flightNumber || "").trim()} · ${toDelete.fromCity} → ${toDelete.toCity} · ${fmtFcDate(toDelete.departureDate)} · Kodi #${toDelete.id} (U FSHI)`,
    });
  }
  res.sendStatus(204);
});

// ── Bulk delete ────────────────────────────────────────────────────────────
router.delete("/flights", async (req, res): Promise<void> => {
  if (!(await checkFlightActionPerm(req, res, "can_delete_flights"))) return;
  const ids: number[] = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids e nevojshme" }); return;
  }
  const numIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (!numIds.length) { res.status(400).json({ error: "ids invalid" }); return; }
  const allRows = await db.select().from(flightsTable).where(inArray(flightsTable.id, numIds));

  // Fluturimet me rezervime (edhe të anuluara) nuk mund të fshihen — FK në DB.
  const bkCounts = await db.select({
    flightId: bookingsTable.flightId,
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where ${bookingsTable.status} != 'cancelled')::int`,
  }).from(bookingsTable)
    .where(inArray(bookingsTable.flightId, numIds))
    .groupBy(bookingsTable.flightId);
  const bkMap = new Map(bkCounts.map(b => [b.flightId, b]));

  // Edhe taskat e lidhura me fluturimin e bllokojnë fshirjen.
  const tkCounts = await db.select({
    flightId: tasksTable.entityId,
    total: sql<number>`count(*)::int`,
  }).from(tasksTable)
    .where(and(eq(tasksTable.entityType, "flight"), inArray(tasksTable.entityId, numIds)))
    .groupBy(tasksTable.entityId);
  const tkMap = new Map(tkCounts.map(t => [t.flightId, t.total]));

  const candidateRows = allRows.filter(f => !bkMap.has(f.id) && !tkMap.has(f.id));

  // Atomike: fshin vetëm ato që ende s'kanë asnjë rezervim (mbyll dritaren e garës).
  let deletedIds = new Set<number>();
  if (candidateRows.length > 0) {
    try {
      const deletedRows = await db.delete(flightsTable)
        .where(and(
          inArray(flightsTable.id, candidateRows.map(f => f.id)),
          sql`NOT EXISTS (SELECT 1 FROM ${bookingsTable} WHERE ${bookingsTable.flightId} = ${flightsTable.id})`,
          sql`NOT EXISTS (SELECT 1 FROM ${tasksTable} WHERE ${tasksTable.entityType} = 'flight' AND ${tasksTable.entityId} = ${flightsTable.id})`,
        ))
        .returning({ id: flightsTable.id });
      deletedIds = new Set(deletedRows.map(r => r.id));
    } catch (err: any) {
      if (!(err?.code === "23503" || err?.cause?.code === "23503")) throw err;
      // FK në garë ekstreme — asgjë s'u fshi; të gjitha raportohen si të bllokuara më poshtë.
    }
    if (deletedIds.size > 0) {
      scheduleGSheetsSync();
      triggerCpExportSoon();
    }
  }

  const toDeleteRows = candidateRows.filter(f => deletedIds.has(f.id));
  const blockedRows  = allRows.filter(f => !deletedIds.has(f.id));

  const blocked = blockedRows.map(f => {
    const b = bkMap.get(f.id);
    const t = tkMap.get(f.id) ?? 0;
    const arsye: string[] = [];
    if (b && b.active > 0) arsye.push(`${b.active} rezervime aktive`);
    if (b && b.total > b.active) arsye.push(`${b.total - b.active} rezervime të anuluara`);
    if (t > 0) arsye.push(`${t} taska`);
    if (arsye.length === 0) arsye.push("sapo iu shtua një rezervim/task");
    return {
      id: f.id,
      label: `${(f.flightNumber || "").trim()} ${f.fromCity} → ${f.toCity} ${fmtFcDate(f.departureDate)} (#${f.id})`,
      reason: `ka ${arsye.join(", ")}`,
    };
  });
  for (const f of toDeleteRows) {
    queueFlightChangeEmail({
      flightId: f.id, source: "delete", changes: [],
      note: "Fluturimi u fshi nga sistemi (fshirje masive).",
      userName: (req.session as any)?.userName ?? "Sistemi", at: new Date(),
      headOverride: `${(f.flightNumber || "").trim()} · ${f.fromCity} → ${f.toCity} · ${fmtFcDate(f.departureDate)} · Kodi #${f.id} (U FSHI)`,
    });
  }
  res.json({ deleted: toDeleteRows.length, blocked });
});

router.post("/flights/:id/duplicate", async (req, res): Promise<void> => {
  if (!(await checkFlightActionPerm(req, res, "can_duplicate_flights"))) return;
  const params = DuplicateFlightParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [original] = await db.select().from(flightsTable).where(eq(flightsTable.id, params.data.id));
  if (!original) {
    res.status(404).json({ error: "Flight not found" });
    return;
  }

  // Drop stale check/alert metadata so the duplicate starts clean (otherwise it
  // would inherit seatMissCount and could hit auto-soldout before 3 fresh misses).
  const {
    id, soldSeats, createdAt, updatedAt,
    scheduleAlert, scheduleAlertDetail, scheduleCheckedAt, scheduleMissCount,
    seatAlert, seatAlertDetail, seatCheckedAt, seatGooglePrice, seatMissCount,
    alertDismissedAt,
    ...data
  } = original;
  const arrivalDate = normalizeArrivalDate(data);
  const [duplicated] = await db.insert(flightsTable).values(normalizeFlightIdentifiers({ ...data, ...(arrivalDate ? { arrivalDate } : {}), soldSeats: 0, status: "open" })).returning();

  scheduleGSheetsSync();
  triggerCpExportSoon();
  void scheduleNextAutoSoldOut();
  void recordSeatEvent({ flightId: duplicated.id, type: "created", seats: duplicated.totalSeats, req, note: "Dublikim fluturimi" });
  // Gjurmë në të dy fluturimet: kopja e re di nga erdhi, origjinali di çfarë krijoi.
  void recordFlightChange({
    req, flightId: duplicated.id, source: "duplicate",
    note: `Dublikuar nga fluturimi #${original.id} (${original.fromCity} → ${original.toCity}, ${original.departureDate})`,
  });
  void recordFlightChange({
    req, flightId: original.id, source: "duplicate",
    note: `U dublikua → krijoi fluturimin #${duplicated.id}`,
  });
  applyGooglePriceRulesToNewFlights([duplicated.id]);
  res.status(201).json(formatFlight(duplicated, req.session?.role === "admin"));
});

// Excel template download endpoint (.xlsx)
// Excel import endpoint
router.post("/flights/import", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  // Returns "YYYY-MM-DD" or null if format is unrecognised / empty
  const parseExcelDate = (val: any): string | null => {
    if (!val || val === "") return null;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return val.toISOString().slice(0, 10);
    }
    if (typeof val === "number") {
      try {
        const msPerDay = 24 * 60 * 60 * 1000;
        const epoch = new Date(1899, 11, 30).getTime();
        const d = new Date(epoch + Math.floor(val) * msPerDay);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      } catch { return null; }
    }
    const s = String(val).trim();
    // DD-MM-YYYY  or  DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const iso = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
      if (calendarDateMs(iso) !== null) return iso;
      return null;
    }
    // YYYY-MM-DD already
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      if (calendarDateMs(s) !== null) return s;
      return null;
    }
    // No other formats accepted — reject to prevent silent wrong-date imports
    return null;
  };

  const parseExcelTime = (val: any): string => {
    if (!val && val !== 0) return "";
    // Excel time as Date object (e.g. 1899-12-30T06:00:00Z)
    if (val instanceof Date) {
      const h = val.getUTCHours(); const m = val.getUTCMinutes();
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
    // Excel time fraction (0–1)
    if (typeof val === "number" && val >= 0 && val < 1) {
      const totalMins = Math.round(val * 24 * 60);
      return `${String(Math.floor(totalMins/60)).padStart(2,"0")}:${String(totalMins%60).padStart(2,"0")}`;
    }
    // String "HH:MM"
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::00)?$/);
    if (m) return `${String(parseInt(m[1])).padStart(2,"0")}:${m[2]}`;
    return "";
  };

  const nrm = (s: string) => String(s).trim().toLowerCase().replace(/[\s_\-]+/g, "");

  try {
    const workbook = new ExcelJS.Workbook();
    const filename = req.file.originalname?.toLowerCase() ?? "";
    if (filename.endsWith(".csv")) {
      // Auto-detect delimiter: check first line for semicolons vs commas
      const rawText = req.file.buffer.toString("utf-8");
      const firstLine = rawText.split(/\r?\n/)[0] ?? "";
      const semicolons = (firstLine.match(/;/g) ?? []).length;
      const commas    = (firstLine.match(/,/g) ?? []).length;
      const separator = semicolons > commas ? ";" : ",";
      await (workbook.csv as any).load(Readable.from(req.file.buffer), { separator } as any);
    } else {
      await workbook.xlsx.load(req.file.buffer as any);
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("No worksheet found in file");

    const getCellValue = (cell: ExcelJS.Cell): any => {
      const v = cell.value;
      if (v == null) return "";
      if (v instanceof Date) return v;
      if (typeof v === "object" && "richText" in (v as any))
        return (v as any).richText.map((r: any) => r.text ?? "").join("");
      if (typeof v === "object" && "result" in (v as any))
        return (v as any).result ?? "";
      if (typeof v === "object" && "text" in (v as any))
        return (v as any).text ?? "";
      return v;
    };

    const allRows: any[][] = [];
    worksheet.eachRow((row) => {
      const vals: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        vals[colIdx - 1] = getCellValue(cell);
      });
      allRows.push(vals);
    });

    if (allRows.length < 2) {
      res.status(400).json({ error: "Excel file is empty or has no data rows" });
      return;
    }

    const headers = allRows[0].map((h: any) => String(h ?? "").trim());
    const rows: any[] = allRows.slice(1).map(rowArr => {
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = rowArr[i] ?? ""; });
      return obj;
    });

    if (rows.length === 0) {
      res.status(400).json({ error: "Excel file is empty or has no data rows" });
      return;
    }

    const firstRow = rows[0];
    const cols = Object.keys(firstRow);

    // ── Detect format ────────────────────────────────────────────────────────
    const isSegmentFormat = cols.some(c => c.startsWith("segment_1_"));

    const parsed: any[] = [];
    const errors: string[] = [];

    if (isSegmentFormat) {
      // ── Segment format (BLQ_TIA format) ────────────────────────────────────
      // Each row can contain up to 3 segments. We import each segment as a flight.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const price = parseFloat(String(row["price"] ?? row["Price"] ?? "0")) || 0;
        const seats = parseInt(String(row["available_seats"] ?? row["Available Seats"] ?? "0")) || 0;

        // Parse luggage options "1-20-100" → 1 bag, 20 kg, 100 € price
        const luggage = String(row["luggage_options"] ?? "");
        const luggageParts = luggage.split("-").map(Number);
        const checkedBaggageCount = luggageParts[0] || null;
        const checkedBaggageKg = luggageParts[1] || null;
        const checkedBaggagePrice = luggageParts[2] || null;

        for (let seg = 1; seg <= 3; seg++) {
          const origin = String(row[`segment_${seg}_origin_airport`] ?? "").trim();
          const dest = String(row[`segment_${seg}_destination_airport`] ?? "").trim();
          const airline = String(row[`segment_${seg}_airline`] ?? "").trim();
          const flightNum = String(row[`segment_${seg}_flight_number`] ?? "").trim();
          const depDateRaw = row[`segment_${seg}_date_local_takeoff`];
          const depTimeRaw = row[`segment_${seg}_hours_local_takeoff`];
          const arrDateRaw = row[`segment_${seg}_date_local_landing`];
          const arrTimeRaw = row[`segment_${seg}_hours_local_landing`];

          if (!origin || !dest || !airline) continue; // empty segment

          const depDate = parseExcelDate(depDateRaw);
          if (!depDate) {
            errors.push(`Row ${rowNum} seg${seg}: Data e nisjes mungon ose ka format të gabuar (pranohet: DD-MM-YYYY ose YYYY-MM-DD). Fluturimi u anulua.`);
            continue;
          }
          const arrDate = parseExcelDate(arrDateRaw || depDateRaw);
          if (!arrDate) { errors.push(`Row ${rowNum} seg${seg}: Data e mbërritjes është e pavlefshme.`); continue; }
          const departureTime = parseExcelTime(depTimeRaw);
          const arrivalTime = parseExcelTime(arrTimeRaw);
          let arrivalDate: string;
          try {
            arrivalDate = normalizeArrivalDate({ departureDate: depDate, departureTime, arrivalDate: arrDate, arrivalTime });
          } catch (error) {
            if (!(error instanceof FlightScheduleValidationError)) throw error;
            errors.push(`Row ${rowNum} seg${seg}: ${error.message}`); continue;
          }

          const fullFlightNum = `${airline.toUpperCase()}${flightNum}`;
          parsed.push({
            airline: resolveAirlineName(airline, fullFlightNum),
            flightNumber: fullFlightNum,
            fromCity: origin.toUpperCase(),
            toCity: dest.toUpperCase(),
            departureDate: depDate,
            departureTime,
            arrivalDate,
            arrivalTime,
            adultPrice: String(roundWholeEuro(price)),
            childPrice: String(roundWholeEuro(price)),   // ADULT = CHILD same price
            infantPrice: "35",              // INFANT always 35
            tax: "0",
            totalSeats: isNaN(seats) ? 0 : seats,
            status: "open",
            checkedBaggageCount: checkedBaggageCount ?? null,
            checkedBaggageKg: checkedBaggageKg ? checkedBaggageKg.toString() : null,
            checkedBaggagePrice: checkedBaggagePrice ? checkedBaggagePrice.toString() : null,
          });
        }
      }
    } else {
      // ── Generic format ───────────────────────────────────────────────────
      const get = (row: any, ...keys: string[]) => {
        for (const key of keys) {
          for (const col of Object.keys(row)) {
            if (nrm(col) === nrm(key)) return String(row[col] ?? "").trim();
          }
        }
        return "";
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const airline = get(row, "airline", "carrier", "compagnia");
        const airlineCode = get(row, "airlinecode", "airline code", "code", "iata", "iata code");
        const rawFlightNo = get(row, "flightnumber", "flightno", "flightnr", "flight number", "flight");
        // If separate airline code column exists, combine: "W4" + "5047" → "W45047"
        const flightNumber = airlineCode
          ? (airlineCode + rawFlightNo).replace(/\s+/g, "").toUpperCase()
          : rawFlightNo.replace(/\s+/g, "").toUpperCase();
        const fromCity = get(row, "fromcity", "from", "origin", "departure", "da");
        const toCity = get(row, "tocity", "to", "destination", "arrival", "a");
        const adultPrice = parseFloat(get(row, "adultprice", "adult", "price", "prezzo") || "0");
        const childPrice = parseFloat(get(row, "childprice", "child") || "0");
        const infantPrice = parseFloat(get(row, "infantprice", "infant") || "0");
        const tax = parseFloat(get(row, "tax") || "0");
        const totalSeats = parseInt(get(row, "totalseats", "seats", "posti", "capacity") || "20");
        const status = get(row, "status", "stato") || "open";
        // Baggage: "1-20-80" → count=1, kg=20, price=80
        const baggageRaw = get(row, "baggage", "luggage", "luggage options", "baggage options");
        const baggageParts = baggageRaw ? baggageRaw.split("-").map(Number) : [];
        const checkedBaggageCount = baggageParts[0] || null;
        const checkedBaggageKg = baggageParts[1] || null;
        const checkedBaggagePrice = baggageParts[2] || null;

        if (!airline) { errors.push(`Row ${rowNum}: Mungon airline`); continue; }
        if (!flightNumber) { errors.push(`Row ${rowNum}: Mungon numri i fluturimit`); continue; }
        if (!fromCity) { errors.push(`Row ${rowNum}: Mungon qyteti i nisjes`); continue; }
        if (!toCity) { errors.push(`Row ${rowNum}: Mungon qyteti i mbërritjes`); continue; }

        // Find raw date/time values for proper parsing
        const findRaw = (row: any, ...keys: string[]) => {
          for (const key of keys) {
            for (const col of Object.keys(row)) {
              if (nrm(col) === nrm(key)) return row[col];
            }
          }
          return null;
        };

        const depDateRaw = findRaw(row, "departuredate", "depdate", "date", "data");
        const depDate = parseExcelDate(depDateRaw);
        if (!depDate) {
          errors.push(`Row ${rowNum}: Data e nisjes mungon ose ka format të gabuar (pranohet: DD-MM-YYYY ose YYYY-MM-DD). Fluturimi u anulua.`);
          continue;
        }
        const arrDateRaw = findRaw(row, "arrivaldate", "arrdate");
        const arrDate = arrDateRaw == null || arrDateRaw === "" ? depDate : parseExcelDate(arrDateRaw);
        if (!arrDate) { errors.push(`Row ${rowNum}: Data e mbërritjes është e pavlefshme.`); continue; }
        const departureTime = parseExcelTime(findRaw(row, "departuretime", "deptime"));
        const arrivalTime = parseExcelTime(findRaw(row, "arrivaltime", "arrtime"));
        let arrivalDate: string;
        try {
          arrivalDate = normalizeArrivalDate({ departureDate: depDate, departureTime, arrivalDate: arrDate, arrivalTime });
        } catch (error) {
          if (!(error instanceof FlightScheduleValidationError)) throw error;
          errors.push(`Row ${rowNum}: ${error.message}`); continue;
        }

        parsed.push({
          airline: airline.toUpperCase(),
          flightNumber: flightNumber.replace(/\s+/g, "").toUpperCase(),
          fromCity: fromCity.toUpperCase(),
          toCity: toCity.toUpperCase(),
          departureDate: depDate,
          departureTime,
          arrivalDate,
          arrivalTime,
          adultPrice: adultPrice.toString(),
          childPrice: adultPrice.toString(),
          infantPrice: infantPrice.toString(),
          tax: tax.toString(),
          totalSeats: isNaN(totalSeats) ? 20 : totalSeats,
          status: ["open", "closed", "soldout"].includes(status) ? status : "open",
          checkedBaggageCount: checkedBaggageCount ?? null,
          checkedBaggageKg: checkedBaggageKg ? checkedBaggageKg.toString() : null,
          checkedBaggagePrice: checkedBaggagePrice ? checkedBaggagePrice.toString() : null,
        });
      }
    }

    if (parsed.length === 0) {
      res.status(400).json({ error: "No valid rows found", details: errors });
      return;
    }

    const inserted = await db.insert(flightsTable).values(parsed.map(normalizeFlightIdentifiers)).returning();
    if (inserted.length) scheduleGSheetsSync();
    if (inserted.length) void scheduleNextAutoSoldOut();
    for (const f of inserted) {
      void recordFlightChange({ req, flightId: f.id, source: "import", note: "Import nga Excel" });
    }
    applyGooglePriceRulesToNewFlights(inserted.map(f => f.id));
    res.status(201).json({
      imported: inserted.length,
      skipped: errors.length,
      errors,
    });
  } catch (err: any) {
    console.error("Excel import error:", err);
    res.status(500).json({ error: "Failed to parse Excel file: " + err.message });
  }
});

router.patch("/flights/:id/toggle-sales", async (req, res): Promise<void> => {
  const params = ToggleFlightSalesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ToggleFlightSalesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const newStatus = body.data.open ? "open" : "closed";
  const [beforeToggle] = await db.select({ status: flightsTable.status })
    .from(flightsTable).where(eq(flightsTable.id, params.data.id));
  const [flight] = await db
    .update(flightsTable)
    .set({ status: newStatus })
    .where(eq(flightsTable.id, params.data.id))
    .returning();

  if (!flight) {
    res.status(404).json({ error: "Flight not found" });
    return;
  }

  void recordFlightChange({
    req, flightId: flight.id, source: "toggle-sales",
    before: beforeToggle ?? null, after: { status: flight.status },
  });
  scheduleGSheetsSync();
  // Opening/closing sales adds/removes the flight from CitizenPlane — sync now.
  triggerCpExportSoon();
  // Re-opening a within-cutoff flight must re-arm the auto-soldout timer.
  void scheduleNextAutoSoldOut();
  res.json(formatFlight(flight, req.session?.role === "admin"));
});

// Dismiss/acknowledge a flight's Njoftime alert (seat + schedule) WITHOUT
// changing its sale status — used by the "Confirm" button so a reviewed flight
// leaves the Njoftime tab while remaining bookable.
router.patch("/flights/:id/dismiss-alert", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [flight] = await db
    .update(flightsTable)
    .set({ seatAlert: null, seatAlertDetail: null, scheduleAlert: null, scheduleAlertDetail: null, alertDismissedAt: new Date() })
    .where(eq(flightsTable.id, id))
    .returning();
  if (!flight) { res.status(404).json({ error: "Flight not found" }); return; }
  res.json(formatFlight(flight, req.session?.role === "admin"));
});

// ── Google Flights price sync (via google-flights2 RapidAPI) ─────────────
async function fetchGoogleFlightPrice(flight: typeof flightsTable.$inferSelect, requestStartedAt: Date): Promise<number | null> {
  const result = await fetchGoogleFlightSchedules(flight.fromCity, flight.toCity, flight.departureDate);
  const norm = flight.flightNumber ? normFlightNum(flight.flightNumber) : "";
  const price = (norm ? result.flightPriceMap[norm] : null) ?? null;
  await applyGoogleSearchScheduleAlert(flight, requestStartedAt,
    { price, routePrice: result.routePrice, specific: price != null, error: !!result.error },
    scheduleEvidence(result, flight));
  if (result.error) return null;
  return price ?? result.routePrice;
}

router.post("/flights/sync-google-prices", async (req, res): Promise<void> => {
  const requestStartedAt = new Date();
  if (req.session?.role !== "admin") {
    const role = req.session?.role || "";
    const userId = req.session?.userId;
    if (!userId || !["manager", "agent_staff"].includes(role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { getEffectivePermissions } = await import("./permissions");
    const perms = await getEffectivePermissions(role, userId);
    if (!perms["can_use_google_price_tools"]) {
      res.status(403).json({ error: "Nuk keni leje për këtë veprim" }); return;
    }
  }

  const { flightIds } = req.body;
  if (!Array.isArray(flightIds) || !flightIds.length) {
    res.status(400).json({ error: "flightIds e nevojshme" }); return;
  }

  // Formula can be passed inline (from flights page) or fall back to saved settings
  let minimum: number, above: number, percent: number, fallback: number;
  if (req.body.minimum != null || req.body.above != null || req.body.percent != null) {
    minimum = parseFloat(req.body.minimum ?? "0");
    above    = parseFloat(req.body.above    ?? "0");
    percent  = parseFloat(req.body.percent  ?? "0");
    fallback = parseFloat(req.body.fallback ?? "0");
    // Also persist to settings
    const entries: [string, string][] = [
      ["price_formula_minimum",  String(minimum)],
      ["price_formula_above",    String(above)],
      ["price_formula_percent",  String(percent)],
      ["price_formula_fallback", String(fallback)],
    ];
    for (const [key, val] of entries) {
      const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
      if (existing.length) await db.update(settingsTable).set({ value: val }).where(eq(settingsTable.key, key));
      else await db.insert(settingsTable).values({ key, value: val });
    }
  } else {
    const FORMULA_KEYS = ["price_formula_minimum", "price_formula_above", "price_formula_percent", "price_formula_fallback"];
    const settingRows = await db.select().from(settingsTable).where(inArray(settingsTable.key, FORMULA_KEYS));
    const formulaMap: Record<string, string> = {};
    for (const r of settingRows) formulaMap[r.key] = r.value ?? "";
    minimum  = parseFloat(formulaMap["price_formula_minimum"]  || "0");
    above    = parseFloat(formulaMap["price_formula_above"]    || "0");
    percent  = parseFloat(formulaMap["price_formula_percent"]  || "0");
    fallback = parseFloat(formulaMap["price_formula_fallback"] || "0");
  }

  const targetFlights = await flightsEligibleForGoogleLookup(
    await db.select().from(flightsTable)
      .where(and(
        inArray(flightsTable.id, flightIds.map(Number)),
        eq(flightsTable.excludeFromGoogleRule, false),
      ))
  );

  const results: { id: number; route: string; flightNumber: string; departureDate: string; googlePrice: number | null; oldPrice: number | null; newPrice: number | null; status: string }[] = [];

  for (const flight of targetFlights) {
    if (await googleMonitoringDisabled(flight.id)) continue;
    const oldPrice = flight.adultPrice != null ? Number(flight.adultPrice) : null;
    const googlePrice = await fetchGoogleFlightPrice(flight, requestStartedAt);
    const base = {
      id: flight.id,
      route: `${flight.fromCity}→${flight.toCity}`,
      flightNumber: flight.flightNumber || "",
      departureDate: flight.departureDate,
      googlePrice,
      oldPrice,
    };

    // Without a current Google price, preserve the existing sale price.
    if (googlePrice === null) {
      results.push({ ...base, newPrice: null, status: "not_found" }); continue;
    }

    // If Google price is at or below the "above" threshold → don't change
    if (above > 0 && googlePrice <= above) {
      results.push({ ...base, newPrice: null, status: "skipped_below_above" }); continue;
    }

    // Apply percentage discount
    let newPrice = roundWholeEuro(googlePrice * (1 - percent / 100));

    // Enforce minimum floor — the result must never go below the minimum selling price
    if (minimum > 0 && newPrice < minimum) {
      newPrice = minimum;
    }

    if (newPrice <= 0) {
      results.push({ ...base, newPrice: null, status: "skipped_invalid" }); continue;
    }

    await db.update(flightsTable)
      .set({ adultPrice: newPrice.toString(), childPrice: newPrice.toString() })
      .where(eq(flightsTable.id, flight.id));
    await recordPriceHistoryRow(req, flight.id, oldPrice, newPrice, googlePrice);

    results.push({ ...base, newPrice, status: "updated" });
  }

  const updated = results.filter(r => r.status === "updated" || r.status === "fallback_applied").length;
  const notFound = results.filter(r => r.status === "not_found").length;
  const skipped  = results.filter(r => r.status.startsWith("skipped")).length;

  if (updated > 0) scheduleGSheetsSync();

  // Send email notification (async, don't block response)
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo) {
    const { bookingUsersTable } = await import("@workspace/db");
    const [actor] = await db.select({ name: bookingUsersTable.name, email: bookingUsersTable.email })
      .from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session!.userId!));
    const triggeredBy = actor ? (actor.name || actor.email) : "Admin";
    const emailHtml = priceSyncEmail(results, triggeredBy);
    sendEmail(
      notifyTo,
      `✈ Sync Çmimeve — ${updated} ndryshuar, ${skipped} anashkaluar`,
      emailHtml
    ).catch(err => console.error("[sync-email]", err));
  }

  res.json({ updated, notFound, skipped, results });
});

// Combined Google check for the selected flights: in a SINGLE Google call per
// route+date group, READ the Google price + schedule and REPORT them. It never
// writes sale prices (adultPrice). It returns, per flight, the current price,
// the live Google price, and the price "Sinkronizo" WOULD set (price formula),
// plus schedule status (time change / not found / no availability for our
// settings criteria). Schedule alerts are persisted, and valid seat results
// share the automatic check's consecutive-miss counter and auto-sold-out
// transition. Actual price changes happen only via "Sinkronizo Çmimet".
// Progres i "Kontrollo Çmime + Orare" (check-google-selected). Me shumë fluturime
// të zgjedhura kontrolli zgjat minuta (radha RapidAPI); kërkesa HTTP e nis punën
// në SFOND dhe kthehet menjëherë, frontend-i ndjek progresin me polling te
// GET /flights/check-google-progress derisa running=false dhe lexon summary.
// (Më parë kërkesa priste deri në fund → proxy e priste lidhjen pas ~2 min dhe
// kontrolli dukej sikur "ndalonte në mes" me "Gabim lidhje".)
const googleCheckProgress = {
  running: false,
  total: 0,          // grupe rrugë+datë gjithsej
  done: 0,           // grupe të përfunduara
  flights: 0,        // fluturime të përfshira
  startedAt: null as string | null,
  finishedAt: null as string | null,
  summary: null as Record<string, unknown> | null,
};

router.post("/flights/check-google-selected", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    const role = req.session?.role || "";
    const userId = req.session?.userId;
    if (!userId || !["manager", "agent_staff"].includes(role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { getEffectivePermissions } = await import("./permissions");
    const perms = await getEffectivePermissions(role, userId);
    if (!perms["can_use_google_price_tools"]) {
      res.status(403).json({ error: "Nuk keni leje për këtë veprim" }); return;
    }
  }
  const { flightIds } = req.body;
  if (!Array.isArray(flightIds) || !flightIds.length) {
    res.status(400).json({ error: "flightIds e nevojshme" }); return;
  }
  if (googleCheckProgress.running) {
    res.status(409).json({ error: "Një kontroll është duke u kryer. Prit të mbarojë.", busy: true }); return;
  }
  // Rezervo punën MENJËHERË (sinkron, pa await në mes) që dy POST-e njëkohësisht
  // të mos e kalojnë të dyja kontrollin busy. Çdo dështim para nisjes së punës në
  // sfond e çliron rezervimin te catch-u më poshtë.
  const startedAtIso = new Date().toISOString();
  const requestStartedAt = new Date(startedAtIso);
  googleCheckProgress.running = true;
  googleCheckProgress.total = 0;
  googleCheckProgress.done = 0;
  googleCheckProgress.flights = 0;
  googleCheckProgress.startedAt = startedAtIso;
  googleCheckProgress.finishedAt = null;
  googleCheckProgress.summary = null;
  // Logger i shkëputur nga kërkesa — puna vazhdon PAS res.json().
  const log = req.log ?? logger;
  try {

  // Price formula from saved settings.
  const FORMULA_KEYS = ["price_formula_minimum", "price_formula_above", "price_formula_percent", "price_formula_fallback"];
  const settingRows = await db.select().from(settingsTable).where(inArray(settingsTable.key, FORMULA_KEYS));
  const formulaMap: Record<string, string> = {};
  for (const r of settingRows) formulaMap[r.key] = r.value ?? "";
  const minimum  = parseFloat(formulaMap["price_formula_minimum"]  || "0");
  const above    = parseFloat(formulaMap["price_formula_above"]    || "0");
  const percent  = parseFloat(formulaMap["price_formula_percent"]  || "0");
  const fallback = parseFloat(formulaMap["price_formula_fallback"] || "0");

  // Sold-out flights are dropped. "Përjashtuar Online" flights remain visible
  // to Google checks; only rule-based price writes and auto-sold-out are blocked.
  const targetFlights = await flightsEligibleForGoogleLookup(
    await db.select().from(flightsTable)
      .where(and(
        inArray(flightsTable.id, flightIds.map(Number)),
        sql`status != 'soldout'`,
      ))
  );

  // Group by route+date so each Google call covers many flights at once.
  const groups: Record<string, typeof targetFlights> = {};
  for (const f of targetFlights) {
    const key = `${f.fromCity}|${f.toCity}|${f.departureDate}`;
    (groups[key] ||= []).push(f);
  }

  // Seat-availability party size for the badge check (same setting the warmer uses).
  const seatCfg = await getSeatCheckConfig();
  const minSeats = seatCfg.minSeats;
  // The seat "low_seats" badge applies ONLY within the configured seat-check day
  // window (same window the automatic warmer uses). Distant flights must never be
  // flagged for seats here — and any stale badge they carry is cleared.
  const seatWindowStartStr = new Date().toISOString().slice(0, 10);
  const seatWindowEnd = new Date();
  seatWindowEnd.setDate(seatWindowEnd.getDate() + seatCfg.days);
  const seatWindowEndStr = seatWindowEnd.toISOString().slice(0, 10);

  let priceWouldChange = 0;
  let timeChanged = 0, notFoundCnt = 0, scheduleOk = 0, apiEmpty = 0, apiErrorGroups = 0;
  let googlePriceChanged = 0, possibleCancellation = 0, saveErrors = 0, skipped = 0;
  let seatLow = 0, seatSoldOut = 0;
  const newlySoldOut: Array<{
    id: number;
    airline: string | null;
    flightNumber: string | null;
    route: string;
    departureDate: string | null;
    googlePrice: number | null;
  }> = [];
  const priceResults: Array<Record<string, unknown>> = [];
  const fetchedAt = new Date();

  // History may be retained internally but is never a current-price fallback.
  const cacheRows = await db.select({
    cacheKey: googlePriceCacheTable.cacheKey,
    price: googlePriceCacheTable.price,
  }).from(googlePriceCacheTable);
  const cachePriceMap = new Map<string, number | null>(
    cacheRows.map(r => [r.cacheKey, r.price != null ? Number(r.price) : null])
  );
  // Snapshot once: repeated flight identities and parallel cache writes must
  // compare against the price that existed BEFORE this manual run.
  const priceBeforeRun = new Map(cachePriceMap);
  for (const [key, cached] of googlePriceCache) {
    if (cached.price != null) priceBeforeRun.set(key, cached.price);
  }
  const existingCachePrice = (k: string): number | null =>
    googlePriceCache.get(k)?.price ?? cachePriceMap.get(k) ?? null;

  // Grupet përpunohen PARALELISHT me limit konkurence: me shumë fluturime të
  // zgjedhura, përpunimi sekuencial i kalonte 120 sekondat dhe proxy-ja e priste
  // lidhjen ("Gabim lidhje" në ekran) ndërsa serveri vazhdonte punën kot.
  const processGroup = async (key: string, flights: typeof targetFlights): Promise<void> => {
    flights = await flightsEligibleForGoogleLookup(flights);
    if (!flights.length) return;
    const [from, to, date] = key.split("|");
    const fromU = from.toUpperCase(), toU = to.toUpperCase();
    let googleFlights: Awaited<ReturnType<typeof fetchGoogleFlightSchedules>>["flights"] = [];
    let routePrice: number | null = null;
    let flightPriceMap: Record<string, number> = {};
    let schedulesReliable = false;
    try {
      const r = await fetchGoogleFlightSchedules(from, to, date);
      // fetchGoogleFlightSchedules signals API/transport failure via `error: true`
      // (it does not throw). On failure leave prices AND schedule alerts untouched —
      // a RapidAPI outage must never overwrite real prices with the fallback.
      if (r.error) {
        log.warn({ key }, "[check-google-selected] Google API error — prices unverified");
        await markGroupStale(fromU, toU, date, flights, requestStartedAt);
        apiErrorGroups++;
        return;
      }
      googleFlights = r.flights; routePrice = r.routePrice; flightPriceMap = r.flightPriceMap;
      schedulesReliable = r.schedulesReliable !== false;
    } catch (err) {
      log.error({ err, key }, "[check-google-selected] fetch failed");
      await markGroupStale(fromU, toU, date, flights, requestStartedAt);
      apiErrorGroups++;
      return;
    }
    const googleCount = googleFlights.length;

    // Valid empty results clear the current route price, with stale=false.
    const routeKey = `${fromU}|${toU}|${date}|`;
    const rw = computePriceWrite(
      { price: routePrice, routePrice, specific: false }, existingCachePrice(routeKey),
    );
    await upsertGooglePriceCacheEntry(routeKey, rw.price, rw.routePrice, rw.specific, fetchedAt.getTime(), rw.stale);

    // Seat-availability for the configured party size → drives the low-seats badge.
    // Separate Google query (adults = minSeats). On API outage leave seat alerts untouched.
    let seatAvail: Awaited<ReturnType<typeof fetchGoogleSeatAvailability>> | null = null;
    let seatObservedAt: Date | null = null;
    try {
      const sa = await fetchGoogleSeatAvailability(from, to, date, minSeats);
      if (!sa.error) {
        seatAvail = sa;
        seatObservedAt = new Date();
      }
    } catch (err) {
      log.error({ err, key }, "[check-google-selected] seat fetch failed");
    }

    for (const f of flights) {
      const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
      const match = matchingGoogleSchedule(googleFlights, f);

      // ── Price (READ-ONLY): compute what "Sinkronizo" WOULD set; never write ──
      const specificPrice = norm && norm in flightPriceMap ? flightPriceMap[norm] : null;
      const googlePrice = specificPrice ?? routePrice;
      const previousGooglePrice = priceBeforeRun.get(`${fromU}|${toU}|${date}|${norm}`) ?? null;
      const googlePriceDidChange = previousGooglePrice != null && previousGooglePrice > 0
        && specificPrice != null && specificPrice > 0 && specificPrice !== previousGooglePrice;
      if (googlePriceDidChange) googlePriceChanged++;
      const oldPrice = f.adultPrice != null ? Number(f.adultPrice) : null;
      let wouldBePrice: number | null = null;
      let priceStatus: "ok" | "fallback" | "below_threshold" | "no_data" | "invalid";
      if (googlePrice === null) {
        priceStatus = "no_data";
      } else if (above > 0 && googlePrice <= above) {
        priceStatus = "below_threshold";
      } else {
        let newPrice = roundWholeEuro(googlePrice * (1 - percent / 100));
        if (minimum > 0 && newPrice < minimum) newPrice = minimum;
        if (newPrice <= 0) priceStatus = "invalid";
        else { wouldBePrice = newPrice; priceStatus = "ok"; }
      }
      if (wouldBePrice != null && oldPrice !== wouldBePrice) priceWouldChange++;

      // Only complete schedule evidence can classify a missing/changed flight.
      // Empty, partial and ambiguous schedules stay in the retry flow.
      let scheduleStatus: "ok" | "time_changed" | "not_found" | "no_data" | "skipped" = "no_data";
      let scheduleDetail: string | null = null;
      try {
        const datedFlights = googleFlights.filter(g => !g.departureDate || g.departureDate === f.departureDate);
        const state = await applyGoogleSearchScheduleAlert(f, requestStartedAt,
          { price: specificPrice, routePrice, specific: specificPrice != null },
          scheduleEvidence({ flights: datedFlights, routePrice, flightPriceMap, schedulesReliable }, f),
          db, undefined, { flights: datedFlights, schedulesReliable });
        const alert = state?.scheduleAlert;
        const detail = state?.scheduleAlertDetail ?? null;
        if (state?.possibleCancellation) possibleCancellation++;
        if (!state) {
          // A locked-row guard rejected this write (newer result, edited
          // identity, acknowledgement, status or monitoring exclusion).
          // This says nothing about the quality of Google's response.
          scheduleStatus = "skipped";
          scheduleDetail = "Rezultati u anashkalua për të ruajtur të dhënat aktuale të fluturimit";
          skipped++;
        }
        else if (alert === "time_changed") { scheduleStatus = "time_changed"; scheduleDetail = detail; timeChanged++; }
        else if (alert === "not_found") {
          scheduleStatus = "not_found"; scheduleDetail = detail;
          if (state?.lookupOutcome === "missing") notFoundCnt++;
          else apiEmpty++;
        }
        else if (state?.lookupOutcome === "empty" || state?.lookupOutcome === "error") {
          scheduleDetail = detail;
          apiEmpty++;
        }
        else if (state && googleCount > 0) {
          scheduleStatus = "ok"; scheduleOk++;
          if (match && (match.departureTime || match.arrivalTime))
            scheduleDetail = [match.departureTime, match.arrivalTime].filter(Boolean).join(" → ");
        } else {
          apiEmpty++;
        }
      } catch (err) {
        saveErrors++;
        log.error({ err, flightId: f.id }, "[check-google-selected] failed to persist schedule alert");
      }

      // Refresh the cached flight-specific Google price (per-row "Google" column).
      // A valid search with no fare writes null/verified, not an old fare.
      if (norm) {
        const flKey = `${fromU}|${toU}|${date}|${norm}`;
        const pw = computePriceWrite(
          { price: googlePrice, routePrice, specific: specificPrice != null }, existingCachePrice(flKey),
        );
        await upsertGooglePriceCacheEntry(flKey, pw.price, pw.routePrice, pw.specific, fetchedAt.getTime(), pw.stale);
      }

      // ── Seat availability — shared counter with the automatic warmer ────────
      // A no-price warning is informational, not a seat miss or auto-sold-out.
      // Preserve unrelated existing seat alerts on this outcome.
      // Flag/clear seats ONLY for flights inside the seat-check day window; distant
      // flights are never flagged, and any stale badge they still carry is cleared.
       const withinSeatWindow = !!f.departureDate
         && f.departureDate >= seatWindowStartStr
         && f.departureDate <= seatWindowEndStr;
      if (googlePrice != null && !withinSeatWindow) {
        if (f.seatAlert || f.seatMissCount !== 0) {
          try {
            await db.update(flightsTable)
              .set({ seatAlert: null, seatAlertDetail: null, seatMissCount: 0, seatMissLastAt: null })
              .where(eq(flightsTable.id, f.id));
          } catch (err) {
            log.error({ err, flightId: f.id }, "[check-google-selected] failed to clear distant seat alert");
          }
        }
      } else if (googlePrice != null && seatAvail) {
        const available = norm ? seatAvail.availableFlightNumbers.has(norm) : false;
        const seatPrice = norm ? (seatAvail.flightPriceMap[norm] ?? null) : null;
        try {
          const write = await applySeatCheckResult({
            flightId: f.id,
            available,
            minSeats,
            // Manual checks participate in the same counter and honor the
            // configured auto-sold-out toggle.
            autoSoldOut: seatCfg.autoSoldOut,
            checkedAt: seatObservedAt!,
            snapshot: {
              fromCity: f.fromCity,
              toCity: f.toCity,
              departureDate: f.departureDate,
              flightNumber: f.flightNumber,
              windowStart: seatWindowStartStr,
              windowEnd: seatWindowEndStr,
              requestStartedAt,
            },
            googlePrice: seatPrice,
          });
          if (write.applied && write.seatAlert === "low_seats") seatLow++;
          if (write.applied && write.transitionedToSoldOut) {
            seatSoldOut++;
            newlySoldOut.push({
              id: f.id,
              airline: f.airline ?? null,
              flightNumber: f.flightNumber ?? null,
              route: `${f.fromCity} → ${f.toCity}`,
              departureDate: f.departureDate ?? null,
              googlePrice: seatPrice,
            });
          }
        } catch (err) {
          log.error({ err, flightId: f.id }, "[check-google-selected] failed to persist seat alert");
        }
      }

      priceResults.push({
        flightId: f.id,
        flightNumber: f.flightNumber ?? null,
        route: `${f.fromCity} → ${f.toCity}`,
        date: f.departureDate,
        currentPrice: oldPrice,
        googlePrice,
        previousGooglePrice,
        googlePriceDidChange,
        wouldBePrice,
        priceStatus,
        scheduleStatus,
        scheduleDetail,
      });
    }
  };

  // Pool me 5 punëtorë paralelë + pauzë e vogël mes marrjeve nga radha, që të
  // mos e godasim RapidAPI-n me të gjitha njëherësh.
  const groupEntries = Object.entries(groups);
  let nextIdx = 0;
  const CONCURRENCY = 5;
  const worker = async () => {
    while (nextIdx < groupEntries.length) {
      const [key, flights] = groupEntries[nextIdx++];
      await processGroup(key, flights);
      googleCheckProgress.done++;
      await new Promise(r => setTimeout(r, 150));
    }
  };

  // Nis punën në SFOND dhe kthehu menjëherë — frontend-i ndjek progresin me
  // polling (i lidhur me startedAt që të mos "kapet" pas një runi tjetër).
  googleCheckProgress.total = groupEntries.length;
  googleCheckProgress.flights = targetFlights.length;

  res.json({ started: true, startedAt: startedAtIso, totalGroups: groupEntries.length, total: targetFlights.length });

  void (async () => {
    try {
      const workerResults = await Promise.allSettled(
        Array.from({ length: Math.min(CONCURRENCY, groupEntries.length) }, worker),
      );
      const failedWorker = workerResults.find(result => result.status === "rejected");
      if (failedWorker) {
        log.error(
          { err: failedWorker.status === "rejected" ? failedWorker.reason : undefined },
          "[check-google-selected] background run failed",
        );
        googleCheckProgress.summary = { error: true };
      } else {
        googleCheckProgress.summary = {
          prices: priceResults,
          priceWouldChange,
          timeChanged, notFound: notFoundCnt, possibleCancellation, googlePriceChanged, scheduleOk, apiEmpty, apiErrorGroups, saveErrors, skipped,
          seatLow, seatSoldOut,
          total: targetFlights.length,
        };
      }
    } catch (err) {
      log.error({ err }, "[check-google-selected] background run failed");
      googleCheckProgress.summary = { error: true };
    } finally {
      // allSettled above lets every worker finish first, so every transition
      // committed before a later worker failure is included in this flush.
      if (newlySoldOut.length > 0) {
        try {
          await notifySoldOut(newlySoldOut.splice(0), minSeats);
        } catch (err) {
          log.error({ err }, "[check-google-selected] failed to notify sold-out transitions");
        }
      }
      googleCheckProgress.running = false;
      googleCheckProgress.finishedAt = new Date().toISOString();
    }
  })();
  } catch (err) {
    // Dështim PARA nisjes së punës në sfond — çliro rezervimin që kontrolli
    // të mos mbetet "busy" përgjithmonë.
    googleCheckProgress.running = false;
    googleCheckProgress.finishedAt = new Date().toISOString();
    throw err;
  }
});

// ── Price formula settings ────────────────────────────────────────────────
const FORMULA_KEYS_ALL = ["price_formula_minimum", "price_formula_above", "price_formula_percent", "price_formula_fallback"];

router.get("/settings/price-formula", async (req, res): Promise<void> => {
  if (!req.session?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, FORMULA_KEYS_ALL));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value ?? "";
  res.json({
    minimum:  map["price_formula_minimum"]  || "0",
    above:    map["price_formula_above"]    || "0",
    percent:  map["price_formula_percent"]  || "0",
    fallback: map["price_formula_fallback"] || "0",
  });
});

router.put("/settings/price-formula", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }
  const { minimum, above, percent, fallback } = req.body;
  const entries: [string, string][] = [
    ["price_formula_minimum",  String(minimum  ?? "0")],
    ["price_formula_above",    String(above    ?? "0")],
    ["price_formula_percent",  String(percent  ?? "0")],
    ["price_formula_fallback", String(fallback ?? "0")],
  ];
  for (const [key, val] of entries) {
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing.length) await db.update(settingsTable).set({ value: val }).where(eq(settingsTable.key, key));
    else await db.insert(settingsTable).values({ key, value: val });
  }
  res.json({ minimum: entries[0][1], above: entries[1][1], percent: entries[2][1], fallback: entries[3][1] });
});

// ── CitizenPlane pricing settings (ADMIN ONLY) ─────────────────────────────
// Global markup applied to the base adult price to produce the price sent to
// the CitizenPlane marketplace. type = "percent" | "fixed"; value is the markup
// amount (0 = no change). Per-flight overrides live in flights.citizen_price.
router.get("/settings/citizen-pricing", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Forbidden: admin only" }); return; }
  const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, CITIZEN_PRICING_KEYS));
  const map: Record<string, string | null> = {};
  for (const r of rows) map[r.key] = r.value ?? "";
  const type = map[CITIZEN_MARKUP_TYPE_KEY] === "fixed" ? "fixed" : "percent";
  const value = map[CITIZEN_MARKUP_VALUE_KEY] || "0";
  res.json({ type, value });
});

router.put("/settings/citizen-pricing", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Forbidden: admin only" }); return; }
  const rawType = req.body?.type;
  const type: CitizenMarkupType = rawType === "fixed" ? "fixed" : rawType === "percent" ? "percent" : "percent";
  if (rawType !== "fixed" && rawType !== "percent") {
    res.status(400).json({ error: "type duhet të jetë 'percent' ose 'fixed'" }); return;
  }
  const value = parseCitizenMoney(req.body?.value);
  if (value == null || value < 0) {
    res.status(400).json({ error: "value duhet të jetë një numër >= 0" }); return;
  }
  const entries: [string, string][] = [
    [CITIZEN_MARKUP_TYPE_KEY, type],
    [CITIZEN_MARKUP_VALUE_KEY, String(round2Citizen(value))],
  ];
  for (const [key, val] of entries) {
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing.length) await db.update(settingsTable).set({ value: val }).where(eq(settingsTable.key, key));
    else await db.insert(settingsTable).values({ key, value: val });
  }
  // Marketplace prices depend on this markup — refresh the export promptly.
  triggerCpExportSoon();
  res.json({ type: entries[0][1], value: entries[1][1] });
});

// ── Per-flight Citizen price override (ADMIN ONLY) ─────────────────────────
// Body: { citizenPrice: number | null }. null clears the override (revert to
// the auto markup default). Returns the new effective Citizen price + source.
router.patch("/flights/:id/citizen-price", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Forbidden: admin only" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id i pavlefshëm" }); return; }

  const raw = req.body?.citizenPrice;
  let toStore: string | null;
  if (raw === null || raw === undefined || raw === "") {
    toStore = null; // clear override → auto default
  } else {
    const n = parseCitizenMoney(raw);
    if (n == null || n < 0) { res.status(400).json({ error: "citizenPrice duhet të jetë numër >= 0 ose null" }); return; }
    toStore = String(roundWholeEuro(round2Citizen(n)));
  }

  const [beforeCit] = await db.select({ citizenPrice: flightsTable.citizenPrice })
    .from(flightsTable).where(eq(flightsTable.id, id));
  const [updated] = await db.update(flightsTable)
    .set({ citizenPrice: toStore })
    .where(eq(flightsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Fluturimi nuk u gjet" }); return; }

  void recordFlightChange({
    req, flightId: id, source: "citizen-price",
    before: beforeCit ?? null, after: { citizenPrice: toStore },
  });

  const settings = await getCitizenPricingSettings();
  // Override changes the marketplace price — refresh the export promptly.
  triggerCpExportSoon();
  res.json({
    id: updated.id,
    citizenPrice: computeCitizenAdultPrice(updated, settings),
    citizenPriceDefault: computeCitizenDefault(updated.adultPrice, settings),
    citizenPriceSource: citizenPriceSource(updated),
  });
});

// ── Schedule comparison helpers ───────────────────────────────────────────────
function extractHHMM(s: string): string {
  if (!s) return "";
  // "2025-07-01T08:00:00" → "08:00"
  const isoMatch = s.match(/T(\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];
  // "08:00", "8:00"
  const timeMatch = s.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  return s.trim();
}

function normFlightNum(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase().trim();
}

// "Pa Çmim" is a verified empty price or a missing row. Unverified rows belong
// exclusively to the stale scheduler, including failures with no prior price.
// Builds the same cacheKey the cache uses:
// UPPER(FROM)|UPPER(TO)|DATE|normFlightNum (strip whitespace + uppercase).
function notificationAlertsSql() {
  return and(googleMonitoringEnabledSql(), sql`(${flightsTable.scheduleAlert} NOT IN ('not_found', 'verified_no_price', 'price_retry') OR ${flightsTable.seatAlert} IS NOT NULL OR ${possibleCancellationSql()})`)!;
}
function suspiciousFlightsSql() {
  return and(googleMonitoringEnabledSql(), sql`${flightsTable.scheduleAlert} = 'not_found' AND ${flightsTable.status} NOT IN ('soldout', 'cancelled')`)!;
}
function verifiedNoPriceSql() {
  return and(googleMonitoringEnabledSql(), sql`${flightsTable.scheduleAlert} = 'verified_no_price' AND ${flightsTable.status} NOT IN ('soldout', 'cancelled')`)!;
}
function noGooglePriceSql() {
  return sql`NOT EXISTS (SELECT 1 FROM ${googlePriceCacheTable} WHERE ${googlePriceCacheTable.cacheKey} = UPPER(${flightsTable.fromCity}) || '|' || UPPER(${flightsTable.toCity}) || '|' || ${flightsTable.departureDate} || '|' || UPPER(REGEXP_REPLACE(COALESCE(${flightsTable.flightNumber}, ''), '[[:space:]]', '', 'g')) AND (${googlePriceCacheTable.price} IS NOT NULL OR ${googlePriceCacheTable.stale} = TRUE))`;
}

// SQL predicate matching flights that have NO Google cache row at all (never
// fetched, or the row was deleted/expired). These "fell through" BOTH "Pa Çmim"
// (which needs a row with NULL price) and "Çmim i Vjetër" (which needs a stale
// row), so the warmer never re-checked them and their sale price froze at the
// last value. Include them so every governed flight always reflects a current
// Google price (live → stale → rule minimum).
function missingGooglePriceSql() {
  return sql`NOT EXISTS (SELECT 1 FROM ${googlePriceCacheTable} WHERE ${googlePriceCacheTable.cacheKey} = UPPER(${flightsTable.fromCity}) || '|' || UPPER(${flightsTable.toCity}) || '|' || ${flightsTable.departureDate} || '|' || UPPER(REGEXP_REPLACE(COALESCE(${flightsTable.flightNumber}, ''), '[[:space:]]', '', 'g')))`;
}

// Resolve full airline name from IATA code or flight number prefix
function resolveAirlineName(airlineRaw: string, flightNumber: string): string {
  const num  = (flightNumber || "").replace(/\s+/g, "").toUpperCase();
  const code = (airlineRaw  || "").replace(/\s+/g, "").toUpperCase();
  // Wizz Air operates under W4 / W6 / W9 IATA codes
  if (/^W[456789]/i.test(num) || ["W4","W5","W6","W7","W8","W9"].includes(code)) return "WIZZ AIR";
  // Keep original if already a meaningful name, otherwise return code
  return airlineRaw.trim() || code;
}

export type GoogleFlightInfo = {
  flightNumber: string; airline: string;
  departureTime: string; arrivalTime: string;
  // When Google supplies full timestamps, retain their calendar dates. Most
  // existing callers only need HH:MM, while flight discovery uses this to
  // preserve an actual next-day arrival rather than guessing from the clock.
  departureDate?: string;
  arrivalDate?: string;
  arrivalDateFromUpstream?: boolean;
  fromCity?: string;
  toCity?: string;
  googlePrice: number | null;  // route-level min price (same for all flights on that date)
};

export type GoogleScheduleResult = {
  flights: GoogleFlightInfo[];
  routePrice: number | null;          // minimum price across ALL itineraries on this date
  flightPriceMap: Record<string, number>; // normalised flight-number → cheapest itinerary price
  error?: boolean;                         // true when the upstream fetch failed (vs. legitimately empty)
  schedulesReliable?: boolean;             // false if any schedule could not be completely parsed
};
function scheduleEvidence(result: GoogleScheduleResult, flight: typeof flightsTable.$inferSelect) {
  return googleScheduleSearchEvidence(result.flights, flight, !result.error && result.schedulesReliable !== false);
}

export async function fetchGoogleFlightSchedules(
  from: string, to: string, dateStr: string,
  // directOnly: mbaj vetëm itineraret me NJË segment (fluturime direkte).
  // Përdoret vetëm nga kërkimi i krijimit të fluturimit; warmers/kontrollet
  // e tjera mbeten siç ishin (default false).
  opts?: { directOnly?: boolean; priority?: GoogleRequestPriority }
): Promise<GoogleScheduleResult> {
  const apiKey = process.env.RAPIDAPI_KEY;
  const failed = (reason: GoogleLookupFailure, httpStatus?: number): GoogleScheduleResult => {
    if (opts?.directOnly) {
      logger.warn({ from, to, date: dateStr, reason, httpStatus },
        "Google direct-flight lookup failed");
    }
    return { flights: [], routePrice: null, flightPriceMap: {}, error: true };
  };
  if (!apiKey) return failed("not_configured");

  let isoDate = dateStr;
  const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) isoDate = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  const url = new URL("https://google-flights2.p.rapidapi.com/api/v1/searchFlights");
  url.searchParams.set("departure_id",  from.toUpperCase());
  url.searchParams.set("arrival_id",    to.toUpperCase());
  url.searchParams.set("outbound_date", isoDate);
  url.searchParams.set("currency",      "EUR");
  url.searchParams.set("type",          "2");
  url.searchParams.set("adults",        "1");

  let stage: "fetch" | "json" | "parse" = "fetch";
  let httpStatus: number | undefined;
  try {
    // The shared slot covers fetch AND body consumption; the transport timeout
    // still starts at launch (25s), not while queued behind other requests.
    const resp = await fetchGoogleJson(url, apiKey, 25_000, opts?.priority);
    httpStatus = resp.status;
    if (!resp.ok) return failed("http_error", httpStatus);
    const data: any = resp.data;

    stage = "parse";
    const allItineraries = googleSearchItineraries(data);

    // Calculate minimum price across ALL itineraries (route-level benchmark)
    const allPrices = allItineraries
      .map((itin: any) => Number(itin?.price ?? 0))
      .filter((p: number) => Number.isFinite(p) && p > 0);
    const routePrice = allPrices.length > 0 ? Math.min(...allPrices) : null;

    const flights: GoogleFlightInfo[] = [];
    let schedulesReliable = true;
    // Per-flight-number price: cheapest itinerary that contains that specific flight
    const flightPriceMap: Record<string, number> = {};

    for (const itinerary of allItineraries) {
      const itinPrice = Number(itinerary?.price ?? 0);
      const flightLegs: any[] = itinerary?.flights ?? itinerary?.legs ?? itinerary?.segments ?? [];
      if (!Array.isArray(flightLegs)) throw new Error("Invalid Google flight legs");
      if (!flightLegs.length) schedulesReliable = false;
      // Fluturime direkte: itinerari duhet të ketë saktësisht NJË segment.
      if (opts?.directOnly && flightLegs.length !== 1) continue;
      const itinDepRaw = itinerary?.departure_time ?? "";
      const itinArrRaw = itinerary?.arrival_time   ?? "";

      if (flightLegs.length > 0) {
        for (const leg of flightLegs) {
          if (!leg || typeof leg !== "object" || Array.isArray(leg)) throw new Error("Invalid Google flight leg");
          const rawNum  = leg?.flight_number ?? leg?.flightNumber ?? leg?.number ?? "";
          const airline = leg?.airline ?? leg?.airline_name ?? leg?.carrier ?? "";
          const legDepRaw = leg?.departure_airport?.time ?? leg?.departure_time ?? leg?.dep_time ?? itinDepRaw;
          const legArrRaw = leg?.arrival_airport?.time   ?? leg?.arrival_time   ?? leg?.arr_time ?? itinArrRaw;
          const flightNum = normFlightNum(String(rawNum));
          const depStamp = googleDateTime(legDepRaw)
            ?? (flightLegs.length === 1 ? googleDateTime(itinDepRaw) : null);
          const arrStamp = googleDateTime(legArrRaw)
            ?? (flightLegs.length === 1 ? googleDateTime(itinArrRaw) : null);
          if ((depStamp && legDepRaw && extractHHMM(String(legDepRaw)) !== depStamp.time)
            || (arrStamp && legArrRaw && extractHHMM(String(legArrRaw)) !== arrStamp.time)) {
            throw new Error("Conflicting Google datetime");
          }
          const depTime = depStamp?.time ?? "";
          const arrTime = arrStamp?.time ?? "";
          const depDate = depStamp?.date;
          const arrDate = arrStamp?.date;
          const legFrom = String(leg?.departure_airport?.airport_code ?? leg?.departure_airport?.id ?? leg?.departure_airport?.code ?? "").trim().toUpperCase();
          const legTo = String(leg?.arrival_airport?.airport_code ?? leg?.arrival_airport?.id ?? leg?.arrival_airport?.code ?? "").trim().toUpperCase();
          if (!flightNum || !depTime || !arrTime || !depDate || !arrDate || !legFrom || !legTo) {
            schedulesReliable = false;
          }

          // Fare identity does not require a departure time. Missing schedule
          // fields must not replace a known exact fare with a cheaper alternative.
          if (flightNum && Number.isFinite(itinPrice) && itinPrice > 0) {
            if (!(flightNum in flightPriceMap) || itinPrice < flightPriceMap[flightNum]) {
              flightPriceMap[flightNum] = itinPrice;
            }
          }
          if (flightNum && depTime && arrTime && depDate && arrDate
            && legFrom === from.toUpperCase() && legTo === to.toUpperCase() && depDate === isoDate) {
            flights.push({
              flightNumber: flightNum,
              airline: resolveAirlineName(String(airline), flightNum),
              departureTime: depTime,
              arrivalTime: arrTime,
              departureDate: depDate,
              arrivalDate: arrDate,
              arrivalDateFromUpstream: true,
              fromCity: legFrom,
              toCity: legTo,
              googlePrice: routePrice,
            });
          }
        }
      }
    }
    return { flights, routePrice, flightPriceMap, schedulesReliable };
  } catch (error) {
    if (error instanceof GoogleResponseJsonError) {
      stage = "json";
      httpStatus = error.status;
    }
    return failed(googleLookupFailure(error, stage), httpStatus);
  }
}

// ── Background Google-price cache warmer ────────────────────────────────────
// Keeps google_price_cache fresh for ALL upcoming flights so the flights page
// never shows loading spinners. Runs on a timer, refreshes only entries that
// are about to expire, and groups by route+date to minimise RapidAPI calls.
//
// Shared FIFO guard for all Google-price warmers. Only one owner may write at
// a time; candidates yield between completed route-date groups, so scheduled
// stale/no-price checks need not wait for the entire candidate dataset.
// Individual RapidAPI calls still pass through fetchGoogleJson(). We deliberately
// do not "steal" this lock on a timer: a timed takeover cannot cancel the old
// owner and would allow two live writers to overlap. Upstream fetches have their
// own timeout, while process exit naturally discards the in-memory queue.
const gpriceWarmerQueue = new GooglePriceWarmerQueue();
async function waitForGpriceWarmer(): Promise<number> {
  return gpriceWarmerQueue.acquire();
}
function beatGpriceWarmer(token: number): void {
  // Kept at route-group call sites as an ownership assertion. The FIFO lock is
  // not lease-based, so progress never permits a second live owner.
  if (token !== 0 && !gpriceWarmerQueue.owns(token)) {
    logger.warn({ token }, "[gprice-warmer] ownership mismatch");
  }
}
function releaseGpriceWarmer(token: number): void {
  gpriceWarmerQueue.release(token);
}

async function warmGooglePriceCache(existingToken?: number, automatic = false): Promise<void> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not configured");
  const token = existingToken ?? await waitForGpriceWarmer();
  const releaseWhenDone = existingToken == null;
  try {
    const requestStartedAt = new Date();
    const ttlMs = (await getGooglePriceTtlHours()) * 60 * 60 * 1000;
    // Refresh once < 1h of TTL remains, but never more than 20% of the TTL so a
    // small configured TTL (settings allow down to 0.25h) can't make the
    // threshold negative and trigger constant re-fetches every cycle.
    const refreshBufferMs = Math.min(60 * 60 * 1000, ttlMs * 0.2);
    const now = Date.now();
    const todayIso = new Date().toISOString().slice(0, 10);

    // Sold-out flights remain hands-off. "Përjashtuar Online" flights still
    // refresh their Google price/schedule for monitoring and list visibility.
    const flights = await db.select().from(flightsTable)
      .where(and(
        gte(flightsTable.departureDate, todayIso),
        sql`status != 'cancelled'`,
        sql`status != 'soldout'`,
        googleMonitoringEnabledSql(),
      ));
    if (!flights.length) return;

    // Pre-load all cache timestamps in one query (avoids per-flight DB hits).
    const cacheRows = await db.select({
      cacheKey: googlePriceCacheTable.cacheKey,
      fetchedAt: googlePriceCacheTable.fetchedAt,
      price: googlePriceCacheTable.price,
    }).from(googlePriceCacheTable);
    const cacheTsMap = new Map<string, number>(
      cacheRows.map(r => [r.cacheKey, new Date(r.fetchedAt).getTime()])
    );
    // Historical values are not used as current prices by computePriceWrite.
    const cachePriceMap = new Map<string, number | null>(
      cacheRows.map(r => [r.cacheKey, r.price != null ? Number(r.price) : null])
    );

    // Group flights by route+date so each (from,to,date) is fetched once.
    const byRouteDate = new Map<string, typeof flights>();
    for (const f of flights) {
      if (!f.fromCity || !f.toCity || !f.departureDate) continue;
      const key = `${f.fromCity.toUpperCase()}|${f.toCity.toUpperCase()}|${f.departureDate}`;
      const arr = byRouteDate.get(key) ?? [];
      arr.push(f);
      byRouteDate.set(key, arr);
    }

    let attempted = 0;
    let refreshed = 0;
    for (const [routeKey, queuedFlights] of byRouteDate) {
      const groupFlights = await flightsEligibleForGoogleLookup(queuedFlights);
      if (!groupFlights.length) continue;
      if (automatic && !(await isModuleEnabled("googlePrices"))) throw new Error("Google price refresh stopped: module disabled");
      beatGpriceWarmer(token);
      const [from, to, date] = routeKey.split("|");

      const needsRefresh = groupFlights.some(f => {
        const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
        const cacheKey = `${from}|${to}|${date}|${norm}`;
        const ts = googlePriceCache.get(cacheKey)?.ts ?? cacheTsMap.get(cacheKey) ?? 0;
        return now - ts >= ttlMs - refreshBufferMs;
      });
      if (!needsRefresh) continue;

      attempted++;
      const result = await fetchGoogleFlightSchedules(from, to, date);
      // Failure: null/unverified, retried by the stale scheduler.
      if (result.error) { await markGroupStale(from, to, date, groupFlights, requestStartedAt); continue; }
      const { routePrice, flightPriceMap, flights: googleFlights } = result;
      const googleCount = googleFlights.length;
      const fetchedAt = new Date();
      await upsertGooglePriceCacheEntry(`${routeKey}|`, routePrice, routePrice, false, fetchedAt.getTime(), false);

      for (const f of groupFlights) {
        const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
        const cacheKey = `${from}|${to}|${date}|${norm}`;
        const specificPrice = norm && norm in flightPriceMap ? flightPriceMap[norm] : null;
        const freshPrice = specificPrice ?? routePrice;
        // Exact current fare first, current route min next, otherwise null/verified.
        const existingPrice = googlePriceCache.get(cacheKey)?.price ?? cachePriceMap.get(cacheKey) ?? null;
        const { price, routePrice: writeRoutePrice, specific, stale } = computePriceWrite(
          { price: freshPrice, routePrice, specific: specificPrice != null }, existingPrice,
        );
        googlePriceCache.set(cacheKey, { price, routePrice: writeRoutePrice, specific, ts: fetchedAt.getTime(), stale });
        try {
          await db.insert(googlePriceCacheTable).values({
            cacheKey,
            price: price != null ? price.toString() : null,
            routePrice: writeRoutePrice != null ? writeRoutePrice.toString() : null,
            specific,
            stale,
            fetchedAt,
          }).onConflictDoUpdate({
            target: googlePriceCacheTable.cacheKey,
            set: {
              prevPrice: sql`COALESCE(${googlePriceCacheTable.price}, ${googlePriceCacheTable.prevPrice})`,
              price: price != null ? price.toString() : null,
              routePrice: writeRoutePrice != null ? writeRoutePrice.toString() : null,
              specific,
              stale,
              fetchedAt,
            },
          });
        } catch (err) {
          logger.error({ err, cacheKey }, "[gprice-warmer] failed to persist cache row");
        }

        // Same validated response, shared locked-row alert/dismissal guard.
        try {
          await applyGoogleSearchScheduleAlert(f, requestStartedAt,
            { price: specificPrice, routePrice, specific: specificPrice != null },
            scheduleEvidence(result, f));
        } catch (err) {
          logger.error({ err, flightId: f.id }, "[gprice-warmer] failed to persist schedule alert");
        }
      }
      refreshed++;
      // Gentle throttle so we don't hammer RapidAPI.
      await new Promise(r => setTimeout(r, 400));
    }
    if (attempted > 0 && refreshed === 0) {
      throw new Error(`All ${attempted} Google route-date refreshes failed`);
    }
    if (refreshed > 0) logger.info({ refreshed }, "[gprice-warmer] refreshed route-date groups");
  } catch (err) {
    logger.error({ err }, "[gprice-warmer] run failed");
    throw err;
  } finally {
    if (releaseWhenDone) releaseGpriceWarmer(token);
  }
}

let gpriceRuleApplyRunning = false;

// Re-derive each upcoming flight's REAL sale price (flights.adultPrice) from its
// cached Google Flights price using the active Google price rules. Uses cached
// prices only (no live API call), so it is safe to run frequently. Returns the
// number of flights whose price was changed. Runs after every warmer cycle and
// immediately after any rule change.
export async function applyGooglePriceRulesToFlights(
  source = "Rifreskim automatik",
  opts: { onlyFlightId?: number; onlyFlightIds?: number[]; suppressEmail?: boolean } = {},
): Promise<number> {
  // The module-level guard serializes the FULL (unscoped) runs (warmer + cron +
  // rule mutations). A single-flight manual apply (opts.onlyFlightId) must NOT be
  // blocked by it — otherwise the admin's "Përditëso çmimin nga Google" silently
  // no-ops while a warmer cycle is mid-flight. Scoped runs touch one row only and
  // read the cache fresh, so they are safe to run alongside a full cycle.
  const hasIdList = opts.onlyFlightIds != null && opts.onlyFlightIds.length > 0;
  const scoped = opts.onlyFlightId != null || hasIdList;
  if (!scoped) {
    if (gpriceRuleApplyRunning) return 0;
    gpriceRuleApplyRunning = true;
  }
  try {
    const rules = await getActiveGooglePriceRules();
    if (!rules.length) return 0;

    const todayIso = new Date().toISOString().slice(0, 10);
    const flights = await db.select().from(flightsTable)
      .where(and(
        gte(flightsTable.departureDate, todayIso),
        sql`status != 'cancelled'`,
        // "Përjashtuar Online" blocks EVERY Google-rule price write, including
        // automatic, bulk and explicit single-flight apply.
        eq(flightsTable.excludeFromGoogleRule, false),
        googleMonitoringEnabledSql(),
        // Single-flight manual refresh (admin "Përditëso çmimin nga Google")
        // restricts the recompute to one flight, reusing the exact rule logic.
        // The bulk "Updato Çmimet" ("Çmim i Ri") restricts to a set of ids.
        opts.onlyFlightId != null ? eq(flightsTable.id, opts.onlyFlightId)
          : hasIdList ? inArray(flightsTable.id, opts.onlyFlightIds!)
          : undefined,
      ));
    if (!flights.length) return 0;

    // Preload all cached Google prices once. The in-memory cache holds the
    // freshest values; the DB map is the persistent fallback after a restart.
    const cacheRows = await db.select({
      cacheKey: googlePriceCacheTable.cacheKey,
      price: googlePriceCacheTable.price,
      prevPrice: googlePriceCacheTable.prevPrice,
      stale: googlePriceCacheTable.stale,
    }).from(googlePriceCacheTable);
    const dbPriceMap = new Map(cacheRows.map(r => [r.cacheKey, r]));
    // Previous (pre-overwrite) Google price per cache key, for the change report.
    const dbPrevPriceMap = new Map<string, number | null>(
      cacheRows.map(r => [r.cacheKey, r.prevPrice != null ? Number(r.prevPrice) : null]),
    );

    const googlePriceFor = (f: typeof flights[number]): number | null => {
      if (!f.fromCity || !f.toCity || !f.departureDate) return null;
      const from = f.fromCity.toUpperCase();
      const to = f.toCity.toUpperCase();
      const date = f.departureDate;
      const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
      // Specific row is authoritative, including verified null/unverified. Never
      // fall through it into an old route fare or an older DB copy.
      const keys = [`${from}|${to}|${date}|${norm}`, `${from}|${to}|${date}|`];
      for (const k of keys) {
        const mem = googlePriceCache.get(k);
        const row = mem ?? dbPriceMap.get(k);
        if (row) return googlePriceResponse(row).price;
      }
      return null;
    };

    // OLD Google price (from before the most recent warmer overwrite). DB-only —
    // the in-memory cache doesn't keep history; the warmer persists prevPrice.
    const prevGooglePriceFor = (f: typeof flights[number]): number | null => {
      if (!f.fromCity || !f.toCity || !f.departureDate) return null;
      const from = f.fromCity.toUpperCase();
      const to = f.toCity.toUpperCase();
      const date = f.departureDate;
      const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
      const keys = [`${from}|${to}|${date}|${norm}`, `${from}|${to}|${date}|`];
      for (const k of keys) {
        if (dbPrevPriceMap.has(k)) {
          const p = dbPrevPriceMap.get(k);
          if (p != null) return p;
        }
      }
      return null;
    };

    // Synthetic request so price history attributes the change to the automation.
    const sysReq = { session: { userId: null, userName: "Auto (Google)", role: "system" }, log: logger };
    // A rule can drive the adult/child SALE price (when applyInternal) and/or the
    // OFFLINE (Citizen) price (when applyOffline) — each from its OWN independent
    // discount config. Process the two targets separately; a single rule may
    // appear in both sets.
    const internalRules = rules.filter(r => r.applyInternal !== false);
    const offlineRules = rules.filter(r => r.applyOffline);
    let updated = 0;
    let offlineUpdated = 0;
    const changeRows: PriceSyncRow[] = [];
    for (const f of flights) {
      if (await googleMonitoringDisabled(f.id)) continue;
      const g = googlePriceFor(f);
      const flightLike = {
        id: f.id, fromCity: f.fromCity, toCity: f.toCity, airline: f.airline,
        flightNumber: f.flightNumber, departureDate: f.departureDate,
      };

      // --- Internal (adult/child) sale price -------------------------------
      if (internalRules.length) {
        const rule = findGoogleRuleForFlight(internalRules, flightLike);
        if (rule) {
          // Current verified Google price → compute from it. NO current price →
          // KEEP the current sale price unchanged (target=null skips the update)
          // instead of dropping to the floor/minimum. This stops daytime swings
          // to the floor (e.g. €150) when Google momentarily returns no price for
          // a flight that already had one; the price is only ever re-evaluated at
          // the daily 02:00 refresh or via a manual "Rifresko Tani".
          // (User-requested: stability over floor.)
          const target = g != null ? computeGoogleSalePrice(g, rule) : null;
          if (target != null) {
            const targetStr = target.toString();
            // The child price must always mirror the adult price (business rule),
            // including when the automation rewrites it. Infant price is left as-is.
            const current = f.adultPrice != null ? Number(f.adultPrice) : null;
            const currentChild = f.childPrice != null ? Number(f.childPrice) : null;
            const adultMatches = current != null && Math.abs(current - target) < 0.005;
            const childMatches = currentChild != null && Math.abs(currentChild - target) < 0.005;
            if (!(adultMatches && childMatches)) {
              try {
                await db.update(flightsTable)
                  .set({ adultPrice: targetStr, childPrice: targetStr })
                  .where(and(eq(flightsTable.id, f.id), googleMonitoringEnabledSql()));
                await recordFlightPriceChange(sysReq, f, { ...f, adultPrice: targetStr, childPrice: targetStr });
                updated++;
                changeRows.push({
                  id: f.id,
                  route: `${(f.fromCity ?? "").toUpperCase()} → ${(f.toCity ?? "").toUpperCase()}`,
                  flightNumber: f.flightNumber ? String(f.flightNumber) : undefined,
                  departureDate: f.departureDate ?? undefined,
                  oldGooglePrice: prevGooglePriceFor(f),
                  googlePrice: g,
                  oldPrice: current,
                  newPrice: target,
                  status: "updated",
                });
              } catch (err) {
                logger.error({ err, flightId: f.id }, "[google-price-rules] failed to update flight price");
              }
            }
          }
        }
      }

      // --- Offline (Citizen) price -----------------------------------------
      if (offlineRules.length) {
        const rule = findGoogleRuleForFlight(offlineRules, flightLike);
        if (rule) {
          // NO Google price → keep the current offline price unchanged (same
          // stability rule as the internal sale price above).
          const target = g != null ? computeGoogleOfflinePrice(g, rule) : null;
          if (target != null) {
            const targetStr = target.toString();
            const currentCitizen = f.citizenPrice != null ? Number(f.citizenPrice) : null;
            const citizenMatches = currentCitizen != null && Math.abs(currentCitizen - target) < 0.005;
            if (!citizenMatches) {
              try {
                await db.update(flightsTable)
                  .set({ citizenPrice: targetStr })
                  .where(and(eq(flightsTable.id, f.id), googleMonitoringEnabledSql()));
                offlineUpdated++;
              } catch (err) {
                logger.error({ err, flightId: f.id }, "[google-price-rules] failed to update offline price");
              }
            }
          }
        }
      }
    }
    if (offlineUpdated > 0) {
      logger.info({ offlineUpdated }, "[google-price-rules] applied to OFFLINE (citizen) prices");
    }
    if (updated > 0) {
      logger.info({ updated }, "[google-price-rules] applied to flights");
      // Email a price-change report (HTML body + PDF + Excel) whenever a refresh
      // actually moves at least one sale price — but only if the admin-configured
      // email mode allows it (Settings → "Raport Ndryshimi Çmimesh"). The price
      // changes always apply; this only gates the notification email.
      // Fire-and-forget so it never blocks or fails the price application itself.
      // suppressEmail skips the report entirely (single-flight manual updates).
      if (!opts.suppressEmail) {
        try {
          const emailCfg = await getPriceReportEmailConfig();
          if (shouldSendPriceReport(emailCfg, source, changeRows.length)) {
            void sendPriceRefreshReport(changeRows, source).catch(err =>
              logger.error({ err }, "[google-price-rules] price report email failed"),
            );
          } else {
            logger.info(
              { mode: emailCfg.mode, source, changed: changeRows.length },
              "[google-price-rules] price report email suppressed by settings",
            );
          }
        } catch (err) {
          // If the config read fails, fall back to sending (preserve old behavior).
          logger.error({ err }, "[google-price-rules] price report config read failed; sending anyway");
          void sendPriceRefreshReport(changeRows, source).catch(e =>
            logger.error({ err: e }, "[google-price-rules] price report email failed"),
          );
        }
      }
    }
    return updated + offlineUpdated;
  } catch (err) {
    logger.error({ err }, "[google-price-rules] apply run failed");
    return 0;
  } finally {
    if (!scoped) gpriceRuleApplyRunning = false;
  }
}

export function applyGooglePriceRulesToNewFlights(flightIds: number[]): void {
  const ids = [...new Set(flightIds.filter(id => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return;
  void applyGooglePriceRulesToFlights(
    "Krijim automatik fluturimi",
    { onlyFlightIds: ids, suppressEmail: true },
  ).catch(err => {
    logger.error({ err, flightIds: ids }, "[google-price-rules] apply after flight creation failed");
  });
}

// Fire-and-forget: re-fetch any due Google prices, then re-apply the Google
// price rules so rule-driven sale prices (flights.adultPrice/childPrice) snap to
// the latest Google prices IMMEDIATELY — without waiting for the next 30-min
// warmer cycle. Used by the manual "Rifresko Tani" button and by an interval
// (TTL) change, so a manual price refresh or an interval change directly updates
// the real sale prices for every flight that has a rule.
let manualFullGoogleRefreshRunning = false;
export function kickGooglePriceRefreshAndApply(source = "Rifresko Tani"): void {
  if (manualFullGoogleRefreshRunning) {
    logger.info("[gprice] manual full refresh already queued/running");
    return;
  }
  manualFullGoogleRefreshRunning = true;
  void (async () => {
    try {
      await warmGooglePriceCache();
      await applyGooglePriceRulesToFlights(source);
    } catch (err) {
      logger.error({ err }, "[gprice] manual refresh + rule apply failed");
    } finally {
      manualFullGoogleRefreshRunning = false;
    }
  })();
  // Safety net: re-apply rules once more shortly after a manual run. The shared
  // warmer queue now waits through overlap, and this delayed pass remains a cheap,
  // cache-only, idempotent safeguard.
  setTimeout(() => {
    void applyGooglePriceRulesToFlights(source).catch(err =>
      logger.error({ err }, "[gprice] delayed rule re-apply failed"),
    );
  }, 90_000);
}

// Daily FORCED refresh (used by the 02:00 cron). Unlike the periodic warmer —
// which only re-fetches entries older than the TTL — this CLEARS the whole cache
// first, so every Google price is re-fetched fresh even if it was refreshed
// manually earlier the same day, then re-applies the price rules so sale prices
// track the new Google prices. Awaitable (not fire-and-forget) so the cron can
// log completion.
export async function runDailyForcedGooglePriceRefresh(scheduledTime = "02:00"): Promise<void> {
  if (!(await isModuleEnabled("googlePrices"))) return;
  const token = await waitForGpriceWarmer();
  try {
    // Expire timestamps, preserving internal history and candidate data. Every
    // re-fetch writes a current fare, null/verified, or null/unverified. Sale
    // prices stay unchanged whenever there is no current Google fare.
    googlePriceCache.clear();
    try {
      await db.update(googlePriceCacheTable).set({ fetchedAt: new Date(0) });
    } catch (err) {
      logger.error({ err }, "[gprice] daily forced refresh: expiring cache rows failed");
    }
    await warmGooglePriceCache(token, true);
    if (!(await isModuleEnabled("googlePrices"))) return;
    await applyGooglePriceRulesToFlights(`Rifreskim i përditshëm (${scheduledTime})`);
    logger.info({ scheduledTime }, "[gprice] daily forced refresh + rule apply done");
  } catch (err) {
    logger.error({ err }, "[gprice] daily forced refresh failed");
    throw err;
  } finally {
    releaseGpriceWarmer(token);
  }
}

// Periodic Google price auto-refresh. The recurring 30-min warm+apply cycle AND
// the post-boot warm-up were DISABLED at the user's request: they recomputed the
// real sale prices far too often, so prices kept changing throughout the day.
// Google prices now refresh ONLY via the daily forced 02:00 cron
// (runDailyForcedGooglePriceRefresh), the manual "Rifresko Tani" button
// (kickGooglePriceRefreshAndApply), and the immediate re-apply after any price-rule
// change. Kept as a logged no-op so the startup call site and a future re-enable
// stay trivial.
export function startGooglePriceWarmer(): void {
  logger.info("[gprice-warmer] periodic 30-min warmer DISABLED (only daily 02:00 cron + manual refresh active)");
}

// Force-refresh Google prices for flights that currently have NO price (the
// "Pa Çmim" set): upcoming, non-cancelled, NOT sold-out, and whose cached price
// is NULL. Ignores TTL (always re-fetches) so a price that becomes available is
// picked up on the dedicated interval. Shares the warmer guard so it never
// overlaps the main warmer (both hit RapidAPI). Returns route-date groups hit.
async function warmNoPriceFlights(automatic = false): Promise<number> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not configured");
  const token = await waitForGpriceWarmer();
  try {
    const requestStartedAt = new Date();
    const todayIso = new Date().toISOString().slice(0, 10);
    const noPriceCandidates = await db.select().from(flightsTable).where(and(
      gte(flightsTable.departureDate, todayIso),
      sql`status != 'cancelled'`,
      sql`status != 'soldout'`,
      // Verified no-price + missing rows only. Failed verifications, even with
      // price=null, belong to the separate stale scheduler/cadence.
      or(noGooglePriceSql(), missingGooglePriceSql(), verifiedNoPriceSql()),
      googleMonitoringEnabledSql(),
    ));
    const flights = await flightsEligibleForGoogleLookup(noPriceCandidates);
    if (!flights.length) return 0;

    // History is never substituted for the current search result.
    const cacheRows = await db.select({
      cacheKey: googlePriceCacheTable.cacheKey,
      price: googlePriceCacheTable.price,
    }).from(googlePriceCacheTable);
    const cachePriceMap = new Map<string, number | null>(
      cacheRows.map(r => [r.cacheKey, r.price != null ? Number(r.price) : null])
    );

    const byRouteDate = new Map<string, typeof flights>();
    for (const f of flights) {
      if (!f.fromCity || !f.toCity || !f.departureDate) continue;
      const key = `${f.fromCity.toUpperCase()}|${f.toCity.toUpperCase()}|${f.departureDate}`;
      const arr = byRouteDate.get(key) ?? [];
      arr.push(f);
      byRouteDate.set(key, arr);
    }

    let refreshed = 0;
    for (const [routeKey, queuedFlights] of byRouteDate) {
      const groupFlights = await flightsEligibleForGoogleLookup(queuedFlights);
      if (!groupFlights.length) continue;
      if (automatic && !(await isModuleEnabled("googlePrices"))) throw new Error("No-price refresh stopped: module disabled");
      beatGpriceWarmer(token);
      const [from, to, date] = routeKey.split("|");
      const result = await fetchGoogleFlightSchedules(from, to, date);
      // Failure writes null/unverified, including previously missing rows.
      if (result.error) { await markGroupStale(from, to, date, groupFlights, requestStartedAt); continue; }
      const { routePrice, flightPriceMap } = result;
      const fetchedAt = new Date();
      await upsertGooglePriceCacheEntry(`${routeKey}|`, routePrice, routePrice, false, fetchedAt.getTime(), false);
      for (const f of groupFlights) {
        const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
        const cacheKey = `${from}|${to}|${date}|${norm}`;
        const specificPrice = norm && norm in flightPriceMap ? flightPriceMap[norm] : null;
        const freshPrice = specificPrice ?? routePrice;
        const existingPrice = googlePriceCache.get(cacheKey)?.price ?? cachePriceMap.get(cacheKey) ?? null;
        const { price, routePrice: writeRoutePrice, specific, stale } = computePriceWrite(
          { price: freshPrice, routePrice, specific: specificPrice != null }, existingPrice,
        );
        googlePriceCache.set(cacheKey, { price, routePrice: writeRoutePrice, specific, ts: fetchedAt.getTime(), stale });
        try {
          await db.insert(googlePriceCacheTable).values({
            cacheKey,
            price: price != null ? price.toString() : null,
            routePrice: writeRoutePrice != null ? writeRoutePrice.toString() : null,
            specific,
            stale,
            fetchedAt,
          }).onConflictDoUpdate({
            target: googlePriceCacheTable.cacheKey,
            set: {
              prevPrice: sql`COALESCE(${googlePriceCacheTable.price}, ${googlePriceCacheTable.prevPrice})`,
              price: price != null ? price.toString() : null,
              routePrice: writeRoutePrice != null ? writeRoutePrice.toString() : null,
              specific,
              stale,
              fetchedAt,
            },
          });
        } catch (err) {
          logger.error({ err, cacheKey }, "[noprice-warmer] failed to persist cache row");
        }
        await applyGoogleSearchScheduleAlert(f, requestStartedAt,
          { price: specificPrice, routePrice, specific: specificPrice != null },
          scheduleEvidence(result, f));
      }
      refreshed++;
      await new Promise(r => setTimeout(r, 400));
    }
    if (byRouteDate.size > 0 && refreshed === 0) {
      throw new Error(`All ${byRouteDate.size} no-price route-date refreshes failed`);
    }
    if (refreshed > 0) logger.info({ refreshed }, "[noprice-warmer] refreshed no-price route-date groups");
    return refreshed;
  } catch (err) {
    logger.error({ err }, "[noprice-warmer] run failed");
    throw err;
  } finally {
    releaseGpriceWarmer(token);
  }
}

// Manual "run now" for the no-price check (used by Settings). Re-fetches the
// no-price flights then re-applies the price rules so any newly found price is
// reflected in the real sale price, and records the run timestamp.
export async function runNoPriceCheckNow(): Promise<{ refreshed: number }> {
  const refreshed = await warmNoPriceFlights();
  await writeSetting(NO_PRICE_CHECK_LASTRUN_KEY, new Date().toISOString());
  // Manual "Kontrollo Tani" → explicit MANUAL source (no "automatik" substring)
  // so the price-report email "daily_manual" mode treats it as a manual refresh.
  if (refreshed > 0) await applyGooglePriceRulesToFlights("Kontroll manual (Pa Çmim)");
  return { refreshed };
}

// Dedicated scheduler for the "Pa Çmim" flights. Ticks every minute and runs
// when the configured interval (default 30 min) has elapsed since the last run.
// Reading settings each tick lets config changes apply without a restart.
export function startNoPriceWarmer(): void {
  const TICK_MS = 60 * 1000;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      if (!(await isModuleEnabled("googlePrices"))) return;
      const cfg = await getNoPriceCheckConfig();
      if (!cfg.enabled) return;
      const last = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0;
      const dueAt = last + cfg.intervalMinutes * 60 * 1000;
      if (Date.now() < dueAt) return;
      const refreshed = await warmNoPriceFlights(true);
      if (!(await isModuleEnabled("googlePrices"))) return;
      await writeSetting(NO_PRICE_CHECK_LASTRUN_KEY, new Date().toISOString());
      // Scheduler tick → explicit AUTOMATIC source (contains "automatik") so the
      // price-report email "daily_manual" mode suppresses these periodic runs.
      if (refreshed > 0) await applyGooglePriceRulesToFlights("Rifreskim automatik (Pa Çmim)");
    } catch (err) {
      logger.error({ err }, "[noprice-warmer] scheduler tick failed");
    } finally {
      running = false;
    }
  };
  setTimeout(() => { void tick(); }, 45_000);
  setInterval(() => { void tick(); }, TICK_MS);
  logger.info("[noprice-warmer] scheduled (every minute, runs per configured interval; default 5min)");
}

// Force-refresh only flights whose saved Google price is flagged stale. Route/date
// grouping keeps the number of RapidAPI requests bounded when many flights share
// the same search.
async function processStalePriceFlights(
  progress?: { total: number; done: number; refreshed: number },
  ownerToken = 0,
  automatic = false,
): Promise<number> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not configured");
  try {
    const requestStartedAt = new Date();
    const todayIso = new Date().toISOString().slice(0, 10);
    const staleCandidates = await db.select().from(flightsTable).where(and(
      gte(flightsTable.departureDate, todayIso),
      sql`(${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime}) > to_char(NOW() AT TIME ZONE 'Europe/Tirane', 'YYYY-MM-DD HH24:MI')`,
      sql`status != 'cancelled'`,
      sql`status != 'soldout'`,
      staleGooglePriceSql(),
    ));
    const candidates = await flightsEligibleForGoogleLookup(staleCandidates);
    const cfg = await getStalePriceCheckConfig();
    const retryRows = candidates.length
      ? await db.select().from(settingsTable).where(inArray(settingsTable.key, candidates.map(f => retryKey(f.id))))
      : [];
    const retries = new Map(retryRows.map(row => [row.key, row.value]));
    const flights: typeof candidates = [];
    for (const f of candidates) {
      const identity = JSON.stringify([normFlightNum(f.fromCity), normFlightNum(f.toCity),
        normFlightNum(f.flightNumber ?? ""), f.departureDate, f.departureTime, f.arrivalTime, f.arrivalDate]);
      const retry = readPriceRetry(retries.get(retryKey(f.id)), identity);
      if (retry && requestStartedAt.getTime() < retry.checkedAt + cfg.intervalMinutes * 60_000) continue;
      flights.push(f);
    }
    if (!flights.length) return 0;

    const cacheRows = await db.select({
      cacheKey: googlePriceCacheTable.cacheKey,
      price: googlePriceCacheTable.price,
    }).from(googlePriceCacheTable);
    const cachePriceMap = new Map<string, number | null>(
      cacheRows.map(r => [r.cacheKey, r.price != null ? Number(r.price) : null])
    );

    const byRouteDate = new Map<string, typeof flights>();
    for (const f of flights) {
      if (!f.fromCity || !f.toCity || !f.departureDate) continue;
      const key = `${f.fromCity.toUpperCase()}|${f.toCity.toUpperCase()}|${f.departureDate}`;
      const arr = byRouteDate.get(key) ?? [];
      arr.push(f);
      byRouteDate.set(key, arr);
    }
    if (progress) progress.total = byRouteDate.size;

    let refreshed = 0;
    for (const [routeKey, queuedFlights] of byRouteDate) {
      const groupFlights = await flightsEligibleForGoogleLookup(queuedFlights);
      if (!groupFlights.length) continue;
      if (automatic && !(await isModuleEnabled("googlePrices"))) throw new Error("Stale-price refresh stopped: module disabled");
      if (ownerToken) beatGpriceWarmer(ownerToken);
      const [from, to, date] = routeKey.split("|");
      const result = await fetchGoogleFlightSchedules(from, to, date);
      if (automatic && !(await isModuleEnabled("googlePrices"))) throw new Error("Stale-price refresh stopped: module disabled");
      if (result.error) {
        for (const f of groupFlights) {
          await applyGoogleSearchScheduleAlert(f, requestStartedAt,
            { price: null, routePrice: null, specific: false, error: true },
            undefined, db, cfg.intervalMinutes);
        }
        // Failed attempts still complete this scheduled pass; do not retry them
        // every scheduler tick instead of observing the configured interval.
        refreshed++;
        if (progress) { progress.done++; progress.refreshed = refreshed; }
        continue;
      }
      const { routePrice, flightPriceMap } = result;
      const fetchedAt = new Date();
      await upsertGooglePriceCacheEntry(`${routeKey}|`, routePrice, routePrice, false, fetchedAt.getTime(), false);
      for (const f of groupFlights) {
        const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
        const cacheKey = `${from}|${to}|${date}|${norm}`;
        const specificPrice = norm && norm in flightPriceMap ? flightPriceMap[norm] : null;
        const freshPrice = specificPrice ?? routePrice;
        const existingPrice = googlePriceCache.get(cacheKey)?.price ?? cachePriceMap.get(cacheKey) ?? null;
        const write = computePriceWrite(
          { price: freshPrice, routePrice, specific: specificPrice != null },
          existingPrice,
        );
        googlePriceCache.set(cacheKey, {
          price: write.price,
          routePrice: write.routePrice,
          specific: write.specific,
          ts: fetchedAt.getTime(),
          stale: write.stale,
        });
        try {
          await db.insert(googlePriceCacheTable).values({
            cacheKey,
            price: write.price != null ? write.price.toString() : null,
            routePrice: write.routePrice != null ? write.routePrice.toString() : null,
            specific: write.specific,
            stale: write.stale,
            fetchedAt,
          }).onConflictDoUpdate({
            target: googlePriceCacheTable.cacheKey,
            set: {
              prevPrice: sql`COALESCE(${googlePriceCacheTable.price}, ${googlePriceCacheTable.prevPrice})`,
              price: write.price != null ? write.price.toString() : null,
              routePrice: write.routePrice != null ? write.routePrice.toString() : null,
              specific: write.specific,
              stale: write.stale,
              fetchedAt,
            },
          });
        } catch (err) {
          logger.error({ err, cacheKey }, "[stale-price-warmer] failed to persist cache row");
        }
        await applyGoogleSearchScheduleAlert(f, requestStartedAt,
          { price: specificPrice, routePrice, specific: specificPrice != null },
          scheduleEvidence(result, f), db, cfg.intervalMinutes);
      }
      refreshed++;
      if (progress) {
        progress.done++;
        progress.refreshed = refreshed;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    if (byRouteDate.size > 0 && refreshed === 0) {
      throw new Error(`All ${byRouteDate.size} stale-price route-date refreshes failed`);
    }
    if (refreshed > 0) {
      notifyDataChanged("flights");
      logger.info({ refreshed }, "[stale-price-warmer] completed stale route-date checks (including failed attempts)");
    }
    return refreshed;
  } catch (err) {
    logger.error({ err }, "[stale-price-warmer] run failed");
    throw err;
  }
}

async function warmStalePriceFlights(
  progress?: { total: number; done: number; refreshed: number },
  automatic = false,
): Promise<number> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not configured");
  const token = await waitForGpriceWarmer();
  try {
    return await processStalePriceFlights(progress, token, automatic);
  } finally {
    releaseGpriceWarmer(token);
  }
}

let manualStalePriceRunning = false;
export const stalePriceRunProgress = {
  running: false,
  total: 0,
  done: 0,
  refreshed: 0,
  startedAt: null as string | null,
  finishedAt: null as string | null,
};

export async function runStalePriceCheckNow(): Promise<{ started: boolean; busy: boolean; startedAt?: string | null }> {
  if (manualStalePriceRunning) return { started: false, busy: true };
  if (!process.env.RAPIDAPI_KEY) return { started: false, busy: false };

  manualStalePriceRunning = true;
  stalePriceRunProgress.running = true;
  stalePriceRunProgress.total = 0;
  stalePriceRunProgress.done = 0;
  stalePriceRunProgress.refreshed = 0;
  stalePriceRunProgress.startedAt = new Date().toISOString();
  stalePriceRunProgress.finishedAt = null;

  void (async () => {
    try {
      const refreshed = await warmStalePriceFlights(stalePriceRunProgress);
      await writeSetting(STALE_PRICE_CHECK_LASTRUN_KEY, new Date().toISOString());
      if (refreshed > 0) await applyGooglePriceRulesToFlights("Kontroll manual (Çmim i Vjetër)");
    } catch (err) {
      logger.error({ err }, "[stale-price-warmer] manual run failed");
    } finally {
      manualStalePriceRunning = false;
      stalePriceRunProgress.running = false;
      stalePriceRunProgress.finishedAt = new Date().toISOString();
    }
  })();

  return { started: true, busy: false, startedAt: stalePriceRunProgress.startedAt };
}

export function startStalePriceWarmer(): void {
  const TICK_MS = 60 * 1000;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      if (!(await isModuleEnabled("googlePrices"))) return;
      const cfg = await getStalePriceCheckConfig();
      if (!cfg.enabled) return;
      const last = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0;
      if (Date.now() < last + cfg.intervalMinutes * 60 * 1000) return;
      const refreshed = await warmStalePriceFlights(undefined, true);
      if (!(await isModuleEnabled("googlePrices"))) return;
      await writeSetting(STALE_PRICE_CHECK_LASTRUN_KEY, new Date().toISOString());
      if (refreshed > 0) await applyGooglePriceRulesToFlights("Rifreskim automatik (Çmim i Vjetër)");
    } catch (err) {
      logger.error({ err }, "[stale-price-warmer] scheduler tick failed");
    } finally {
      running = false;
    }
  };
  setTimeout(() => { void tick(); }, 50_000);
  setInterval(() => { void tick(); }, TICK_MS);
  logger.info("[stale-price-warmer] scheduled (every minute, runs per configured interval; default 60min)");
}

// ── "Të Aferta" (soon) price warmer ──────────────────────────────────────────
// Re-fetch LIVE Google prices for flights departing within the configured
// "upcoming_days" window (the "Të Aferta" set): upcoming, non-cancelled, NOT
// sold-out. Ignores TTL (always re-fetches) so the configured minute interval is
// the sole cadence. Shares the warmer guard so it never overlaps the other
// Google-price warmers (all hit RapidAPI). Returns route-date groups hit.
export async function warmSoonFlights(daysOverride?: number, moduleControlled = false): Promise<number> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not configured");
  const token = await waitForGpriceWarmer();
  try {
    const requestStartedAt = new Date();
    const days = (() => {
      if (daysOverride != null && Number.isFinite(daysOverride) && daysOverride >= 1) return Math.floor(daysOverride);
      return 7;
    })();
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const end = new Date(today); end.setDate(end.getDate() + days);
    const endIso = end.toISOString().slice(0, 10);
    const flights = await flightsEligibleForGoogleLookup(
      await db.select().from(flightsTable).where(and(
        gte(flightsTable.departureDate, todayIso),
        lte(flightsTable.departureDate, endIso),
        sql`status != 'cancelled'`,
        sql`status != 'soldout'`,
      ))
    );
    if (!flights.length) return 0;

    // History is never substituted for the current search result.
    const cacheRows = await db.select({
      cacheKey: googlePriceCacheTable.cacheKey,
      price: googlePriceCacheTable.price,
    }).from(googlePriceCacheTable);
    const cachePriceMap = new Map<string, number | null>(
      cacheRows.map(r => [r.cacheKey, r.price != null ? Number(r.price) : null])
    );

    const byRouteDate = new Map<string, typeof flights>();
    for (const f of flights) {
      if (!f.fromCity || !f.toCity || !f.departureDate) continue;
      const key = `${f.fromCity.toUpperCase()}|${f.toCity.toUpperCase()}|${f.departureDate}`;
      const arr = byRouteDate.get(key) ?? [];
      arr.push(f);
      byRouteDate.set(key, arr);
    }

    let refreshed = 0;
    for (const [routeKey, queuedFlights] of byRouteDate) {
      const groupFlights = await flightsEligibleForGoogleLookup(queuedFlights);
      if (!groupFlights.length) continue;
      beatGpriceWarmer(token);
      const [from, to, date] = routeKey.split("|");
      const result = moduleControlled
        ? await fetchWhileEnabled(
          () => isModuleEnabled("googlePrices"),
          () => fetchGoogleFlightSchedules(from, to, date),
          "Seat-check optional price refresh",
        )
        : await fetchGoogleFlightSchedules(from, to, date);
      // Failure writes null/unverified, including previously missing rows.
      if (result.error) { await markGroupStale(from, to, date, groupFlights, requestStartedAt); continue; }
      const { routePrice, flightPriceMap } = result;
      const fetchedAt = new Date();
      await upsertGooglePriceCacheEntry(`${routeKey}|`, routePrice, routePrice, false, fetchedAt.getTime(), false);
      for (const f of groupFlights) {
        const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
        const cacheKey = `${from}|${to}|${date}|${norm}`;
        const specificPrice = norm && norm in flightPriceMap ? flightPriceMap[norm] : null;
        const freshPrice = specificPrice ?? routePrice;
        const existingPrice = googlePriceCache.get(cacheKey)?.price ?? cachePriceMap.get(cacheKey) ?? null;
        const { price, routePrice: writeRoutePrice, specific, stale } = computePriceWrite(
          { price: freshPrice, routePrice, specific: specificPrice != null }, existingPrice,
        );
        googlePriceCache.set(cacheKey, { price, routePrice: writeRoutePrice, specific, ts: fetchedAt.getTime(), stale });
        try {
          await db.insert(googlePriceCacheTable).values({
            cacheKey,
            price: price != null ? price.toString() : null,
            routePrice: writeRoutePrice != null ? writeRoutePrice.toString() : null,
            specific,
            stale,
            fetchedAt,
          }).onConflictDoUpdate({
            target: googlePriceCacheTable.cacheKey,
            set: {
              prevPrice: sql`COALESCE(${googlePriceCacheTable.price}, ${googlePriceCacheTable.prevPrice})`,
              price: price != null ? price.toString() : null,
              routePrice: writeRoutePrice != null ? writeRoutePrice.toString() : null,
              specific,
              stale,
              fetchedAt,
            },
          });
        } catch (err) {
          logger.error({ err, cacheKey }, "[soon-warmer] failed to persist cache row");
        }
        await applyGoogleSearchScheduleAlert(f, requestStartedAt,
          { price: specificPrice, routePrice, specific: specificPrice != null },
          scheduleEvidence(result, f));
      }
      refreshed++;
      await new Promise(r => setTimeout(r, 400));
    }
    if (byRouteDate.size > 0 && refreshed === 0) {
      throw new Error(`All ${byRouteDate.size} soon-price route-date refreshes failed`);
    }
    if (refreshed > 0) logger.info({ refreshed }, "[soon-warmer] refreshed soon route-date groups");
    return refreshed;
  } catch (err) {
    logger.error({ err }, "[soon-warmer] run failed");
    throw err;
  } finally {
    releaseGpriceWarmer(token);
  }
}

// ── "Çmim i Ri" candidate warmer ─────────────────────────────────────────────
// Auto-fetch a LIVE Google price for ALL upcoming, non-cancelled flights and
// store it as a DISPLAY-ONLY candidate (candidate_price/candidate_at). It writes
// ONLY the candidate columns — it NEVER touches `price` (the value the sale-price
// rules read) and NEVER calls applyGooglePriceRulesToFlights. The admin reviews
// the candidates in the "Çmim i Ri" tab and promotes selected ones via the bulk
// apply. Batches by route-date and shares the warmer guard (RapidAPI).
// Core candidate refresh: group the given flights by route+date, fetch Google once
// per group, and persist ONLY the candidate columns (saved price untouched). No
// guard / key check here — callers own those so the same logic serves both the
// full warmer and the selected-flights refresh.
async function processCandidateGroups(
  flights: (typeof flightsTable.$inferSelect)[],
  ownerToken = 0,
  progress?: { total: number; done: number; refreshed: number },
  automatic = false,
  observer?: NewPriceProgress,
): Promise<number> {
  flights = await flightsEligibleForGoogleLookup(flights);
  if (!flights.length) return 0;

  const byRouteDate = new Map<string, typeof flights>();
  for (const f of flights) {
    if (!f.fromCity || !f.toCity || !f.departureDate) continue;
    const key = `${f.fromCity.toUpperCase()}|${f.toCity.toUpperCase()}|${f.departureDate}`;
    const arr = byRouteDate.get(key) ?? [];
    arr.push(f);
    byRouteDate.set(key, arr);
  }
  if (progress) progress.total = byRouteDate.size;
  observer?.publish();

  let refreshed = 0;
  let processedGroups = 0;
  for (const [routeKey, queuedFlights] of byRouteDate) {
    // The preceding group's fetch, candidate writes and monitoring are ALL
    // finished here, including error paths. Resume only after reacquiring the
    // same lease; never overlap live writers or drop scheduled checks.
    if (processedGroups++ > 0 && ownerToken) {
      observer?.phase("waiting");
      await gpriceWarmerQueue.yield(ownerToken);
    }
    observer?.phase("checking");
    const groupFlights = await flightsEligibleForGoogleLookup(queuedFlights);
    if (!groupFlights.length) { if (progress) progress.done++; observer?.publish(); continue; }
    if (automatic && !(await isModuleEnabled("googlePrices"))) throw new Error("New-price refresh stopped: module disabled");
    beatGpriceWarmer(ownerToken);
    const [from, to, date] = routeKey.split("|");
    const requestStartedAt = new Date();
    const result = await fetchGoogleFlightSchedules(from, to, date);
    // On failure keep the previous candidate (don't wipe it on a transient error).
    if (result.error) {
      await monitorNewPriceGroup(groupFlights, result, requestStartedAt, {
        fetchSeats: fetchGoogleSeatAvailability, getConfig: getSeatCheckConfig,
      });
      if (progress) progress.done++;
      observer?.publish();
      continue;
    }
    const { routePrice, flightPriceMap } = result;
    const candidateAt = new Date();
    for (const f of groupFlights) {
      const norm = f.flightNumber ? normFlightNum(String(f.flightNumber)) : "";
      const cacheKey = `${from}|${to}|${date}|${norm}`;
      const specificPrice = norm && norm in flightPriceMap ? flightPriceMap[norm] : null;
      const candidate = specificPrice ?? routePrice ?? null;
      try {
        // Write ONLY the candidate columns. onConflictDoUpdate omits price/stale/
        // prevPrice/fetchedAt so an existing saved price is preserved untouched.
        await db.insert(googlePriceCacheTable).values({
          cacheKey,
          candidatePrice: candidate != null ? candidate.toString() : null,
          candidateAt,
        }).onConflictDoUpdate({
          target: googlePriceCacheTable.cacheKey,
          set: {
            candidatePrice: candidate != null ? candidate.toString() : null,
            candidateAt,
          },
        });
      } catch (err) {
        logger.error({ err, cacheKey }, "[newprice-warmer] failed to persist candidate");
      }
    }
    // Same selected flights and same configured candidate refresh, including
    // manual refreshes. Schedule data is reused; seats need one N-person query.
    await monitorNewPriceGroup(groupFlights, result, requestStartedAt, {
      fetchSeats: fetchGoogleSeatAvailability, getConfig: getSeatCheckConfig,
    });
    beatGpriceWarmer(ownerToken);
    refreshed++;
    if (progress) { progress.done++; progress.refreshed = refreshed; }
    observer?.publish();
    await new Promise(r => setTimeout(r, 400));
  }
  if (byRouteDate.size > 0 && refreshed === 0) {
    throw new Error(`All ${byRouteDate.size} candidate route-date refreshes failed`);
  }
  if (refreshed > 0) logger.info({ refreshed }, "[newprice-warmer] refreshed candidate route-date groups");
  return refreshed;
}

export const automaticNewPriceProgress = new NewPriceProgress(() => notifyDataChanged("newprice_progress"));

async function warmNewPriceCandidates(): Promise<number> {
  if (!process.env.RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not configured");
  const token = await waitForGpriceWarmer();
  automaticNewPriceProgress.phase("checking");
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const flights = await db.select().from(flightsTable).where(and(
      gte(flightsTable.departureDate, todayIso),
      sql`status != 'cancelled'`,
    ));
    return await processCandidateGroups(flights, token, automaticNewPriceProgress.state, true, automaticNewPriceProgress);
  } catch (err) {
    logger.error({ err }, "[newprice-warmer] run failed");
    throw err;
  } finally {
    releaseGpriceWarmer(token);
  }
}

// Manual candidate refreshes ("Rifresko" → Të gjitha / Të zgjedhurat) use their
// own duplicate-click guard and also wait in the shared FIFO warmer queue. This
// avoids overlapping live writers while preserving visible background progress.
// DISPLAY-ONLY: candidate columns only.
let manualNewPriceRunning = false;

// Progres i dukshëm për rifreskimet manuale "Çmim i Ri". Rifreskimi i plotë mund
// të zgjasë shumë minuta (radha e përbashkët RapidAPI ≈ 50 thirrje/min), ndaj
// kërkesa HTTP e nis punën në SFOND dhe kthehet menjëherë; frontend-i ndjek
// progresin me GET /settings/new-price-check/progress derisa running=false.
// (Më parë kërkesa priste deri në fund → proxy e priste lidhjen pas ~2 min dhe
// rifreskimi dukej sikur "ndalonte në mes".)
export const newPriceRunProgress = {
  running: false,
  total: 0,
  done: 0,
  refreshed: 0,
  startedAt: null as string | null,
  finishedAt: null as string | null,
};

function runNewPriceJob(loadFlights: () => Promise<(typeof flightsTable.$inferSelect)[]>, recordLastRun: boolean, label: string): void {
  // Caller has already set manualNewPriceRunning = true.
  newPriceRunProgress.running = true;
  newPriceRunProgress.total = 0;
  newPriceRunProgress.done = 0;
  newPriceRunProgress.refreshed = 0;
  newPriceRunProgress.startedAt = new Date().toISOString();
  newPriceRunProgress.finishedAt = null;
  void (async () => {
    try {
      const flights = await loadFlights();
      const token = await waitForGpriceWarmer();
      try {
        await processCandidateGroups(flights, token, newPriceRunProgress);
      } finally {
        releaseGpriceWarmer(token);
      }
      if (recordLastRun) await writeSetting(NEW_PRICE_CHECK_LASTRUN_KEY, new Date().toISOString());
    } catch (err) {
      logger.error({ err }, `[newprice-warmer] ${label} run failed`);
    } finally {
      manualNewPriceRunning = false;
      newPriceRunProgress.running = false;
      newPriceRunProgress.finishedAt = new Date().toISOString();
    }
  })();
}

// Manual "Rifresko të Zgjedhurat": refresh candidate prices for a specific set of
// flight IDs only (the selected rows on the "Çmim i Ri" tab). Kicks a BACKGROUND
// job and returns immediately; poll newPriceRunProgress for completion.
export async function runNewPriceCheckForIds(flightIds: number[]): Promise<{ started: boolean; busy: boolean; startedAt?: string | null }> {
  if (!flightIds.length) return { started: false, busy: false };
  if (manualNewPriceRunning) return { started: false, busy: true };
  if (!process.env.RAPIDAPI_KEY) return { started: false, busy: false };
  manualNewPriceRunning = true;
  runNewPriceJob(
    () => db.select().from(flightsTable).where(and(
      inArray(flightsTable.id, flightIds),
      sql`status != 'cancelled'`,
    )),
    false,
    "selected",
  );
  return { started: true, busy: false, startedAt: newPriceRunProgress.startedAt };
}

// Manual "Rifresko Tani" for the "Çmim i Ri" candidates (Settings + tab button).
// DISPLAY-ONLY: re-fetches the live candidates and records the run timestamp. It
// deliberately does NOT apply rules — promotion happens only via the bulk apply.
// Kicks a BACKGROUND job and returns immediately; poll newPriceRunProgress.
export async function runNewPriceCheckNow(): Promise<{ started: boolean; busy: boolean; startedAt?: string | null }> {
  if (manualNewPriceRunning) return { started: false, busy: true };
  if (!process.env.RAPIDAPI_KEY) return { started: false, busy: false };
  manualNewPriceRunning = true;
  const todayIso = new Date().toISOString().slice(0, 10);
  runNewPriceJob(
    () => db.select().from(flightsTable).where(and(
      gte(flightsTable.departureDate, todayIso),
      sql`status != 'cancelled'`,
    )),
    true,
    "manual",
  );
  return { started: true, busy: false, startedAt: newPriceRunProgress.startedAt };
}

// Dedicated scheduler for the "Çmim i Ri" candidates. Ticks every minute and runs
// when the configured interval (default 30 min) has elapsed. DISPLAY-ONLY: writes
// candidate prices only and NEVER recomputes the real sale price.
export function startNewPriceWarmer(): void {
  const TICK_MS = 60 * 1000;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      if (!(await isModuleEnabled("googlePrices"))) return;
      const cfg = await getNewPriceCheckConfig();
      if (!cfg.enabled) return;
      const last = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0;
      const dueAt = last + cfg.intervalMinutes * 60 * 1000;
      if (Date.now() < dueAt) return;
      automaticNewPriceProgress.start();
      try {
        await warmNewPriceCandidates();
        if (!(await isModuleEnabled("googlePrices"))) {
          automaticNewPriceProgress.finish(true);
          return;
        }
        await writeSetting(NEW_PRICE_CHECK_LASTRUN_KEY, new Date().toISOString());
        automaticNewPriceProgress.finish();
      } catch (err) {
        automaticNewPriceProgress.finish(true);
        throw err;
      }
    } catch (err) {
      logger.error({ err }, "[newprice-warmer] scheduler tick failed");
    } finally {
      running = false;
    }
  };
  setTimeout(() => { void tick(); }, 75_000);
  setInterval(() => { void tick(); }, TICK_MS);
  logger.info("[newprice-warmer] scheduled (every minute, runs per configured interval; default 30min)");
}

// ── POST /flights/schedule-check ─────────────────────────────────────────────
router.post("/flights/schedule-check", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }

  const { from, to, startDate, endDate, flightNumber: reqFlightNum } = req.body;
  if (!from || !to || !startDate || !endDate) {
    res.status(400).json({ error: "from, to, startDate, endDate required" }); return;
  }

  // Build WHERE conditions — if a specific flight number is given filter by it too
  const whereConditions: any[] = [
    ilike(flightsTable.fromCity, from.trim()),
    ilike(flightsTable.toCity,   to.trim()),
    gte(flightsTable.departureDate, startDate),
    lte(flightsTable.departureDate, endDate),
    sql`status != 'cancelled'`,
  ];
  if (reqFlightNum) {
    whereConditions.push(ilike(flightsTable.flightNumber, `%${reqFlightNum.trim()}%`));
  }

  // Fetch all DB flights for this route + date range (non-cancelled)
  const dbFlights = await flightsEligibleForGoogleLookup(
    await db.select().from(flightsTable)
      .where(and(...whereConditions))
      .orderBy(flightsTable.departureDate, asc(flightsTable.departureTime))
  );

  if (!dbFlights.length) {
    res.json({ results: [], total: 0, from, to, startDate, endDate }); return;
  }

  // Group by date to minimise API calls (1 call per date instead of 1 per flight)
  const byDate: Record<string, typeof dbFlights> = {};
  for (const f of dbFlights) {
    if (!byDate[f.departureDate]) byDate[f.departureDate] = [];
    byDate[f.departureDate].push(f);
  }

  const results: Array<{
    id: number; flightNumber: string; airline: string; departureDate: string;
    ourDepartureTime: string; ourArrivalTime: string; ourArrivalDate: string;
    googleDepartureDate: string | null; googleArrivalDate: string | null;
    googleDepartureTime: string | null; googleArrivalTime: string | null;
    status: string; changes: Array<{ field: string; old: string; new: string }>;
    googleRaw: number;
    ourPrice: number | null;
    googlePrice: number | null;
  }> = [];

  const newFlights: Array<{
    flightNumber: string; airline: string; departureDate: string;
    departureTime: string; arrivalTime: string;
    fromCity: string; toCity: string; googlePrice: number | null;
  }> = [];

  for (const [date, flights] of Object.entries(byDate)) {
    const startedAt = new Date();
    const search = await fetchGoogleFlightSchedules(from.trim(), to.trim(), date);
    const { flights: googleFlights, routePrice, flightPriceMap } = search;
    const googleCount = googleFlights.length;
    const matchedGoogleNums = new Set<string>();

    for (const flight of flights) {
      const myNum = normFlightNum(flight.flightNumber || "");
      const match = matchingGoogleSchedule(googleFlights, flight);
      const exactPrice = flightPriceMap[myNum] ?? null;
      await applyGoogleSearchScheduleAlert(flight, startedAt,
        { price: exactPrice, routePrice, specific: exactPrice != null, error: !!search.error },
        scheduleEvidence(search, flight));
      if (match) matchedGoogleNums.add(match.flightNumber);

      const changes: Array<{ field: string; old: string; new: string }> = [];
      let status = "unchanged";

      if (!match) {
        status = googleCount === 0 ? "api_empty" : "not_found";
      } else {
        changes.push(...googleScheduleChanges(flight, match));
        status = changes.length > 0 ? "time_changed" : "unchanged";
      }

      // Use flight-specific price when available, fall back to route-level minimum
      const specificPrice = myNum && myNum in flightPriceMap ? flightPriceMap[myNum] : null;
      const googlePrice   = specificPrice ?? routePrice;

      results.push({
        id: flight.id,
        flightNumber: flight.flightNumber,
        airline: flight.airline,
        departureDate: flight.departureDate,
        ourDepartureTime: flight.departureTime,
        ourArrivalTime:   flight.arrivalTime,
        ourArrivalDate: flight.arrivalDate,
        googleDepartureDate: match?.departureDate ?? null,
        googleArrivalDate: match?.arrivalDate ?? null,
        googleDepartureTime: match ? match.departureTime : null,
        googleArrivalTime:   match ? match.arrivalTime   : null,
        status,
        changes,
        googleRaw: googleCount,
        ourPrice: flight.adultPrice != null ? Number(flight.adultPrice) : null,
        googlePrice,
      });
    }

    // Collect Google flights that have NO matching flight in our DB for this date
    const reqNorm = reqFlightNum ? normFlightNum(reqFlightNum.trim()) : null;
    for (const gf of googleFlights) {
      if (matchedGoogleNums.has(gf.flightNumber)) continue;
      // If caller filtered by flight number, only include that one
      if (reqNorm && gf.flightNumber !== reqNorm) continue;
      newFlights.push({
        flightNumber: gf.flightNumber,
        airline: gf.airline || "",
        departureDate: date,
        departureTime: gf.departureTime,
        arrivalTime:   gf.arrivalTime,
        fromCity: from.trim(),
        toCity:   to.trim(),
        googlePrice: routePrice,
      });
    }
  }

  res.json({ results, total: results.length, from, to, startDate, endDate, newFlights });
});

// ── Schedule report helpers ────────────────────────────────────────────────────

type ScheduleResult = {
  id: number; flightNumber: string; airline: string; departureDate: string;
  ourDepartureTime: string; ourArrivalTime: string;
  googleDepartureTime: string | null; googleArrivalTime: string | null;
  status: string; changes: Array<{ field: string; old: string; new: string }>;
  googleRaw: number;
  ourPrice: number | null;
  googlePrice: number | null;
  route?: string;
};

const STATUS_LABELS: Record<string, string> = {
  unchanged:    "I pandryshuar",
  time_changed: "Orari ndryshoi",
  not_found:    "Nuk gjendet",
  api_empty:    "API pa rezultat",
};

async function generateScheduleExcel(
  results: ScheduleResult[], from: string, to: string, startDate: string, endDate: string
): Promise<Buffer> {
  const hasRoute = results.some(r => r.route);
  const wb = new ExcelJS.Workbook();
  wb.creator = "FMS Pro";
  const ws = wb.addWorksheet(`${from}${to ? "-" + to : ""} Oraret`.slice(0, 31));

  // Our-price / Google-price column numbers shift by 1 when the route column is present
  const ownPriceCol = hasRoute ? 9 : 8;
  const gglPriceCol = hasRoute ? 10 : 9;
  const lastColLetter = hasRoute ? "L" : "K";

  // Header info
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value = `Kontrollo Oraret — ${to ? `${from} → ${to}` : from} | ${startDate} → ${endDate}`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 24;

  ws.addRow([]);

  // Column headers
  const headerRow = ws.addRow([
    ...(hasRoute ? ["Rruga"] : []),
    "Fluturimi", "Kompania", "Data",
    "Orari Ynë (Nisje)", "Orari Ynë (Mberritje)",
    "Orari Google (Nisje)", "Orari Google (Mberritje)",
    "Çmimi Ynë (€)", "Çmimi Wizz (€)",
    "Statusi", "Ndryshimet"
  ]);
  headerRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: colNum === ownPriceCol ? "FF111827" : "FF1E3A5F" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFDBFE" } } };
  });
  ws.getRow(3).height = 20;

  // Data rows
  for (const r of results) {
    const isRed = r.status === "time_changed" || r.status === "not_found";
    const rowData = [
      ...(hasRoute ? [r.route ?? "—"] : []),
      r.flightNumber,
      r.airline,
      r.departureDate,
      r.ourDepartureTime,
      r.ourArrivalTime,
      r.googleDepartureTime ?? "—",
      r.googleArrivalTime   ?? "—",
      r.ourPrice    != null ? r.ourPrice    : "—",
      r.googlePrice != null ? r.googlePrice : "—",
      STATUS_LABELS[r.status] ?? r.status,
      r.changes.map(c => `${c.field}: ${c.old} → ${c.new}`).join("; ") || "—",
    ];
    const row = ws.addRow(rowData);
    row.eachCell((cell, colNum) => {
      if (isRed) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
        cell.font = { color: { argb: "FF991B1B" } };
      }
      // Our price column → bold black
      if (colNum === ownPriceCol) {
        cell.font = { bold: true, color: { argb: isRed ? "FF991B1B" : "FF111827" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isRed ? "FFFEE2E2" : "FFF1F5F9" } };
        if (typeof cell.value === "number") {
          cell.numFmt = "#,##0.00 €";
        }
      }
      // Google price column
      if (colNum === gglPriceCol && typeof cell.value === "number") {
        cell.numFmt = "#,##0.00 €";
      }
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE5E7EB" } },
        right:  { style: "hair", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 18;
  }

  // Summary row
  ws.addRow([]);
  const unchanged  = results.filter(r => r.status === "unchanged").length;
  const changed    = results.filter(r => r.status === "time_changed").length;
  const notFound   = results.filter(r => r.status === "not_found").length;
  const summRow = ws.addRow([
    `Totali: ${results.length}`,
    `Pa ndryshim: ${unchanged}`,
    `Ndryshuar: ${changed}`,
    `Nuk gjendet: ${notFound}`,
  ]);
  summRow.eachCell(cell => { cell.font = { bold: true }; });

  // Column widths
  ws.columns = [
    ...(hasRoute ? [{ width: 16 }] : []),
    { width: 12 }, { width: 16 }, { width: 12 },
    { width: 16 }, { width: 18 },
    { width: 18 }, { width: 20 },
    { width: 14 }, { width: 14 },
    { width: 18 }, { width: 40 },
  ];

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

async function generateSchedulePdf(
  results: ScheduleResult[], from: string, to: string, startDate: string, endDate: string
): Promise<Buffer> {
  // A4 Landscape: 842 x 595 pt  (pdf-lib coords: 0,0 = bottom-left)
  const PW = 842, PH = 595, M = 30;
  const W  = PW - 2 * M;

  const pdfDoc = await PDFDocument.create();
  const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // helpers
  const c = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };

  const unchanged = results.filter(r => r.status === "unchanged").length;
  const changed   = results.filter(r => r.status === "time_changed").length;
  const notFound  = results.filter(r => r.status === "not_found").length;

  const hasRoute = results.some(r => r.route);
  // Column widths (must sum ≤ W = 782)
  const cols  = hasRoute
    ? [62, 50, 60, 58, 50, 50, 50, 50, 44, 44, 70, 144]
    : [55, 72, 65, 65, 68, 65, 68, 50, 50, 82, 142];
  const hdrs  = hasRoute
    ? ["Rruga","Fluturimi","Kompania","Data","Nisje (Ynë)","Mberr (Ynë)","Nisje (Ggl)","Mberr (Ggl)","€ Ynë","€ Wizz","Statusi","Ndryshimet"]
    : ["Fluturimi","Kompania","Data","Nisje (Ynë)","Mberr (Ynë)","Nisje (Ggl)","Mberr (Ggl)","€ Ynë","€ Wizz","Statusi","Ndryshimet"];
  const ownPriceIdx = hasRoute ? 8 : 7;
  const changesIdx  = hasRoute ? 11 : 10;

  let page = pdfDoc.addPage([PW, PH]);

  const drawHeader = (pg: ReturnType<typeof pdfDoc.addPage>) => {
    // Blue header bar
    pg.drawRectangle({ x: M, y: PH - M - 38, width: W, height: 38, color: c("#1E3A5F") });
    pg.drawText(reportPdfText(`Kontrollo Oraret - ${to ? `${from} -> ${to}` : from}`), {
      x: M + 8, y: PH - M - 20, size: 13, font: fontB, color: c("#FFFFFF"),
    });
    pg.drawText(reportPdfText(`Periudha: ${startDate} -> ${endDate}  |  ${new Date().toLocaleDateString()}`), {
      x: M + 8, y: PH - M - 33, size: 8, font: fontR, color: c("#BFDBFE"),
    });

    // Summary boxes
    const boxes = [
      { label: "Totali", val: results.length, bg: "#DBEAFE", fg: "#1E40AF" },
      { label: "Pa ndryshim", val: unchanged,  bg: "#DCFCE7", fg: "#166534" },
      { label: "Ndryshuar",   val: changed,    bg: "#FED7AA", fg: "#9A3412" },
      { label: "Nuk gjendet", val: notFound,   bg: "#FECACA", fg: "#991B1B" },
    ];
    const bw = W / 4 - 6;
    boxes.forEach((b, i) => {
      const bx = M + i * (bw + 8);
      const by = PH - M - 38 - 48;
      pg.drawRectangle({ x: bx, y: by, width: bw, height: 44, color: c(b.bg) });
      pg.drawText(String(b.val), { x: bx + bw / 2 - 10, y: by + 24, size: 20, font: fontB, color: c(b.fg) });
      pg.drawText(b.label, { x: bx + 4, y: by + 8, size: 7, font: fontR, color: c(b.fg) });
    });

    // Table header row
    const thY = PH - M - 38 - 48 - 22;
    pg.drawRectangle({ x: M, y: thY, width: W, height: 18, color: c("#1E3A5F") });
    let hx = M + 2;
    hdrs.forEach((h, i) => {
      pg.drawText(h, { x: hx, y: thY + 5, size: 6.5, font: fontB, color: c("#FFFFFF"), maxWidth: cols[i] - 4 });
      hx += cols[i];
    });
    return thY; // return Y of table header bottom (rows start below this)
  };

  let tableTopY = drawHeader(page);
  let curY      = tableTopY;    // rows draw downward in screen space → decrease Y

  for (const r of results) {
    const isRed  = r.status === "time_changed" || r.status === "not_found";
    const rowH   = r.changes.length > 0 ? 24 : 17;

    if (curY - rowH < M + 10) {
      // New page
      page     = pdfDoc.addPage([PW, PH]);
      tableTopY = drawHeader(page);
      curY      = tableTopY;
    }

    const rowY = curY - rowH;
    page.drawRectangle({ x: M, y: rowY, width: W, height: rowH,
      color: isRed ? c("#FEE2E2") : c("#F9FAFB"), borderColor: c("#E5E7EB"), borderWidth: 0.4 });

    const fg   = isRed ? c("#991B1B") : c("#111827");
    const font = isRed ? fontB : fontR;
    const fmtPrice = (p: number | null) => p != null ? `€${formatWholeEuro(p)}` : "—";
    const cells = [
      ...(hasRoute ? [r.route ?? "—"] : []),
      r.flightNumber, r.airline, r.departureDate,
      r.ourDepartureTime, r.ourArrivalTime,
      r.googleDepartureTime ?? "—", r.googleArrivalTime ?? "—",
      fmtPrice(r.ourPrice), fmtPrice(r.googlePrice),
      STATUS_LABELS[r.status] ?? r.status,
      r.changes.map(c2 => `${c2.field}: ${c2.old}->${c2.new}`).join(" | ") || "—",
    ];
    let cx = M + 2;
    cells.forEach((val, i) => {
      // "€ Ynë" → bold black (or bold red if bad)
      const cellFont  = (i === ownPriceIdx) ? fontB : font;
      const cellColor = (i === ownPriceIdx) ? (isRed ? c("#991B1B") : c("#111827")) : fg;
      page.drawText(reportPdfText(val).slice(0, 40), {
        x: cx, y: rowY + (rowH > 17 ? rowH - 11 : 5), size: 6.5, font: cellFont, color: cellColor, maxWidth: cols[i] - 4,
      });
      if (r.changes.length > 0 && i === changesIdx) {
        // second line for changes column
        r.changes.slice(0, 2).forEach((chg, ci) => {
          page.drawText(reportPdfText(`${chg.field}: ${chg.old}->${chg.new}`).slice(0, 50), {
            x: cx, y: rowY + rowH - 11 - (ci + 1) * 8, size: 5.5, font: fontR, color: c("#B91C1C"), maxWidth: cols[i] - 4,
          });
        });
      }
      cx += cols[i];
    });
    curY = rowY;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

async function sendScheduleReport(
  to: string, results: ScheduleResult[],
  from: string, toCity: string, startDate: string, endDate: string
): Promise<void> {
  try {
    await sendScheduleReportInner(to, results, from, toCity, startDate, endDate);
  } catch (error) {
    await reportOperationalFailure("schedule-report", "Raporti i orareve", error);
    throw error;
  }
}

async function sendScheduleReportInner(
  to: string, results: ScheduleResult[],
  from: string, toCity: string, startDate: string, endDate: string
): Promise<void> {
  const [excelBuf, pdfBuf] = await Promise.all([
    generateScheduleExcel(results, from, toCity, startDate, endDate),
    generateSchedulePdf(results,   from, toCity, startDate, endDate),
  ]);

  const unchanged = results.filter(r => r.status === "unchanged").length;
  const changed   = results.filter(r => r.status === "time_changed").length;
  const notFound  = results.filter(r => r.status === "not_found").length;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">Kontrollo Oraret e Fluturimeve</h2>
        <p style="margin:6px 0 0;font-size:13px;color:#BFDBFE">${toCity ? `${from} → ${toCity}` : from} &nbsp;|&nbsp; ${startDate} → ${endDate}</p>
      </div>
      <div style="background:#F9FAFB;padding:20px 24px;border:1px solid #E5E7EB;border-top:none">
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <div style="flex:1;text-align:center;background:#EFF6FF;padding:12px;border-radius:6px">
            <div style="font-size:24px;font-weight:700;color:#1E40AF">${results.length}</div>
            <div style="font-size:12px;color:#3B82F6">Totali</div>
          </div>
          <div style="flex:1;text-align:center;background:#F0FDF4;padding:12px;border-radius:6px">
            <div style="font-size:24px;font-weight:700;color:#166534">${unchanged}</div>
            <div style="font-size:12px;color:#22C55E">Pa ndryshim</div>
          </div>
          <div style="flex:1;text-align:center;background:#FFF7ED;padding:12px;border-radius:6px">
            <div style="font-size:24px;font-weight:700;color:#9A3412">${changed}</div>
            <div style="font-size:12px;color:#F97316">Ndryshuar</div>
          </div>
          <div style="flex:1;text-align:center;background:#FFF1F2;padding:12px;border-radius:6px">
            <div style="font-size:24px;font-weight:700;color:#991B1B">${notFound}</div>
            <div style="font-size:12px;color:#EF4444">Nuk gjendet</div>
          </div>
        </div>
        ${changed > 0 || notFound > 0 ? `
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:12px;margin-bottom:12px">
          <strong style="color:#991B1B">⚠️ Ka ndryshime!</strong>
          <p style="margin:4px 0 0;font-size:13px;color:#B91C1C">
            Gjenden <strong>${changed}</strong> fluturime me orare të ndryshuara dhe <strong>${notFound}</strong> fluturime që nuk gjenden në Google Flights.
          </p>
        </div>` : `
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:12px;margin-bottom:12px">
          <strong style="color:#166534">✓ Të gjitha fluturimet janë OK</strong>
        </div>`}
        <p style="font-size:12px;color:#6B7280;margin:0">Bashkangjitur gjeni raportin e plotë si Excel (.xlsx) dhe PDF (.pdf).</p>
      </div>
    </div>`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const fname = `oraret-${from}${toCity ? "-" + toCity : ""}-${startDate}_${endDate}`.replace(/[^\w.-]+/g, "_");
  await transporter.sendMail({
    from:    process.env.SMTP_USER,
    to,
    subject: `📋 Raporti i Orareve: ${toCity ? `${from}→${toCity}` : from} (${startDate}→${endDate})`,
    html:    htmlBody,
    attachments: [
      { filename: `${fname}.xlsx`, content: excelBuf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { filename: `${fname}.pdf`,  content: pdfBuf,  contentType: "application/pdf" },
    ],
  });
}

// ── POST /flights/schedule-check-email ───────────────────────────────────────
router.post("/flights/schedule-check-email", async (req, res): Promise<void> => {
  if (!req.session?.userId || !["admin", "manager"].includes(req.session.role || "")) {
    res.status(403).json({ error: "Admin/Manager only" }); return;
  }

  const { from, to, startDate, endDate, flightNumber: reqFlightNum, email: emailParam } = req.body;
  const email = emailParam || process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  if (!from || !to || !startDate || !endDate || !email) {
    res.status(400).json({ error: "from, to, startDate, endDate required" }); return;
  }

  // Reuse same logic as schedule-check
  const whereConditions: any[] = [
    ilike(flightsTable.fromCity, from.trim()),
    ilike(flightsTable.toCity,   to.trim()),
    gte(flightsTable.departureDate, startDate),
    lte(flightsTable.departureDate, endDate),
    sql`status != 'cancelled'`,
  ];
  if (reqFlightNum) whereConditions.push(ilike(flightsTable.flightNumber, `%${reqFlightNum.trim()}%`));

  const dbFlights = await flightsEligibleForGoogleLookup(
    await db.select().from(flightsTable)
      .where(and(...whereConditions))
      .orderBy(flightsTable.departureDate, asc(flightsTable.departureTime))
  );

  if (!dbFlights.length) {
    res.status(404).json({ error: "Nuk u gjetën fluturime për këtë rrugë dhe periudhë." }); return;
  }

  const byDate: Record<string, typeof dbFlights> = {};
  for (const f of dbFlights) {
    if (!byDate[f.departureDate]) byDate[f.departureDate] = [];
    byDate[f.departureDate].push(f);
  }

  const results: ScheduleResult[] = [];
  for (const [date, flights] of Object.entries(byDate)) {
    const { flights: googleFlights, routePrice } = await fetchGoogleFlightSchedules(from.trim(), to.trim(), date);
    const googleCount = googleFlights.length;
    for (const flight of flights) {
      const myNum  = normFlightNum(flight.flightNumber || "");
      const match  = matchingGoogleSchedule(googleFlights, flight);
      const changes: ScheduleResult["changes"] = [];
      let status = "unchanged";
      if (!match) {
        status = googleCount === 0 ? "api_empty" : "not_found";
      } else {
        changes.push(...googleScheduleChanges(flight, match));
        status = changes.length > 0 ? "time_changed" : "unchanged";
      }
      results.push({
        id: flight.id, flightNumber: flight.flightNumber, airline: flight.airline,
        departureDate: flight.departureDate, ourDepartureTime: flight.departureTime,
        ourArrivalTime: flight.arrivalTime, googleDepartureTime: match?.departureTime ?? null,
        googleArrivalTime: match?.arrivalTime ?? null, status, changes, googleRaw: googleCount,
        ourPrice: flight.adultPrice != null ? Number(flight.adultPrice) : null,
        googlePrice: routePrice,
      });
    }
  }

  try {
    await sendScheduleReport(email, results, from.trim().toUpperCase(), to.trim().toUpperCase(), startDate, endDate);
    res.json({ ok: true, sent: results.length, to: email });
  } catch (err: any) {
    console.error("[schedule-email]", err);
    res.status(500).json({ error: `Email dërgimi dështoi: ${err?.message ?? "gabim i panjohur"}` });
  }
});

// ── Automatic daily schedule check (cron) ────────────────────────────────────
// Checks ALL future flights across ALL routes vs Google and emails one combined
// Excel + PDF report. Triggered once every 24h from the cron scheduler.
export async function runDailyScheduleCheckEmail(): Promise<void> {
  if (!(await isModuleEnabled("scheduleCheck"))) return;
  const email = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  if (!email) {
    logger.warn("[schedule-cron] No NOTIFY_EMAIL/SMTP_USER configured — skipping");
    return;
  }

  // Today in Albania time as YYYY-MM-DD (departureDate is stored as a string)
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });

  const dbFlights = await flightsEligibleForGoogleLookup(
    await db.select().from(flightsTable)
      .where(and(
        gte(flightsTable.departureDate, today),
        sql`status != 'cancelled'`,
      ))
      .orderBy(flightsTable.fromCity, flightsTable.toCity, flightsTable.departureDate, asc(flightsTable.departureTime))
  );

  if (!dbFlights.length) {
    logger.info("[schedule-cron] No future flights to check — skipping");
    return;
  }

  // Group flights by route, then by date (1 Google call per route+date)
  const byRoute = new Map<string, typeof dbFlights>();
  for (const f of dbFlights) {
    const key = `${f.fromCity}|${f.toCity}`;
    const arr = byRoute.get(key);
    if (arr) arr.push(f); else byRoute.set(key, [f]);
  }

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const allResults: ScheduleResult[] = [];

  for (const [key, flights] of byRoute) {
    const [rFrom, rTo] = key.split("|");
    const routeLabel = `${rFrom} → ${rTo}`;

    const byDate: Record<string, typeof flights> = {};
    for (const f of flights) {
      if (!byDate[f.departureDate]) byDate[f.departureDate] = [];
      byDate[f.departureDate].push(f);
    }

    for (const [date, dayFlights] of Object.entries(byDate)) {
      if (!(await isModuleEnabled("scheduleCheck"))) {
        logger.info("[schedule-cron] stopped: module disabled");
        return;
      }
      let googleFlights: Awaited<ReturnType<typeof fetchGoogleFlightSchedules>>["flights"] = [];
      let routePrice: number | null = null;
      try {
        const r = await fetchGoogleFlightSchedules(rFrom, rTo, date);
        googleFlights = r.flights;
        routePrice = r.routePrice;
      } catch (err: any) {
        logger.error({ err, route: routeLabel, date }, "[schedule-cron] Google fetch failed");
      }
      const googleCount = googleFlights.length;

      for (const flight of dayFlights) {
        const myNum  = normFlightNum(flight.flightNumber || "");
        const match  = matchingGoogleSchedule(googleFlights, flight);
        const changes: ScheduleResult["changes"] = [];
        let status = "unchanged";
        if (!match) {
          status = googleCount === 0 ? "api_empty" : "not_found";
        } else {
          changes.push(...googleScheduleChanges(flight, match));
          status = changes.length > 0 ? "time_changed" : "unchanged";
        }
        allResults.push({
          id: flight.id, flightNumber: flight.flightNumber, airline: flight.airline,
          departureDate: flight.departureDate, ourDepartureTime: flight.departureTime,
          ourArrivalTime: flight.arrivalTime, googleDepartureTime: match?.departureTime ?? null,
          googleArrivalTime: match?.arrivalTime ?? null, status, changes, googleRaw: googleCount,
          ourPrice: flight.adultPrice != null ? Number(flight.adultPrice) : null,
          googlePrice: routePrice,
          route: routeLabel,
        });
      }

      // Be gentle with the Google endpoint between calls
      await sleep(300);
    }
  }

  if (!allResults.length) {
    logger.info("[schedule-cron] No results produced — skipping email");
    return;
  }

  if (!(await isModuleEnabled("scheduleCheck"))) return;
  const minDate = dbFlights[0].departureDate;
  const maxDate = dbFlights.reduce((m, f) => (f.departureDate > m ? f.departureDate : m), dbFlights[0].departureDate);

  await sendScheduleReport(email, allResults, "TË GJITHA RRUGËT", "", minDate, maxDate);
  logger.info({ count: allResults.length, routes: byRoute.size, to: email }, "[schedule-cron] Daily schedule report sent");
}

export default router;
