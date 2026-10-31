// Fully enabled, contract-shaped FMS module response for isolated browser fixtures.
// Keep paths in sync with the public GET /api/modules catalogue.
const entries = [
  ["flightDiscovery", ["/flight-discovery"]],
  ["wizzMonitor", ["/wizz-price-monitor"]],
  ["kyte", ["/kyte-search"]],
  ["atlasAlerts", ["/atlas-seat-alerts"]],
  ["adminEmail", ["/admin-email"]],
  ["offlineFlights", ["/offline-flights"]],
  ["scheduleCheck", ["/schedule-check"]],
  ["scheduleChanges", ["/schedule-changes"]],
  ["googlePrices", ["/price-rules"]],
  ["reports", ["/reports", "/assistant"]],
  ["tasks", ["/tasks"]],
  ["notifications", ["/notifications"]],
  ["agents", ["/agents"]],
  ["payments", ["/payments"]],
  ["groupTickets", ["/group-tickets"]],
  ["priceRequests", ["/price-requests", "/my-requests"]],
  ["claim", ["/claim"]],
  ["destinations", ["/destinations"]],
  ["importAlerts", ["/import-alerts"]],
  ["flightTypes", ["/flight-types"]],
  ["dashboard", ["/"]],
  ["flights", ["/flights"]],
  ["bookings", ["/bookings"]],
  ["passengers", ["/passengers"]],
  ["settings", ["/settings"]],
  ["integrations", ["/integrations"]],
  ["users", ["/users"]],
  ["permissions", ["/permissions"]],
];

const locked = new Set(["flightTypes", "dashboard", "flights", "bookings", "passengers", "settings", "integrations", "users", "permissions"]);

export function enabledModules() {
  return {
    revision: 0,
    modules: entries.map(([id, paths]) => ({
      id, paths, label: id, description: `Fixture: ${id}`,
      enabled: true, locked: locked.has(id),
      ...(locked.has(id) ? { reason: "Required core module" } : {}),
    })),
  };
}