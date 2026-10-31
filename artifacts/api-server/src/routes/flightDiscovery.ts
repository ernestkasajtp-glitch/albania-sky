import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  flightsTable,
  settingsTable,
} from "@workspace/db";
import {
  FLIGHT_DISCOVERY_MAX_DAYS,
  dateRangeDays,
  flightDiscoveryKey,
  isCalendarDate,
  isDiscoveryAirportCode,
  isDiscoveryWizzFlight,
  normalizeDiscoveryAirline,
  normalizeDiscoveryAirport,
  parseDiscoveryConfig,
  todayInTirane,
  type FlightDiscoveryConfig,
  type FlightDiscoveryRoute,
} from "../lib/flightDiscoveryUtils.js";
import { normalizeFlightNumber } from "../lib/flightIdentifiers.js";
import { roundWholeEuro } from "../lib/money.js";
import { FlightScheduleValidationError, normalizeArrivalDate } from "../lib/flightScheduleIntegrity.js";
import {
  fetchGoogleFlightSchedules,
  applyGooglePriceRulesToNewFlights,
  getDefaultBaggageRule,
  recordFlightChange,
} from "./flights.js";
import { recordSeatEvent } from "../lib/seatHistory.js";
import { scheduleGSheetsSync } from "../lib/googleSheets.js";
import { scheduleNextAutoSoldOut } from "../lib/autoSoldOut.js";
import { notifyDataChanged } from "../lib/liveEvents.js";
import { logger } from "../lib/logger.js";
import { googleLookupFailure } from "../lib/googleLookupDiagnostic.js";
import { isModuleEnabled } from "../lib/moduleControls.js";
import { fetchWhileEnabled } from "../lib/backgroundWork.js";
import { manualGooglePriority, withGooglePriority } from "../lib/rapidLimiter.js";

const router: IRouter = Router();
router.use(manualGooglePriority);

const CONFIG_SETTING_KEY = "flight_discovery.config";
const CONFIG_LOCK_NAME = "flight_discovery.config.global";
// Candidates and ignores intentionally live outside found_flights. That table
// is also used by the legacy flight-types page, whose writes must never leak
// into this standalone discovery page.
const STORE_SETTING_KEY = "flight_discovery.store";
const STORE_LOCK_NAME = "flight_discovery.candidates.global";
const MAX_INTERVAL_MINUTES = 30 * 24 * 60;

export type DiscoveryStoredCandidate = {
  id: number;
  flightNumber: string;
  airline: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  googlePrice: number | null;
  foundAt: string;
};

export type DiscoveryStore = {
  nextId: number;
  candidates: DiscoveryStoredCandidate[];
  ignored: string[];
};

function emptyDiscoveryStore(): DiscoveryStore {
  return { nextId: 1, candidates: [], ignored: [] };
}

type DiscoveryProgress = {
  running: boolean;
  checked: number;
  total: number;
  found: number;
  errors: number;
  error?: string;
};

type DiscoverySearch = {
  fromCity: string;
  toCity: string;
  startDate: string;
  endDate: string;
};

const EMPTY_PROGRESS: DiscoveryProgress = {
  running: false,
  checked: 0,
  total: 0,
  found: 0,
  errors: 0,
};

// This is intentionally separate from the Google price warmers. Manual and
// scheduled discovery both reserve this same object synchronously before any
// async work starts, so two requests cannot launch overlapping date scans.
let activeRun: { id: number; input: DiscoverySearch; progress: DiscoveryProgress } | null = null;
let nextRunId = 1;
let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;
let scheduleNextDiscovery: ((delayMs: number) => void) | null = null;
let schedulerGeneration = 0;
type SchedulerRouteState = { signature: string; nextDueAt: number };
const schedulerRoutes = new Map<string, SchedulerRouteState>();

function isAdmin(req: Request): boolean {
  return req.session?.role === "admin";
}

export function requireDiscoveryAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Forbidden: admin only" });
    return;
  }
  next();
}

router.use(requireDiscoveryAdmin);

function progressSnapshot(progress: DiscoveryProgress): DiscoveryProgress {
  return {
    ...progress,
    ...(progress.error ? { error: progress.error } : {}),
  };
}

function currentProgress(): DiscoveryProgress {
  return progressSnapshot(activeRun?.progress ?? EMPTY_PROGRESS);
}

function normalizeSearchInput(raw: Record<string, unknown>, today = todayInTirane()): { input?: DiscoverySearch; error?: string } {
  const fromCity = normalizeDiscoveryAirport(raw.fromCity);
  const toCity = normalizeDiscoveryAirport(raw.toCity);
  const startDate = String(raw.startDate ?? "").trim();
  const endDate = String(raw.endDate ?? "").trim();

  if (!isDiscoveryAirportCode(fromCity) || !isDiscoveryAirportCode(toCity)) {
    return { error: "fromCity dhe toCity duhet të jenë kode aeroporti me 3 shkronja." };
  }
  if (fromCity === toCity) {
    return { error: "fromCity dhe toCity duhet të jenë aeroporte të ndryshme." };
  }
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    return { error: "startDate dhe endDate duhet të jenë data të vlefshme në formatin YYYY-MM-DD." };
  }
  if (startDate < today) {
    return { error: "startDate nuk mund të jetë në të kaluarën." };
  }
  const total = dateRangeDays(startDate, endDate);
  if (!total) {
    return { error: "Intervali i datave është i pavlefshëm." };
  }
  if (total > FLIGHT_DISCOVERY_MAX_DAYS) {
    return { error: `Intervali i datave nuk mund të kalojë ${FLIGHT_DISCOVERY_MAX_DAYS} ditë.` };
  }
  return { input: { fromCity, toCity, startDate, endDate } };
}

function addDays(isoDate: string, days: number): string {
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
}

async function getSetting(key: string, client: any = db): Promise<string | null> {
  const [row] = await client.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, key));
  return row?.value ?? null;
}

async function saveSetting(client: any, key: string, value: string): Promise<void> {
  await client.insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

function isRouteListSetting(raw: string | null): boolean {
  if (!raw) return false;
  try {
    return Array.isArray((JSON.parse(raw) as { routes?: unknown }).routes);
  } catch {
    return false;
  }
}

async function lockDiscoveryConfig(tx: any): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${CONFIG_LOCK_NAME}))`);
}

async function getDiscoveryConfig(): Promise<FlightDiscoveryConfig> {
  const raw = await getSetting(CONFIG_SETTING_KEY);
  const config = parseDiscoveryConfig(raw);
  // Legacy migration is serialized with config writes and re-reads inside the
  // lock. Thus a concurrent conditional PUT can never be overwritten by the
  // stale value that prompted this read.
  if (!raw || isRouteListSetting(raw) || config.routes.length === 0) return config;
  return db.transaction(async tx => {
    await lockDiscoveryConfig(tx);
    const latestRaw = await getSetting(CONFIG_SETTING_KEY, tx);
    const latest = parseDiscoveryConfig(latestRaw);
    if (!latestRaw || isRouteListSetting(latestRaw) || latest.routes.length === 0) return latest;
    await saveSetting(tx, CONFIG_SETTING_KEY, JSON.stringify(latest));
    return latest;
  });
}

type DiscoveryConfigRoute = FlightDiscoveryRoute & {
  hasActiveInventory: boolean;
  eligible: boolean;
};

function routeKey(route: Pick<FlightDiscoveryRoute, "fromCity" | "toCity">): string {
  return `${normalizeDiscoveryAirport(route.fromCity)}|${normalizeDiscoveryAirport(route.toCity)}`;
}

function routeSignature(route: FlightDiscoveryRoute): string {
  return JSON.stringify(route);
}

async function getActiveInventoryRouteKeys(today = todayInTirane()): Promise<Set<string>> {
  const rows = await db.select({
    fromCity: flightsTable.fromCity,
    toCity: flightsTable.toCity,
  }).from(flightsTable).where(and(
    gte(flightsTable.departureDate, today),
    sql`${flightsTable.status} IN ('open', 'soldout')`,
  ));
  return new Set(rows.flatMap(row => {
    const fromCity = normalizeDiscoveryAirport(row.fromCity);
    const toCity = normalizeDiscoveryAirport(row.toCity);
    return isDiscoveryAirportCode(fromCity) && isDiscoveryAirportCode(toCity) && fromCity !== toCity
      ? [`${fromCity}|${toCity}`]
      : [];
  }));
}

async function getDiscoveryConfigResponse(): Promise<{ revision: number; routes: DiscoveryConfigRoute[] }> {
  const today = todayInTirane();
  const [config, activeKeys] = await Promise.all([
    getDiscoveryConfig(),
    getActiveInventoryRouteKeys(today),
  ]);
  const routes = new Map<string, DiscoveryConfigRoute>();
  for (const saved of config.routes) {
    const hasActiveInventory = activeKeys.has(routeKey(saved));
    const eligible = hasActiveInventory && saved.endDate >= today;
    routes.set(routeKey(saved), {
      ...saved,
      // Eligibility is derived from current inventory/date status. It remains
      // separate from persisted `enabled`, so a GET or unrelated save never
      // silently disables a saved route.
      hasActiveInventory,
      eligible,
    });
  }
  for (const key of activeKeys) {
    if (routes.has(key)) continue;
    const [fromCity, toCity] = key.split("|");
    routes.set(key, {
      enabled: false,
      intervalMinutes: 1440,
      startDate: today,
      endDate: addDays(today, 6),
      fromCity,
      toCity,
      hasActiveInventory: true,
      eligible: true,
    });
  }
  return {
    revision: config.revision,
    routes: [...routes.values()].sort((a, b) => routeKey(a).localeCompare(routeKey(b))),
  };
}

export function normalizeStore(raw: unknown): DiscoveryStore {
  if (!raw || typeof raw !== "object") return emptyDiscoveryStore();
  const value = raw as Partial<DiscoveryStore>;
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.filter((candidate): candidate is DiscoveryStoredCandidate =>
      !!candidate
      && typeof candidate === "object"
      && Number.isInteger((candidate as DiscoveryStoredCandidate).id)
      && (candidate as DiscoveryStoredCandidate).id > 0
      && typeof (candidate as DiscoveryStoredCandidate).flightNumber === "string"
      && typeof (candidate as DiscoveryStoredCandidate).airline === "string"
      && typeof (candidate as DiscoveryStoredCandidate).fromCity === "string"
      && typeof (candidate as DiscoveryStoredCandidate).toCity === "string"
      && typeof (candidate as DiscoveryStoredCandidate).departureDate === "string"
      && typeof (candidate as DiscoveryStoredCandidate).departureTime === "string"
      && typeof (candidate as DiscoveryStoredCandidate).arrivalDate === "string"
      && typeof (candidate as DiscoveryStoredCandidate).arrivalTime === "string"
      && typeof (candidate as DiscoveryStoredCandidate).foundAt === "string",
    )
    : [];
  const ignored = Array.isArray(value.ignored)
    ? value.ignored.filter((key): key is string => typeof key === "string" && key.length > 0)
    : [];
  const highestId = candidates.reduce((max, candidate) => Math.max(max, candidate.id), 0);
  const nextId = Number.isInteger(value.nextId) && Number(value.nextId) > highestId
    ? Number(value.nextId)
    : highestId + 1;
  return {
    nextId: Math.max(1, nextId),
    candidates,
    ignored: [...new Set(ignored)],
  };
}

async function getDiscoveryStore(client: any = db): Promise<DiscoveryStore> {
  const [row] = await client.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, STORE_SETTING_KEY));
  if (!row?.value) return emptyDiscoveryStore();
  try {
    return normalizeStore(JSON.parse(row.value));
  } catch {
    // A malformed dedicated store must not make the API fail. The next write
    // repairs it while preserving the isolation boundary from found_flights.
    logger.warn("Flight discovery store is not valid JSON");
    return emptyDiscoveryStore();
  }
}

async function lockDiscoveryStore(tx: any): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${STORE_LOCK_NAME}))`);
}

function serializeCandidate(candidate: DiscoveryStoredCandidate) {
  const googlePrice = candidate.googlePrice == null ? null : Number(candidate.googlePrice);
  return {
    id: candidate.id,
    flightNumber: candidate.flightNumber,
    airline: candidate.airline,
    fromCity: candidate.fromCity,
    toCity: candidate.toCity,
    departureDate: candidate.departureDate,
    departureTime: candidate.departureTime,
    arrivalTime: candidate.arrivalTime,
    googlePrice: googlePrice != null && Number.isFinite(googlePrice) ? googlePrice : null,
    foundAt: candidate.foundAt,
  };
}

function parsePrice(raw: unknown, name: string): { value?: string; error?: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { error: `${name} është i detyrueshëm.` };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 99_999_999.99) {
    return { error: `${name} duhet të jetë numër >= 0.` };
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    return { error: `${name} duhet të ketë maksimumi 2 shifra dhjetore.` };
  }
  return { value: String(roundWholeEuro(value)) };
}

function parseSeats(raw: unknown): { value?: number; error?: string } {
  if (raw === undefined || raw === null || raw === "") return { value: 20 };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    return { error: "totalSeats duhet të jetë numër i plotë pozitiv." };
  }
  return { value };
}

function isValidHHMM(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function tiraneNowMinute(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")} ${values.get("hour")}:${values.get("minute")}`;
}

export function validateStoredCandidate(
  candidate: DiscoveryStoredCandidate,
  now = tiraneNowMinute(),
): string | null {
  if (!isDiscoveryAirportCode(candidate.fromCity) || !isDiscoveryAirportCode(candidate.toCity)
      || candidate.fromCity === candidate.toCity) {
    return "Kandidati ka një rrugë aeroportesh të pavlefshme.";
  }
  if (!isCalendarDate(candidate.departureDate) || !isCalendarDate(candidate.arrivalDate)) {
    return "Kandidati ka një datë të pavlefshme.";
  }
  if (!normalizeFlightNumber(candidate.flightNumber)
      || !/^[A-Z0-9]+$/.test(normalizeFlightNumber(candidate.flightNumber))) {
    return "Kandidati ka numër fluturimi të pavlefshëm.";
  }
  if (!candidate.airline.trim()) return "Kandidati nuk ka emër kompanie nga Google.";
  if (!isValidHHMM(candidate.departureTime) || !isValidHHMM(candidate.arrivalTime)) {
    return "Kandidati ka orar të pavlefshëm.";
  }
  try {
    normalizeArrivalDate(candidate);
  } catch (error) {
    if (!(error instanceof FlightScheduleValidationError)) throw error;
    return error.message;
  }
  const today = now.slice(0, 10);
  if (candidate.departureDate < today) {
    return "Nuk mund të shtohet një fluturim me nisje në të kaluarën.";
  }
  if (candidate.departureDate === today && candidate.fromCity !== "TIA") {
    return "Për nisjet e sotme jashtë TIA nuk mund të verifikohet zona kohore; zgjidhni një datë të ardhshme.";
  }
  if (candidate.departureDate === today
      && `${candidate.departureDate} ${candidate.departureTime}` < now) {
    return "Nuk mund të shtohet një fluturim me nisje në të kaluarën (ora e Tiranës).";
  }
  return null;
}

export function dismissDiscoveryStoreCandidate(
  store: DiscoveryStore,
  id: number,
): { store: DiscoveryStore; key: string } | null {
  const candidate = store.candidates.find(row => row.id === id);
  if (!candidate) return null;
  const key = flightDiscoveryKey(candidate);
  return {
    key,
    store: {
      nextId: store.nextId,
      candidates: store.candidates.filter(row => row.id !== id),
      ignored: [...new Set([...store.ignored, key])].sort(),
    },
  };
}

export function incompleteDiscoveryScheduleMessage(dates: Iterable<string>): string {
  return `Google ktheu orare pa datë të plotë mbërritjeje për ${[...dates].join(", ")}; rezultatet e atyre datave nuk janë të plota.`;
}

function reserveSearch(input: DiscoverySearch): DiscoveryProgress | null {
  if (activeRun?.progress.running) return null;
  const total = dateRangeDays(input.startDate, input.endDate);
  const progress: DiscoveryProgress = {
    running: true,
    checked: 0,
    total,
    found: 0,
    errors: 0,
  };
  activeRun = { id: nextRunId++, input, progress };
  return progressSnapshot(progress);
}

async function executeSearch(runId: number): Promise<void> {
  const run = activeRun;
  if (!run || run.id !== runId) return;
  const { input, progress } = run;
  const incompleteScheduleDates = new Set<string>();

  try {
    if (!(await isModuleEnabled("flightDiscovery"))) {
      progress.error = "Zbulimi i fluturimeve u ndal: moduli është çaktivizuar.";
      return;
    }
    const [existingRows, initialStore] = await Promise.all([
      db.select({
        fromCity: flightsTable.fromCity,
        toCity: flightsTable.toCity,
        departureDate: flightsTable.departureDate,
        flightNumber: flightsTable.flightNumber,
      }).from(flightsTable).where(and(
        sql`UPPER(TRIM(${flightsTable.fromCity})) = ${input.fromCity}`,
        sql`UPPER(TRIM(${flightsTable.toCity})) = ${input.toCity}`,
        gte(flightsTable.departureDate, input.startDate),
        lte(flightsTable.departureDate, input.endDate),
      )),
      getDiscoveryStore(),
    ]);

    const existingKeys = new Set(existingRows.map(row => flightDiscoveryKey(row)));
    const savedKeys = new Set(initialStore.candidates.map(row => flightDiscoveryKey(row)));
    const ignored = new Set(initialStore.ignored);
    const discovered = new Map<string, Omit<DiscoveryStoredCandidate, "id" | "foundAt">>();
    const dates: string[] = [];
    for (let timestamp = Date.parse(`${input.startDate}T00:00:00Z`);
      timestamp <= Date.parse(`${input.endDate}T00:00:00Z`);
      timestamp += 86_400_000) {
      dates.push(new Date(timestamp).toISOString().slice(0, 10));
    }

    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        if (!(await isModuleEnabled("flightDiscovery"))) {
          progress.error = "Zbulimi i fluturimeve u ndal: moduli është çaktivizuar.";
          return;
        }
        const date = dates[cursor++];
        if (!date) return;
        let result;
        try {
          // directOnly is important here: connecting itineraries must never
          // become candidates for a direct route.
          result = await fetchWhileEnabled(
            () => isModuleEnabled("flightDiscovery"),
            () => fetchGoogleFlightSchedules(input.fromCity, input.toCity, date, { directOnly: true }),
            "Flight discovery",
          );
        } catch (error) {
          progress.errors++;
          logger.warn({ from: input.fromCity, to: input.toCity, date,
            reason: googleLookupFailure(error, "fetch") }, "Flight discovery upstream request failed");
          progress.checked++;
          continue;
        }
        progress.checked++;
        if (result.error) {
          progress.errors++;
          continue;
        }

        let incompleteSchedule = false;
        for (const flight of result.flights) {
          if (!isDiscoveryWizzFlight(flight)) continue;
          const flightNumber = normalizeFlightNumber(flight.flightNumber);
          if (!flightNumber) continue;
          // Persist only a schedule with Google's actual full arrival date.
          // If upstream returned only a clock time, do not invent a date that
          // an administrator could later add as a real flight.
          if (!flight.arrivalDate || !isCalendarDate(flight.arrivalDate)
              || flight.arrivalDateFromUpstream === false) continue;
          if (!flight.departureTime || !flight.arrivalTime) continue;
          const key = flightDiscoveryKey({
            fromCity: input.fromCity,
            toCity: input.toCity,
            departureDate: date,
            flightNumber,
          });
          // Do not filter by flight numbers already operated on another date:
          // every direct number on every requested date is a candidate.
          if (existingKeys.has(key) || savedKeys.has(key) || ignored.has(key)) continue;
          const airline = normalizeDiscoveryAirline(flight.airline);
          const previous = discovered.get(key);
          if (previous) {
            // Google can return the same direct number in several fare
            // itineraries. Prefer the first schedule, but retain a carrier
            // name/price if a later duplicate contains one.
            if (!previous.airline && airline) previous.airline = airline;
            if (previous.googlePrice == null) {
              previous.googlePrice = (result.flightPriceMap[flightNumber] ?? result.routePrice) != null
                ? Number(result.flightPriceMap[flightNumber] ?? result.routePrice)
                : null;
            }
            continue;
          }
          discovered.set(key, {
            flightNumber,
            airline,
            fromCity: input.fromCity,
            toCity: input.toCity,
            departureDate: date,
            departureTime: flight.departureTime,
            arrivalDate: flight.arrivalDate,
            arrivalTime: flight.arrivalTime,
            googlePrice: (result.flightPriceMap[flightNumber] ?? result.routePrice) != null
              ? Number(result.flightPriceMap[flightNumber] ?? result.routePrice)
              : null,
          });
        }
        if (result.flights.some(flight => {
          const flightNumber = normalizeFlightNumber(flight.flightNumber);
          return !!flightNumber
            && (!flight.arrivalDate || !isCalendarDate(flight.arrivalDate)
              || flight.arrivalDateFromUpstream === false);
        })) {
          incompleteSchedule = true;
        }
        if (incompleteSchedule) {
          // One upstream date is one checked unit, even if Google returned
          // several itineraries missing the full arrival calendar date.
          progress.errors++;
          incompleteScheduleDates.add(date);
          logger.warn({ from: input.fromCity, to: input.toCity, date, reason: "incomplete_schedule" },
            "Flight discovery schedule rejected");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, dates.length) }, () => worker()));

    if (progress.error?.includes("moduli është çaktivizuar")) return;
    if (discovered.size > 0) {
      // Re-check ignored keys and real flights while holding the one global
      // discovery-store lock. Search, dismiss and add all read/modify/write
      // this JSON document under that lock, so no ignore or id is lost.
      const insertedCount = await db.transaction(async tx => {
        await lockDiscoveryStore(tx);
        const store = await getDiscoveryStore(tx);
        const currentKeys = new Set(store.candidates.map(row => flightDiscoveryKey(row)));
        const ignoredNow = new Set(store.ignored);
        let added = 0;
        for (const [key, candidate] of discovered.entries()) {
          if (ignoredNow.has(key) || currentKeys.has(key)) continue;
          const [existingFlight] = await tx.select({ id: flightsTable.id })
            .from(flightsTable)
            .where(and(
              sql`UPPER(TRIM(${flightsTable.fromCity})) = ${candidate.fromCity}`,
              sql`UPPER(TRIM(${flightsTable.toCity})) = ${candidate.toCity}`,
              eq(flightsTable.departureDate, candidate.departureDate),
              sql`UPPER(REGEXP_REPLACE(${flightsTable.flightNumber}, '[[:space:]]', '', 'g')) = ${candidate.flightNumber}`,
            ))
            .limit(1);
          if (existingFlight) continue;
          store.candidates.push({
            ...candidate,
            id: store.nextId++,
            foundAt: new Date().toISOString(),
          });
          currentKeys.add(key);
          added++;
        }
        if (added) await saveSetting(tx, STORE_SETTING_KEY, JSON.stringify(store));
        return added;
      });
      progress.found = insertedCount;
    }
    // A completely empty/failed upstream response is not a definitive
    // no-flights result. Surface all-failed searches explicitly and never
    // delete or mark anything missing.
    if (incompleteScheduleDates.size > 0) {
      progress.error = incompleteDiscoveryScheduleMessage(incompleteScheduleDates);
    } else if (progress.errors === progress.total && progress.total > 0) {
      progress.error = "Të gjitha kërkesat për këtë kërkim dështuan; lista bosh nuk është rezultat përfundimtar.";
    }
  } catch (error) {
    progress.error = error instanceof Error ? error.message : "Kërkimi i fluturimeve dështoi.";
    logger.error({ err: error }, "Flight discovery job failed");
  } finally {
    progress.running = false;
  }
}

router.get("/candidates", async (_req, res): Promise<void> => {
  const [store, flights] = await Promise.all([
    getDiscoveryStore(),
    db.select({
      fromCity: flightsTable.fromCity,
      toCity: flightsTable.toCity,
      departureDate: flightsTable.departureDate,
      flightNumber: flightsTable.flightNumber,
    }).from(flightsTable),
  ]);
  const existingKeys = new Set(flights.map(flight => flightDiscoveryKey(flight)));
  const ignored = new Set(store.ignored);
  const seen = new Set<string>();
  const candidates = [...store.candidates]
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate)
      || a.departureTime.localeCompare(b.departureTime)
      || a.id - b.id)
    .filter(row => {
    if (!isDiscoveryWizzFlight(row)) return false;
    const key = flightDiscoveryKey(row);
    if (existingKeys.has(key) || ignored.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  res.json(candidates.map(serializeCandidate));
});

router.post("/search", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const validated = normalizeSearchInput(body);
  if (validated.error) {
    res.status(400).json({ error: validated.error });
    return;
  }
  if (!process.env.RAPIDAPI_KEY) {
    res.status(503).json({ error: "Kontrolli në Google nuk është i konfiguruar (mungon API key)." });
    return;
  }
  const progress = reserveSearch(validated.input!);
  if (!progress) {
    res.status(409).json({ ...currentProgress(), error: "Një kërkim tjetër është ende në ekzekutim." });
    return;
  }
  const runId = activeRun!.id;
  void executeSearch(runId);
  res.status(202).json(progress);
});

router.get("/progress", async (_req, res): Promise<void> => {
  res.json(currentProgress());
});

router.post("/candidates/:id/dismiss", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id i kandidatit është i pavlefshëm." });
    return;
  }

  const result = await db.transaction(async tx => {
    await lockDiscoveryStore(tx);
    const store = await getDiscoveryStore(tx);
    const dismissed = dismissDiscoveryStoreCandidate(store, id);
    if (!dismissed) return null;
    await saveSetting(tx, STORE_SETTING_KEY, JSON.stringify(dismissed.store));
    return { key: dismissed.key };
  });
  if (!result) {
    res.status(404).json({ error: "Kandidati nuk u gjet." });
    return;
  }
  res.json({ dismissed: true, id });
});

router.post("/candidates/:id/add", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id i kandidatit është i pavlefshëm." });
    return;
  }
  const adult = parsePrice(req.body?.adultPrice, "adultPrice");
  const seats = parseSeats(req.body?.totalSeats);
  if (adult.error || seats.error) {
    res.status(400).json({ error: adult.error ?? seats.error });
    return;
  }

  const result = await db.transaction(async tx => {
    // The dedicated settings row is the candidate source of truth. Locking it
    // globally serializes Add/Dismiss/Search and makes id allocation plus
    // read-modify-write of ignores transactional.
    await lockDiscoveryStore(tx);
    const store = await getDiscoveryStore(tx);
    const candidate = store.candidates.find(row => row.id === id);
    if (!candidate) return { kind: "missing" as const };
    if (!isDiscoveryWizzFlight(candidate)) {
      return { kind: "invalid" as const, error: "Për momentin mund të shtohen vetëm fluturime Wizz Air." };
    }

    const validationError = validateStoredCandidate(candidate);
    if (validationError) return { kind: "invalid" as const, error: validationError };

    const [duplicate] = await tx.select().from(flightsTable).where(and(
      sql`UPPER(TRIM(${flightsTable.fromCity})) = ${normalizeDiscoveryAirport(candidate.fromCity)}`,
      sql`UPPER(TRIM(${flightsTable.toCity})) = ${normalizeDiscoveryAirport(candidate.toCity)}`,
      eq(flightsTable.departureDate, candidate.departureDate),
      sql`UPPER(REGEXP_REPLACE(${flightsTable.flightNumber}, '[[:space:]]', '', 'g')) = ${normalizeFlightNumber(candidate.flightNumber)}`,
    )).for("update");
    if (duplicate) {
      store.candidates = store.candidates.filter(row => row.id !== id);
      await saveSetting(tx, STORE_SETTING_KEY, JSON.stringify(store));
      return { kind: "duplicate" as const, flight: duplicate };
    }

    const arrivalDate = normalizeArrivalDate({
      departureDate: candidate.departureDate,
      departureTime: candidate.departureTime,
      arrivalDate: candidate.arrivalDate,
      arrivalTime: candidate.arrivalTime,
    });
    if (!arrivalDate) {
      return { kind: "invalid" as const, error: "Kandidati nuk ka datë të plotë mbërritjeje nga Google." };
    }
    const defaultBaggage = await getDefaultBaggageRule(tx);
    const [flight] = await tx.insert(flightsTable).values({
      airline: normalizeDiscoveryAirline(candidate.airline),
      flightNumber: normalizeFlightNumber(candidate.flightNumber),
      fromCity: normalizeDiscoveryAirport(candidate.fromCity),
      toCity: normalizeDiscoveryAirport(candidate.toCity),
      departureDate: candidate.departureDate,
      departureTime: candidate.departureTime,
      arrivalDate,
      arrivalTime: candidate.arrivalTime,
      adultPrice: adult.value!,
      childPrice: adult.value!, // discovery has one admin-supplied sale price
      infantPrice: "35", // Same fixed infant price as the system's flight creation/import paths.
      totalSeats: seats.value!,
      checkedBaggageCount: defaultBaggage.count,
      checkedBaggageKg: String(roundWholeEuro(defaultBaggage.kg)),
      checkedBaggagePrice: String(roundWholeEuro(defaultBaggage.price)),
      soldSeats: 0,
      status: "open",
    }).returning();
    store.candidates = store.candidates.filter(row => row.id !== id);
    await saveSetting(tx, STORE_SETTING_KEY, JSON.stringify(store));
    return { kind: "created" as const, flight };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Kandidati nuk u gjet ose u trajtua më parë." });
    return;
  }
  if (result.kind === "invalid") {
    res.status(422).json({ error: result.error });
    return;
  }
  if (result.kind === "duplicate") {
    res.status(200).json({ created: false, duplicate: true, flightId: result.flight.id });
    return;
  }

  const flight = result.flight;
  scheduleGSheetsSync();
  void scheduleNextAutoSoldOut();
  void recordSeatEvent({ flightId: flight.id, type: "created", seats: flight.totalSeats, req, note: "Krijuar nga zbulimi i fluturimeve" });
  void recordFlightChange({
    req,
    flightId: flight.id,
    source: "found-flights/add",
    note: "Fluturimi u shtua nga zbulimi i fluturimeve",
  });
  applyGooglePriceRulesToNewFlights([flight.id]);
  notifyDataChanged("flights");
  res.status(201).json({
    created: true,
    flight: {
      id: flight.id,
      airline: flight.airline,
      flightNumber: flight.flightNumber,
      fromCity: flight.fromCity,
      toCity: flight.toCity,
      departureDate: flight.departureDate,
      departureTime: flight.departureTime,
      arrivalDate: flight.arrivalDate,
      arrivalTime: flight.arrivalTime,
      adultPrice: Number(flight.adultPrice),
      childPrice: Number(flight.childPrice),
      infantPrice: Number(flight.infantPrice),
      totalSeats: flight.totalSeats,
      status: flight.status,
    },
  });
});

function validateRoutePayload(
  raw: unknown,
  index: number,
  today: string,
): { route?: FlightDiscoveryRoute; error?: string } {
  if (!raw || typeof raw !== "object") {
    return { error: `Itinerari #${index + 1} nuk është i vlefshëm.` };
  }
  const value = raw as Partial<FlightDiscoveryRoute>;
  const fromCity = normalizeDiscoveryAirport(value.fromCity);
  const toCity = normalizeDiscoveryAirport(value.toCity);
  const startDate = String(value.startDate ?? "").trim();
  const endDate = String(value.endDate ?? "").trim();
  const intervalMinutes = Number(value.intervalMinutes);
  if (typeof value.enabled !== "boolean") {
    return { error: `Itinerari #${index + 1}: enabled duhet të jetë true ose false.` };
  }
  if (!isDiscoveryAirportCode(fromCity) || !isDiscoveryAirportCode(toCity)) {
    return { error: `Itinerari #${index + 1}: kodet e aeroporteve duhet të kenë 3 shkronja.` };
  }
  if (fromCity === toCity) {
    return { error: `Itinerari #${index + 1}: aeroportet duhet të jenë të ndryshme.` };
  }
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    return { error: `Itinerari #${index + 1}: datat duhet të jenë në formatin YYYY-MM-DD.` };
  }
  const totalDays = dateRangeDays(startDate, endDate);
  if (!totalDays || totalDays > FLIGHT_DISCOVERY_MAX_DAYS) {
    return {
      error: `Itinerari #${index + 1}: intervali duhet të jetë nga 1 deri në ${FLIGHT_DISCOVERY_MAX_DAYS} ditë.`,
    };
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > MAX_INTERVAL_MINUTES) {
    return {
      error: `Itinerari #${index + 1}: intervali duhet të jetë numër i plotë nga 15 deri në ${MAX_INTERVAL_MINUTES} minuta.`,
    };
  }
  return { route: { enabled: value.enabled, intervalMinutes, startDate, endDate, fromCity, toCity } };
}

export function validateRouteList(raw: unknown, today = todayInTirane()): { routes?: FlightDiscoveryRoute[]; error?: string } {
  if (!Array.isArray(raw)) {
    return { error: "routes duhet të jetë një listë itinerarësh." };
  }
  const seen = new Set<string>();
  const routes: FlightDiscoveryRoute[] = [];
  for (let index = 0; index < raw.length; index++) {
    const validated = validateRoutePayload(raw[index], index, today);
    if (validated.error) return { error: validated.error };
    const route = validated.route!;
    const key = routeKey(route);
    if (seen.has(key)) {
      return { error: `Itinerari ${route.fromCity} → ${route.toCity} është përsëritur.` };
    }
    seen.add(key);
    routes.push(route);
  }
  return { routes };
}

router.get("/config", async (_req, res): Promise<void> => {
  res.json(await getDiscoveryConfigResponse());
});

router.put("/config", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const revision = Number(body.revision);
  if (!Number.isInteger(revision) || revision < 0) {
    res.status(400).json({ error: "revision duhet të jetë numër i plotë; ringarkoni konfigurimin." });
    return;
  }
  const validated = validateRouteList(body.routes);
  if (validated.error) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const saveResult = await db.transaction(async tx => {
    await lockDiscoveryConfig(tx);
    const currentRaw = await getSetting(CONFIG_SETTING_KEY, tx);
    const current = parseDiscoveryConfig(currentRaw);
    if (revision !== current.revision) {
      return { conflict: true as const, currentRevision: current.revision };
    }
    const config: FlightDiscoveryConfig = {
      revision: current.revision + 1,
      routes: validated.routes!,
    };
    await saveSetting(tx, CONFIG_SETTING_KEY, JSON.stringify(config));
    return { conflict: false as const, config };
  });
  if (saveResult.conflict) {
    res.status(409).json({
      error: "Konfigurimi ndryshoi nga një administrator tjetër. Ringarkojeni para se ta ruani përsëri.",
      revision: saveResult.currentRevision,
      reload: true,
    });
    return;
  }
  // Apply route/cadence changes without waiting for an old interval. A new
  // generation also makes a timer from a previous config harmless.
  schedulerGeneration++;
  schedulerRoutes.clear();
  if (schedulerTimer && scheduleNextDiscovery) clearTimeout(schedulerTimer);
  if (scheduleNextDiscovery) scheduleNextDiscovery(1000);
  res.json(await getDiscoveryConfigResponse());
});

function schedulerDelayFor(nextDueAt: number, now = Date.now()): number {
  return Math.max(1000, Math.min(60_000, nextDueAt - now));
}

async function processScheduledDiscovery(generation: number): Promise<void> {
  if (!(await isModuleEnabled("flightDiscovery"))) {
    schedulerRoutes.clear();
    if (generation === schedulerGeneration && scheduleNextDiscovery) scheduleNextDiscovery(60_000);
    return;
  }
  const now = Date.now();
  const today = todayInTirane();
  const config = await getDiscoveryConfig();
  if (generation !== schedulerGeneration) return;
  const activeInventoryKeys = await getActiveInventoryRouteKeys(today);
  if (generation !== schedulerGeneration) return;
  const configuredKeys = new Set<string>();
  let nearestDueAt = now + 60_000;
  let deferredForBusyScan = false;
  let missingApiKey = false;

  for (const route of config.routes) {
    if (generation !== schedulerGeneration) return;
    if (!(await isModuleEnabled("flightDiscovery"))) {
      schedulerRoutes.clear();
      if (scheduleNextDiscovery) scheduleNextDiscovery(60_000);
      return;
    }
    const key = routeKey(route);
    configuredKeys.add(key);
    if (route.endDate < today) {
      if (generation !== schedulerGeneration) return;
      schedulerRoutes.delete(key);
      continue;
    }
    if (!route.enabled || !activeInventoryKeys.has(key)) {
      if (generation !== schedulerGeneration) return;
      schedulerRoutes.delete(key);
      continue;
    }

    const signature = routeSignature(route);
    if (generation !== schedulerGeneration) return;
    let state = schedulerRoutes.get(key);
    if (!state || state.signature !== signature) {
      if (generation !== schedulerGeneration) return;
      state = { signature, nextDueAt: now };
      schedulerRoutes.set(key, state);
    }
    if (state.nextDueAt <= now) {
      if (activeRun?.progress.running) {
        // Do not advance nextDueAt: this due route remains pending and is
        // picked up immediately after the current manual/scheduled scan.
        deferredForBusyScan = true;
      } else if (process.env.RAPIDAPI_KEY) {
        // The configured dates describe which future flights to search, not
        // when the scheduler may start. A newly saved route is due now.
        const startDate = route.startDate < today ? today : route.startDate;
        const validated = normalizeSearchInput({ ...route, startDate }, today);
        if (generation !== schedulerGeneration) return;
        const progress = validated.input && await isModuleEnabled("flightDiscovery")
          ? reserveSearch(validated.input) : null;
        if (progress) {
          if (generation !== schedulerGeneration) return;
          state.nextDueAt = now + route.intervalMinutes * 60_000;
          const runId = activeRun!.id;
          void executeSearch(runId).finally(() => {
            if (generation === schedulerGeneration && scheduleNextDiscovery) {
              scheduleNextDiscovery(1000);
            }
          });
        } else {
          deferredForBusyScan = true;
        }
      } else {
        deferredForBusyScan = true;
        missingApiKey = true;
      }
    }
    if (generation !== schedulerGeneration) return;
    nearestDueAt = Math.min(nearestDueAt, state.nextDueAt);
  }

  if (generation !== schedulerGeneration) return;
  for (const key of schedulerRoutes.keys()) {
    if (generation !== schedulerGeneration) return;
    if (!configuredKeys.has(key)) schedulerRoutes.delete(key);
  }

  if (missingApiKey) {
    nearestDueAt = Math.min(nearestDueAt, now + 60_000);
  } else if (deferredForBusyScan) {
    nearestDueAt = Math.min(nearestDueAt, now + 1000);
  }
  if (generation === schedulerGeneration && scheduleNextDiscovery) {
    scheduleNextDiscovery(schedulerDelayFor(nearestDueAt, now));
  }
}

export function startFlightDiscoveryScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const scheduleNext = (delayMs: number) => {
    const generation = schedulerGeneration;
    if (schedulerTimer) clearTimeout(schedulerTimer);
    schedulerTimer = setTimeout(() => {
      if (generation !== schedulerGeneration) return;
      schedulerTimer = null;
      // Settings updates can re-arm this timer from a manual request. Do not
      // let inherited request context promote future automatic discovery runs.
      void withGooglePriority("background", () => processScheduledDiscovery(generation)).catch(error => {
        if (generation !== schedulerGeneration) return;
        logger.error({ err: error }, "Flight discovery scheduler failed");
        scheduleNext(60_000);
      });
    }, Math.max(1000, delayMs));
    schedulerTimer.unref();
  };
  scheduleNextDiscovery = scheduleNext;

  // The scheduler is initialized at startup but waits briefly before its
  // first database/API read; normal configured cadence starts thereafter.
  scheduleNext(1000);
}

export { router as flightDiscoveryRouter };
