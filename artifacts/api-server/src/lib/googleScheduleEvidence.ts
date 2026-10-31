import { calendarDateMs, clockSeconds, scheduleErrorReason } from "./flightScheduleIntegrity.js";

export type GoogleSchedule = {
  departureDate?: string | null; departureTime?: string | null;
  arrivalDate?: string | null; arrivalTime?: string | null;
  fromCity?: string; toCity?: string; flightNumber?: string;
};
export const scheduleEvidenceKey = (id: number) => `googleScheduleEvidence.${id}`;
const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
export function scheduleIdentity(f: GoogleSchedule & {
  fromCity: string; toCity: string; flightNumber: string; alertDismissedAt?: Date | null;
}) {
  return JSON.stringify([norm(f.fromCity), norm(f.toCity), norm(f.flightNumber),
    f.departureDate, f.departureTime, f.arrivalDate, f.arrivalTime, f.alertDismissedAt?.getTime() ?? null]);
}
export function fullGoogleSchedule(s?: GoogleSchedule | null): boolean {
  return !!s && calendarDateMs(s.departureDate) !== null && calendarDateMs(s.arrivalDate) !== null
    && clockSeconds(s.departureTime) !== null && clockSeconds(s.arrivalTime) !== null;
}
export function googleScheduleChanges(current: GoogleSchedule, match: GoogleSchedule) {
  const labels = { departureDate: "Data e Nisjes", departureTime: "Orari i Nisjes",
    arrivalDate: "Data e Mbërritjes", arrivalTime: "Orari i Mberritjes" };
  return (Object.keys(labels) as (keyof typeof labels)[]).flatMap(key => {
    const old = current[key], next = match[key];
    const same = key.endsWith("Time") ? old?.slice(0, 5) === next?.slice(0, 5) : old === next;
    return old && next && !same ? [{ field: labels[key], old, new: next }] : [];
  });
}
export function matchingGoogleSchedule<T extends GoogleSchedule>(flights: T[],
  f: { fromCity: string; toCity: string; departureDate: string; flightNumber: string }): T | null {
  const matches = flights.filter(g => norm(g.flightNumber ?? "") === norm(f.flightNumber)
    && g.departureDate === f.departureDate
    && norm(g.fromCity ?? "") === norm(f.fromCity) && norm(g.toCity ?? "") === norm(f.toCity));
  const unique = [...new Map(matches.map(g => [JSON.stringify([
    g.departureDate, g.departureTime?.slice(0, 5), g.arrivalDate, g.arrivalTime?.slice(0, 5),
  ]), g])).values()];
  return unique.length === 1 && fullGoogleSchedule(unique[0]) ? unique[0] : null;
}
/** Absence needs positive, complete route/date alternatives, never just a count.
 * A partial or conflicting exact-code result proves neither absence nor change. */
export function googleScheduleSearchEvidence(flights: GoogleSchedule[],
  f: { fromCity: string; toCity: string; departureDate: string; flightNumber: string },
  reliable = true) {
  const relevant = flights.filter(g => g.departureDate === f.departureDate
    && norm(g.fromCity ?? "") === norm(f.fromCity) && norm(g.toCity ?? "") === norm(f.toCity));
  return {
    googleCount: relevant.length,
    match: matchingGoogleSchedule(flights, f),
    missing: reliable && relevant.length > 0 && relevant.every(g => fullGoogleSchedule(g) && !!norm(g.flightNumber ?? ""))
      && !flights.some(g => norm(g.flightNumber ?? "") === norm(f.flightNumber)),
  };
}
/** Keep provider dates verbatim. Never normalize away conflicting date evidence. */
export function validatedGoogleSync(current: Parameters<typeof scheduleIdentity>[0],
  evidence: { identity: string; schedule: GoogleSchedule } | null, requested: GoogleSchedule) {
  if (!evidence || evidence.identity !== scheduleIdentity(current) || !fullGoogleSchedule(evidence.schedule)) {
    throw new Error("Orari Google mungon ose është vjetruar. Kryeni kontrollin përsëri.");
  }
  const s = evidence.schedule;
  if (!matchingGoogleSchedule([s], {
    ...current, departureDate: current.departureDate!,
  })) throw new Error("Nuk ka përputhje unike të kodit, rrugës dhe datës në Google.");
  for (const key of ["departureDate", "departureTime", "arrivalDate", "arrivalTime"] as const) {
    if (requested[key] !== s[key]) throw new Error("Orari i kërkuar nuk përputhet me orarin e plotë Google.");
  }
  const reason = scheduleErrorReason(s);
  if (reason) throw new Error(`Orari Google nuk mund të aplikohet: ${reason}`);
  return { departureDate: s.departureDate!, departureTime: s.departureTime!,
    arrivalDate: s.arrivalDate!, arrivalTime: s.arrivalTime! };
}

/** Strict upstream timestamp parser; partial clocks never invent calendar dates. */
export function googleDateTime(value: unknown): { date: string; time: string } | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid Google datetime");
  const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/);
  if (!m) {
    if (clockSeconds(value.replace(/^(\d):/, "0$1:")) !== null) return null;
    throw new Error("Invalid Google datetime");
  }
  const date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const time = `${m[4].padStart(2, "0")}:${m[5]}`;
  if (calendarDateMs(date) === null || clockSeconds(time) === null || (m[6] && +m[6] > 59)) {
    throw new Error("Invalid Google datetime");
  }
  return { date, time };
}
