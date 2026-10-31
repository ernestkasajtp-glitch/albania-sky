export interface WizzMonitorRouteInput {
  name: string;
  fromAirport: string;
  toAirport: string;
  startDate: string;
  endDate: string;
}

export function parseWizzAirports(value: string): string[] {
  return [...new Set(
    value.split(",").map(code => code.trim().toUpperCase()).filter(Boolean),
  )];
}

export function buildWizzMonitorRoutes(formData: WizzMonitorRouteInput): WizzMonitorRouteInput[] {
  const fromAirports = parseWizzAirports(formData.fromAirport);
  const toAirports = parseWizzAirports(formData.toAirport);
  return fromAirports.flatMap(fromAirport =>
    toAirports.map(toAirport => ({ ...formData, fromAirport, toAirport })),
  );
}