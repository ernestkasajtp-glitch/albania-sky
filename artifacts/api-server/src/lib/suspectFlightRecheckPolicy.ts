import { matchingGoogleSchedule, googleScheduleSearchEvidence, type GoogleSchedule } from "./googleScheduleEvidence.js";
import { googleScheduleAlertForSearch } from "./googlePriceCachePolicy.js";

export type RecheckState = {
  identity: string;
  checkedAt: string;
  outcome: "found" | "missing" | "error" | "empty";
  missingChecks: number;
};
export type SuspectFlight = {
  id: number; fromCity: string; toCity: string; departureDate: string;
  departureTime: string; flightNumber: string; scheduleAlert: string | null;
  arrivalTime?: string | null; arrivalDate?: string | null;
  scheduleAlertDetail: string | null; alertDismissedAt: Date | null; status: string;
};
export const recheckIntervalMs = 5 * 60_000;
export const normalizeFlightCode = (s: string) => s.replace(/\s+/g, "").toUpperCase();
export function recheckIdentity(f: SuspectFlight) {
  return JSON.stringify([f.fromCity, f.toCity, f.departureDate, f.departureTime,
    normalizeFlightCode(f.flightNumber), f.scheduleAlert, f.scheduleAlertDetail, f.alertDismissedAt,
    f.arrivalTime, f.arrivalDate]);
}
export function recheckScheduleChange(f: SuspectFlight, result: {
  error?: boolean; flights: (GoogleSchedule & { flightNumber: string })[];
}): string | null {
  if (result.error) return null;
  const match = matchingGoogleSchedule(result.flights, f);
  const next = googleScheduleAlertForSearch({ ...f, scheduleMissCount: 0 },
    { price: null, routePrice: null, specific: false },
    { googleCount: result.flights.length, match });
  return next?.scheduleAlert === "time_changed" ? next.scheduleAlertDetail : null;
}
export function nextRecheck(f: SuspectFlight, previous: RecheckState | undefined,
  result: { error?: boolean; flights: GoogleSchedule[]; schedulesReliable?: boolean;
    evidence?: { missing: boolean; found: boolean } },
  checkedAt = new Date().toISOString()): RecheckState {
  const identity = recheckIdentity(f);
  const priorCount = previous?.identity === identity && Number.isInteger(previous.missingChecks)
    ? Math.max(0, previous.missingChecks) : 0;
  const evidence = result.evidence ?? (() => {
    const parsed = googleScheduleSearchEvidence(result.flights, f, result.schedulesReliable !== false);
    return { missing: parsed.missing, found: !!parsed.match };
  })();
  const outcome = result.error ? "error" : evidence.found ? "found" : evidence.missing ? "missing" : "empty";
  return { identity, checkedAt, outcome,
    missingChecks: outcome === "found" ? 0 : outcome === "missing" ? priorCount + 1 : priorCount };
}