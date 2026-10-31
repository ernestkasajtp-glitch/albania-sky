export type GoogleLookupFlight = {
  excludeFromGoogleRule?: boolean | null;
  status?: string | null;
};

/**
 * Shared hook before grouping flights into Google/RapidAPI requests.
 * "Përjashtuar Online" now means that Google price rules and automatic
 * sold-out changes are blocked; the flight itself must still be checked so
 * admins can see live price, schedule and availability information.
 */
export function flightsEligibleForGoogleLookup<T extends GoogleLookupFlight>(flights: readonly T[]): T[] {
  return flights.filter(f => f.status !== "soldout" && f.status !== "cancelled");
}

export function canAutoSoldOutFromGoogle(flight: GoogleLookupFlight): boolean {
  return flight.excludeFromGoogleRule !== true;
}

export async function forEachGoogleLookupGroup<T extends GoogleLookupFlight>(
  flights: readonly T[],
  groupKey: (flight: T) => string,
  lookup: (key: string, flights: T[]) => Promise<void>,
): Promise<void> {
  const groups = new Map<string, T[]>();
  for (const flight of flightsEligibleForGoogleLookup(flights)) {
    const key = groupKey(flight);
    const group = groups.get(key) ?? [];
    group.push(flight);
    groups.set(key, group);
  }
  for (const [key, group] of groups) await lookup(key, group);
}