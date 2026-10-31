export type RuleFlight = {
  id: number; fromCity: string; toCity: string; airline: string; flightNumber: string;
};
export function groupRuleFlights(flights: RuleFlight[]) {
  const groups = new Map<string, RuleFlight & { key: string; ids: number[] }>();
  for (const f of flights) {
    const fromCity = f.fromCity.trim().toUpperCase();
    const toCity = f.toCity.trim().toUpperCase();
    const flightNumber = f.flightNumber.replace(/\s+/g, "").toUpperCase();
    const key = `${fromCity}|${toCity}|${flightNumber}`;
    const found = groups.get(key);
    if (found) found.ids.push(f.id);
    else groups.set(key, { ...f, fromCity, toCity, flightNumber, key, ids: [f.id] });
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
export function setRuleFlightSelected(selected: number[], ids: number[], add: boolean) {
  const group = new Set(ids);
  return add ? [...new Set([...selected, ...ids])] : selected.filter(id => !group.has(id));
}
