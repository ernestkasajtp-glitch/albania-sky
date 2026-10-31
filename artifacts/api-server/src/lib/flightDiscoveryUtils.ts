import { normalizeAirportCode } from "./airports.js";
import { normalizeAirline, normalizeFlightNumber } from "./flightIdentifiers.js";

export const FLIGHT_DISCOVERY_MAX_DAYS = 31;
export const FLIGHT_DISCOVERY_MIN_INTERVAL_MINUTES = 15;
export const FLIGHT_DISCOVERY_MAX_INTERVAL_MINUTES = 30 * 24 * 60;

export function isDiscoveryWizzFlight(flight: { flightNumber: string; airline?: string }): boolean {
  const number = normalizeFlightNumber(flight.flightNumber);
  return /^(?:W4|W6|W9|5W)\d+$/.test(number) || /\bwizz\b/i.test(flight.airline ?? "");
}

export type FlightDiscoveryConfig = {
  revision: number;
  routes: FlightDiscoveryRoute[];
};

export type FlightDiscoveryRoute = {
  enabled: boolean;
  intervalMinutes: number;
  startDate: string;
  endDate: string;
  fromCity: string;
  toCity: string;
};

export const DEFAULT_FLIGHT_DISCOVERY_CONFIG: FlightDiscoveryConfig = {
  revision: 0,
  routes: [],
};

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AIRPORT_CODE_RE = /^[A-Z]{3}$/;

/**
 * Keep a discovery key independent of display casing/spacing. The date is
 * deliberately part of the identity: the same number can operate on many
 * dates, and status never participates in this key.
 */
export function flightDiscoveryKey(input: {
  fromCity: string;
  toCity: string;
  departureDate: string;
  flightNumber: string;
}): string {
  return [
    normalizeAirportCode(input.fromCity),
    normalizeAirportCode(input.toCity),
    input.departureDate.trim(),
    normalizeFlightNumber(input.flightNumber),
  ].join("|");
}

export function normalizeDiscoveryAirport(raw: unknown): string {
  return normalizeAirportCode(String(raw ?? ""));
}

export function isDiscoveryAirportCode(value: string): boolean {
  return AIRPORT_CODE_RE.test(value);
}

export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function todayInTirane(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function dateRangeDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function addDays(isoDate: string, days: number): string {
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
}

function parseRoute(raw: unknown): FlightDiscoveryRoute | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<FlightDiscoveryRoute>;
  const fromCity = normalizeDiscoveryAirport(value.fromCity);
  const toCity = normalizeDiscoveryAirport(value.toCity);
  const intervalMinutes = Number(value.intervalMinutes);
  const startDate = String(value.startDate ?? "").trim();
  const endDate = String(value.endDate ?? "").trim();
  if (typeof value.enabled !== "boolean"
      || !isDiscoveryAirportCode(fromCity)
      || !isDiscoveryAirportCode(toCity)
      || fromCity === toCity
      || !isCalendarDate(startDate)
      || !isCalendarDate(endDate)
      || dateRangeDays(startDate, endDate) < 1
      || dateRangeDays(startDate, endDate) > FLIGHT_DISCOVERY_MAX_DAYS
      || !Number.isInteger(intervalMinutes)
      || intervalMinutes < FLIGHT_DISCOVERY_MIN_INTERVAL_MINUTES
      || intervalMinutes > FLIGHT_DISCOVERY_MAX_INTERVAL_MINUTES) {
    return null;
  }
  return { enabled: value.enabled, intervalMinutes, startDate, endDate, fromCity, toCity };
}

/**
 * Parse the dedicated route settings document. Older installations stored one
 * route with `enabled`, `days`, `fromCity`, and `toCity`; that shape is
 * migrated in memory (including valid disabled routes) to a route covering
 * today through today + days - 1.
 */
export function parseDiscoveryConfig(
  value: string | null | undefined,
  today = todayInTirane(),
): FlightDiscoveryConfig {
  if (!value) return { ...DEFAULT_FLIGHT_DISCOVERY_CONFIG };
  try {
    const parsed = JSON.parse(value) as Partial<FlightDiscoveryConfig> & {
      enabled?: unknown;
      intervalMinutes?: unknown;
      days?: unknown;
      fromCity?: unknown;
      toCity?: unknown;
    };
    const revision = Number(parsed.revision);
    const safeRevision = Number.isInteger(revision) && revision >= 0 ? revision : 0;
    if (Array.isArray(parsed.routes)) {
      const seen = new Set<string>();
      const routes = parsed.routes.flatMap(raw => {
        const route = parseRoute(raw);
        if (!route) return [];
        const key = `${route.fromCity}|${route.toCity}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [route];
      });
      return { revision: safeRevision, routes };
    }

    const fromCity = normalizeDiscoveryAirport(parsed.fromCity);
    const toCity = normalizeDiscoveryAirport(parsed.toCity);
    const intervalMinutes = Number(parsed.intervalMinutes);
    const days = Number(parsed.days);
    if ((parsed.enabled === true || parsed.enabled === false)
        && isDiscoveryAirportCode(fromCity)
        && isDiscoveryAirportCode(toCity)
        && fromCity !== toCity
        && isCalendarDate(today)
        && Number.isInteger(days)
        && days >= 1) {
      const boundedDays = Math.min(days, FLIGHT_DISCOVERY_MAX_DAYS);
      return {
        revision: safeRevision,
        routes: [{
          enabled: parsed.enabled === true,
        intervalMinutes: Number.isInteger(intervalMinutes) && intervalMinutes >= FLIGHT_DISCOVERY_MIN_INTERVAL_MINUTES
            ? Math.min(intervalMinutes, FLIGHT_DISCOVERY_MAX_INTERVAL_MINUTES)
            : 1440,
          startDate: today,
          endDate: addDays(today, boundedDays - 1),
          fromCity,
          toCity,
        }],
      };
    }
    return { ...DEFAULT_FLIGHT_DISCOVERY_CONFIG };
  } catch {
    return { ...DEFAULT_FLIGHT_DISCOVERY_CONFIG };
  }
}

export function normalizeDiscoveryAirline(raw: unknown): string {
  return normalizeAirline(String(raw ?? ""));
}
