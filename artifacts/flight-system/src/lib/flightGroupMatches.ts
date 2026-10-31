export type FlightGroupRule = {
  airport: string;
  direction: "either" | "from" | "to";
  dateFrom: string | null;
  dateTo: string | null;
};

export type FlightGroup = { id: number; name: string; rules: FlightGroupRule[] };
export type GroupFlight = { fromCity: string; toCity: string; departureDate: string };

export function matchingFlightGroups(flight: GroupFlight, groups: FlightGroup[]): FlightGroup[] {
  const from = flight.fromCity.trim().toUpperCase();
  const to = flight.toCity.trim().toUpperCase();
  const date = flight.departureDate;
  return groups.filter(group => group.rules.some(rule => {
    const airport = rule.airport.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(airport) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    if ((rule.dateFrom === null) !== (rule.dateTo === null)) return false;
    if (rule.dateFrom && date < rule.dateFrom) return false;
    if (rule.dateTo && date > rule.dateTo) return false;
    return rule.direction === "either" ? from === airport || to === airport
      : rule.direction === "from" ? from === airport
      : rule.direction === "to" ? to === airport : false;
  }));
}

export function groupInitials(name: string): string {
  const normalized = name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return normalized.match(/[A-Z0-9]/)?.[0] ?? "?";
}