// Shared booking search matcher used by the classic and premium bookings lists.
// Matches the search query against EVERYTHING inside a booking: reference, PNR,
// customer, agency (agent) name, CitizenPlane / CP code (stored in `notes` and
// `source`), flight info, and every passenger's first/last name, passport, seat
// and PNR. Multi-word queries are matched as AND across all fields, so typing
// "first last" finds a booking even though the name is split into two fields.
export function bookingMatchesSearch(b: any, rawQuery: string): boolean {
  const query = (rawQuery ?? "").trim().toLowerCase();
  if (!query) return true;

  const parts: (string | null | undefined)[] = [
    b?.bookingRef,
    b?.pnr,
    b?.customerName,
    b?.customerEmail,
    b?.customerPhone,
    b?.agentName,
    b?.source,
    b?.notes,
    b?.status,
  ];

  const f = b?.flight;
  if (f) {
    parts.push(f.flightNumber, f.airline, f.fromCity, f.toCity, f.fromAirport, f.toAirport);
  }

  for (const p of (b?.passengers ?? [])) {
    parts.push(p?.firstName, p?.lastName, p?.passportNumber, p?.pnr, p?.seatNumber, p?.groupPnr);
  }

  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  return terms.every(t => haystack.includes(t));
}
