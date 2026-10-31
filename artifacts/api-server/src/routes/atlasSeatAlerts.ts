import { Router, type Request, type Response } from "express";
import { and, asc, eq, gte, lte, or } from "drizzle-orm";
import { db, flightsTable } from "@workspace/db";
import { getSeatCheckConfig } from "../lib/seatCheck.js";
import { logger } from "../lib/logger.js";
import { isModuleEnabled } from "../lib/moduleControls.js";
import { fetchWhileEnabled } from "../lib/backgroundWork.js";

export const atlasSeatAlertsRouter = Router();

type AtlasFlight = {
  id: number;
  airline: string;
  flightNumber: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  totalSeats: number;
  soldSeats: number;
};

type AtlasAlert = AtlasFlight & {
  availableSeats: number;
  checkedAt: string;
};

type ScanState = {
  status: "idle" | "running" | "completed" | "error";
  startedAt: string | null;
  completedAt: string | null;
  totalFlights: number;
  checkedFlights: number;
  alerts: AtlasAlert[];
  error: string | null;
};

const state: ScanState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  totalFlights: 0,
  checkedFlights: 0,
  alerts: [],
  error: null,
};

const SEARCH_BASE = (process.env.ATLAS_PRODUCTION_SEARCH_URL || "https://search-sg.atriptech.com/").replace(/\/+$/, "");
const MAX_PARTY = 9;
const REQUEST_DELAY_MS = 130;

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const normFlightNumber = (value: string) => value.replace(/\s+/g, "").toUpperCase();
const compactDate = (value: string) => value.replaceAll("-", "");

function tiranaParts(date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function collectFlightNumbers(value: unknown, output = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectFlightNumbers(item, output);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/flightnumber/i.test(key) && typeof child === "string" && child.trim()) {
      output.add(normFlightNumber(child));
    }
    collectFlightNumbers(child, output);
  }
  return output;
}

async function searchAtlas(
  flight: AtlasFlight,
  adults: number,
): Promise<{ found: boolean; valid: boolean }> {
  const clientId = process.env.ATLAS_PRODUCTION_CLIENT_ID;
  const clientSecret = process.env.ATLAS_PRODUCTION_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Mungojnë kredencialet Atlas Production në server.");
  }

  const response = await fetch(`${SEARCH_BASE}/search.do`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "Accept-Encoding": "gzip",
      "x-atlas-client-id": clientId,
      "x-atlas-client-secret": clientSecret,
    },
    body: JSON.stringify({
      tripType: "1",
      adultNum: adults,
      childNum: 0,
      infantNum: 0,
      fromCity: flight.fromCity.toUpperCase(),
      fromAirport: flight.fromCity.toUpperCase(),
      toCity: flight.toCity.toUpperCase(),
      toAirport: flight.toCity.toUpperCase(),
      fromDate: compactDate(flight.departureDate),
      airlines: [flight.flightNumber.slice(0, 2).toUpperCase()],
      fromFlightNumbers: [normFlightNumber(flight.flightNumber)],
      currency: "EUR",
      lastMinuteFlight: false,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    if (response.status === 429) return { found: false, valid: false };
    throw new Error(`Atlas HTTP ${response.status}`);
  }
  const payload = await response.json() as { status?: number };
  if (payload.status !== 0) {
    return { found: false, valid: false };
  }
  return {
    found: collectFlightNumbers(payload).has(normFlightNumber(flight.flightNumber)),
    valid: true,
  };
}

async function runScan(): Promise<void> {
  if (state.status === "running") return;
  state.status = "running";
  state.startedAt = new Date().toISOString();
  state.completedAt = null;
  state.totalFlights = 0;
  state.checkedFlights = 0;
  state.alerts = [];
  state.error = null;

  try {
    if (!(await isModuleEnabled("atlasAlerts"))) throw new Error("Atlas scan stopped: module disabled");
    const config = await getSeatCheckConfig();
    const now = tiranaParts();
    const through = addCalendarDays(now.date, config.days);
    const flights = await db
      .select({
        id: flightsTable.id,
        airline: flightsTable.airline,
        flightNumber: flightsTable.flightNumber,
        fromCity: flightsTable.fromCity,
        toCity: flightsTable.toCity,
        departureDate: flightsTable.departureDate,
        departureTime: flightsTable.departureTime,
        arrivalTime: flightsTable.arrivalTime,
        totalSeats: flightsTable.totalSeats,
        soldSeats: flightsTable.soldSeats,
      })
      .from(flightsTable)
      .where(and(
        eq(flightsTable.status, "open"),
        gte(flightsTable.departureDate, now.date),
        lte(flightsTable.departureDate, through),
        or(
          gte(flightsTable.departureDate, addCalendarDays(now.date, 1)),
          and(eq(flightsTable.departureDate, now.date), gte(flightsTable.departureTime, now.time)),
        ),
      ))
      .orderBy(asc(flightsTable.departureDate), asc(flightsTable.departureTime));

    state.totalFlights = flights.length;

    for (const flight of flights) {
      if (!(await isModuleEnabled("atlasAlerts"))) throw new Error("Atlas scan stopped: module disabled");
      const nine = await fetchWhileEnabled(() => isModuleEnabled("atlasAlerts"), () => searchAtlas(flight, MAX_PARTY), "Atlas scan");
      await pause(REQUEST_DELAY_MS);
      if (!nine.valid) {
        state.checkedFlights += 1;
        continue;
      }
      if (!nine.found) {
        let availableSeats = 0;
        let allValid = true;
        for (let party = 1; party <= MAX_PARTY; party += 1) {
          if (!(await isModuleEnabled("atlasAlerts"))) throw new Error("Atlas scan stopped: module disabled");
          const result = await fetchWhileEnabled(() => isModuleEnabled("atlasAlerts"), () => searchAtlas(flight, party), "Atlas scan");
          await pause(REQUEST_DELAY_MS);
          if (!result.valid) {
            allValid = false;
            break;
          }
          if (result.found) availableSeats = party;
        }
        if (allValid) {
          state.alerts.push({
            ...flight,
            availableSeats,
            checkedAt: new Date().toISOString(),
          });
          state.alerts.sort((a, b) =>
            a.departureDate.localeCompare(b.departureDate) ||
            a.departureTime.localeCompare(b.departureTime));
        }
      }
      state.checkedFlights += 1;
    }

    state.status = "completed";
    state.completedAt = new Date().toISOString();
  } catch (error) {
    state.status = "error";
    state.completedAt = new Date().toISOString();
    state.error = error instanceof Error ? error.message : "Gabim gjatë kontrollit Atlas.";
    logger.error({ err: error }, "Atlas informative seat scan failed");
  }
}

atlasSeatAlertsRouter.get("/atlas-seat-alerts", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(state);
});

atlasSeatAlertsRouter.post("/atlas-seat-alerts/run", (_req: Request, res: Response) => {
  if (state.status === "running") {
    res.status(202).json(state);
    return;
  }
  void runScan();
  res.status(202).json({ ...state, status: "running" });
});