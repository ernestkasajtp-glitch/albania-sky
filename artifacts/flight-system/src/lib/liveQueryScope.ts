/** Union of the legacy refresh scopes: one query can match only once per event. */
export function matchesLiveTopics(key: readonly unknown[], topics: ReadonlySet<string>): boolean {
  const first = key[0];
  const path = (prefix: string) => typeof first === "string" && (first === prefix || first.startsWith(`${prefix}/`));
  const bookings = topics.has("bookings") && (
    ["/api/bookings", "/bookings", "/api/payments", "/api/passengers",
      "/api/dashboard/unpaid-bookings", "/api/dashboard/passengers-today"].some(path) ||
    first === "group-tickets" || first === "flights-paginated"
  );
  const flights = topics.has("flights") && (
    first === "/api/bookings/premium-list" || first === "flights-paginated" || first === "flight-filter-routes" ||
    first === "google-prices-bulk" || first === "new-prices-bulk" || path("/api/flights")
  );
  const agents = topics.has("agents") && (
    first === "/api/bookings/premium-list" || path("/api/agents") || path("/agents")
  );
  return !!(bookings || flights || agents ||
    ((topics.has("banners") || topics.has("discounts")) && first === "banner-configs") ||
    ((topics.has("discounts") || topics.has("flights")) && first === "discount-campaigns") ||
    (topics.has("tasks") && ["tasks", "tasksStats", "tasks-entity-counts", "booking-linked-tasks", "task"].includes(String(first))) ||
    ((topics.has("claims") || topics.has("bookings") || topics.has("flights")) && path("/api/claims")) ||
    (topics.has("newprice_progress") && first === "new-price-check-cfg") ||
    (topics.has("booking_columns") && first === "booking-columns") ||
    (topics.has("enrollments") && first === "enrollments") ||
    (topics.has("modules") && first === "modules") ||
    (topics.has("page_layouts") && (first === "/api/page-layouts" || first === "/api/settings/page-layouts")));
}