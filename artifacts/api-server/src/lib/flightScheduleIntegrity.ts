/** Internal inventory rule: flights never span more than one midnight. */
export interface FlightSchedule {
  departureDate?: string | null;
  departureTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
}

export class FlightScheduleValidationError extends Error {
  readonly status = 400;
}

/** Strict calendar validation: Date.parse alone rolls February 30 into March. */
export function calendarDateMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
    && value.slice(0, 4) !== "0000" ? ms : null;
}

/** Accept stored HH:MM and HH:MM:SS; never truncate malformed/provider text. */
export function clockSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [h, m, s = 0] = value.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

export function normalizeArrivalDate(schedule: FlightSchedule): string {
  const departureMs = calendarDateMs(schedule.departureDate);
  if (departureMs === null) throw new FlightScheduleValidationError("Data e nisjes është e pavlefshme (YYYY-MM-DD).");
  if (schedule.arrivalDate != null && calendarDateMs(schedule.arrivalDate) === null) {
    throw new FlightScheduleValidationError("Data e mbërritjes është e pavlefshme (YYYY-MM-DD).");
  }
  const departure = clockSeconds(schedule.departureTime);
  const arrival = clockSeconds(schedule.arrivalTime);
  if (departure === null || arrival === null) {
    throw new FlightScheduleValidationError("Ora e nisjes ose e mbërritjes është e pavlefshme (HH:MM).");
  }
  const expected = new Date(departureMs + (arrival < departure ? 86_400_000 : 0)).toISOString().slice(0, 10);
  if (calendarDateMs(expected) === null) throw new FlightScheduleValidationError("Data e mbërritjes del jashtë kufirit të lejuar.");
  return expected;
}

export function scheduleFieldsTouched(patch: Record<string, unknown>): boolean {
  return ["departureDate", "departureTime", "arrivalDate", "arrivalTime"].some(key => patch[key] !== undefined);
}

/** Read-only audit; deliberately does not repair or call any external service. */
export function scheduleErrorReason(schedule: FlightSchedule): string | null {
  const departureMs = calendarDateMs(schedule.departureDate);
  const arrivalMs = calendarDateMs(schedule.arrivalDate);
  const departure = clockSeconds(schedule.departureTime);
  const arrival = clockSeconds(schedule.arrivalTime);
  const reasons: string[] = [];
  if (departureMs === null) reasons.push("Data e nisjes është e pavlefshme.");
  if (arrivalMs === null) reasons.push("Data e mbërritjes është e pavlefshme.");
  if (departure === null) reasons.push("Ora e nisjes është e pavlefshme.");
  if (arrival === null) reasons.push("Ora e mbërritjes është e pavlefshme.");
  if (departureMs !== null && arrivalMs !== null && departure !== null && arrival !== null) {
    const expected = new Date(departureMs + (arrival < departure ? 86_400_000 : 0)).toISOString().split("T")[0];
    if (schedule.arrivalDate !== expected) reasons.push(`Data e mbërritjes duhet të jetë ${expected}.`);
    const duration = (arrivalMs - departureMs) / 1000 + arrival - departure;
    if (duration <= 0) reasons.push("Kohëzgjatja është zero ose negative.");
    else if (duration > 5 * 3600) reasons.push("Kohëzgjatja është mbi 5 orë.");
  }
  return reasons.length ? reasons.join(" ") : null;
}

export interface ScheduleAuditRow extends FlightSchedule {
  id: number;
  status: string;
}

/** Invalid departure values have unknown timing and remain visible for repair. */
export function upcomingScheduleErrors(rows: ScheduleAuditRow[], now: string): Map<number, string> {
  const errors = new Map<number, string>();
  for (const row of rows) {
    if (row.status === "soldout" || row.status === "cancelled") continue;
    const validDate = calendarDateMs(row.departureDate) !== null;
    const validTime = clockSeconds(row.departureTime) !== null;
    if (validDate && (row.departureDate! < now.slice(0, 10)
      || (validTime && `${row.departureDate} ${row.departureTime}` < now))) continue;
    const reason = scheduleErrorReason(row);
    if (reason) errors.set(row.id, reason);
  }
  return errors;
}
