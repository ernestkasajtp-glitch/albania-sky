// Internal schedule edits use clock rollover, not a stale stored arrival date.
// Return null while inputs are incomplete so live typing never invents a date.
export function deriveFlightArrivalDate(departureDate: string, departureTime: string, arrivalTime: string): string | null {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate) || !clock.test(departureTime) || !clock.test(arrivalTime)) return null;
  const departure = new Date(`${departureDate}T00:00:00Z`);
  if (!Number.isFinite(departure.getTime()) || departure.toISOString().slice(0, 10) !== departureDate) return null;
  if (arrivalTime < departureTime) departure.setUTCDate(departure.getUTCDate() + 1);
  return departure.toISOString().slice(0, 10);
}
