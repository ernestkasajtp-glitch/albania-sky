type Alert = { source: string; cpCode: string | null };
type BookingLink = { id: number; bookingRef: string; cpCode: string | null };

export function priorityReference(alert: Alert): string | null {
  if (!alert.source.startsWith("priority:")) return null;
  const code = alert.cpCode?.trim().toUpperCase();
  return code || null;
}

export function priorityBookingLinks(alert: Alert, matches: BookingLink[]) {
  const code = priorityReference(alert);
  if (!code) return [];
  return matches.filter(b => b.cpCode === code)
    .map(({ id, bookingRef }) => ({ id, bookingRef }));
}
