import { normalizeAirportCode } from "./airports.js";

export interface FlightIdentifiers {
  fromCity: string;
  toCity: string;
  airline: string;
  flightNumber: string;
}

export function normalizeFlightNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function normalizeAirline(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeFlightIdentifiers<T extends FlightIdentifiers>(value: T): T {
  return {
    ...value,
    fromCity: normalizeAirportCode(value.fromCity),
    toCity: normalizeAirportCode(value.toCity),
    airline: normalizeAirline(value.airline),
    flightNumber: normalizeFlightNumber(value.flightNumber),
  };
}

export function normalizeFlightIdentifierPatch<T extends Partial<FlightIdentifiers>>(value: T): T {
  return {
    ...value,
    ...(value.fromCity !== undefined ? { fromCity: normalizeAirportCode(value.fromCity) } : {}),
    ...(value.toCity !== undefined ? { toCity: normalizeAirportCode(value.toCity) } : {}),
    ...(value.airline !== undefined ? { airline: normalizeAirline(value.airline) } : {}),
    ...(value.flightNumber !== undefined ? { flightNumber: normalizeFlightNumber(value.flightNumber) } : {}),
  } as T;
}

export function flightTypeIdentity(value: Pick<FlightIdentifiers, "fromCity" | "toCity" | "flightNumber">): string {
  return [
    normalizeAirportCode(value.fromCity),
    normalizeAirportCode(value.toCity),
    normalizeFlightNumber(value.flightNumber),
  ].join("|");
}

export function splitCanonicalFlightNumber(raw: string): { airlineCode: string; flightNo: string } {
  const canonical = normalizeFlightNumber(raw);
  return { airlineCode: canonical.substring(0, 2), flightNo: canonical.substring(2) };
}