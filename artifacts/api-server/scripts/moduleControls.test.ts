import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { moduleCatalogue, moduleEnvelope } from "../src/lib/moduleControls";
import { createModuleGuard, moduleControlsRouter, moduleForApiPath } from "../src/routes/moduleControls";

test("catalogue has stable independent IDs and core recovery paths cannot be switched off", () => {
  assert.equal(new Set(moduleCatalogue.map(module => module.id)).size, moduleCatalogue.length);
  for (const id of ["flightDiscovery", "wizzMonitor", "kyte", "atlasAlerts", "adminEmail",
    "offlineFlights", "scheduleCheck", "scheduleChanges", "googlePrices", "reports",
    "tasks", "notifications", "agents", "groupTickets", "priceRequests", "claim",
    "destinations"]) {
    assert.ok(moduleCatalogue.some(module => module.id === id && !("locked" in module)), id);
  }
  for (const id of ["settings", "flights", "bookings", "payments", "integrations", "permissions"]) {
    assert.equal(moduleEnvelope({ revision: 0, enabled: {} }).modules.find(module => module.id === id)?.locked, true);
  }
  for (const entry of moduleCatalogue) {
    assert.doesNotMatch(`${entry.label} ${entry.description} ${"reason" in entry ? entry.reason : ""}`, /citizenplane/i);
  }
});

test("dedicated endpoints are gated, but public routes and shared reads are not", () => {
  const cases: Array<[string, string, string]> = [
    ["/flight-discovery/search", "POST", "flightDiscovery"],
    ["/flights/google-search/jobs", "POST", "flightDiscovery"],
    ["/flights/google-search/jobs/17", "GET", "flightDiscovery"],
    ["/flights/google-search", "POST", "flightDiscovery"],
    ["/wizz-price-monitors/run-all", "POST", "wizzMonitor"],
    ["/wizz-price-monitors/8/run", "POST", "wizzMonitor"],
    ["/kyte/search", "POST", "kyte"],
    ["/kyte/sandbox/book", "POST", "kyte"],
    ["/kyte/sandbox/bookings", "GET", "kyte"],
    ["/atlas-seat-alerts", "GET", "atlasAlerts"],
    ["/atlas-seat-alerts/run", "POST", "atlasAlerts"],
    ["/admin-email/messages", "GET", "adminEmail"],
    ["/citizenplane/export", "POST", "offlineFlights"],
    ["/citizenplane/export/preview", "GET", "offlineFlights"],
    ["/settings/citizen-pricing", "PUT", "offlineFlights"],
    ["/flights/42/citizen-price", "PATCH", "offlineFlights"],
    ["/flights/schedule-check-email", "POST", "scheduleCheck"],
    ["/flights/42/sync-schedule", "PATCH", "scheduleCheck"],
    ["/schedule-changes/42/send", "POST", "scheduleChanges"],
    ["/google-price-rules", "GET", "googlePrices"],
    ["/settings/no-price-check/run", "POST", "googlePrices"],
    ["/settings/stale-price-check/progress", "GET", "googlePrices"],
    ["/settings/new-price-check/run-selected", "POST", "googlePrices"],
    ["/flights/google-price/refresh", "POST", "googlePrices"],
    ["/flights/google-price/apply-bulk", "POST", "googlePrices"],
    ["/flights/check-google-selected", "POST", "googlePrices"],
    ["/flights/42/google-price/apply", "POST", "googlePrices"],
    ["/reports/sales", "GET", "reports"],
    ["/reports/export/excel/live", "GET", "reports"],
    ["/assistant/actions/5/confirm", "POST", "reports"],
    ["/flights/report-data", "POST", "reports"],
    ["/tasks-notifications", "GET", "tasks"],
    ["/flights/seat-alerts", "GET", "notifications"],
    ["/bookings/42/email-alerts/read", "POST", "notifications"],
    ["/agents/42", "PATCH", "agents"],
    ["/agents/42", "GET", "agents"],
    ["/payments", "GET", "payments"],
    ["/payments/42/invoice", "GET", "payments"],
    ["/group-tickets/import", "POST", "groupTickets"],
    ["/price-requests/42/approve", "POST", "priceRequests"],
    ["/cp-import-alerts", "GET", "importAlerts"],
    ["/cp-import-alerts/8/resolve", "POST", "importAlerts"],
    ["/admin/destinations/42", "DELETE", "destinations"],
    ["/admin/destinations", "GET", "destinations"],
    ["/ADMIN/DESTINATIONS/42", "DELETE", "destinations"],
    ["/TASKS/42", "GET", "tasks"],
  ];
  for (const [path, method, id] of cases) assert.equal(moduleForApiPath(path, method), id, `${method} ${path}`);
  for (const path of ["/v1/flights", "/public/flights", "/public/bookings", "/booking-engine/settings",
    "/settings", "/modules", "/flights", "/bookings", "/payment-methods", "/agents", "/destinations",
    "/flights/extend-search", "/flights/found-flights/search", "/airport-alternatives"]) {
    assert.equal(moduleForApiPath(path, "GET"), undefined, path);
  }
  assert.equal(moduleForApiPath("/destinations", "POST"), undefined);
});

test("disabled modules cannot reach their handlers while unrelated endpoints still work", async () => {
  const app = express();
  const checked: string[] = [];
  // These routes are mounted before the FMS-only guard in routes/index.ts.
  app.get("/v1/flights", (_req, res) => res.json({ public: true }));
  app.get("/public/flights", (_req, res) => res.json({ public: true }));
  app.get("/destinations", (_req, res) => res.json({ public: true }));
  const guard = createModuleGuard(async id => {
    checked.push(id);
    return id !== "tasks" && id !== "googlePrices" && id !== "flightDiscovery" && id !== "destinations";
  });
  app.use(guard);
  app.all(/.*/, (_req, res) => res.json({ reached: true }));
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected server port");
    const fetchPath = (path: string) => fetch(`http://127.0.0.1:${address.port}${path}`);
    const blocked = await fetchPath("/tasks/42");
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), { error: "Module disabled", module: "tasks" });
    assert.equal((await fetchPath("/TaSkS/42")).status, 403);
    for (const path of ["/flights/google-search/jobs/17", "/flights/google-price/refresh", "/admin/destinations"]) {
      assert.equal((await fetchPath(path)).status, 403, path);
    }
    for (const path of ["/modules", "/settings", "/v1/flights", "/public/flights", "/bookings"]) {
      assert.equal((await fetchPath(path)).status, 200, path);
    }
    assert.equal((await fetchPath("/destinations")).status, 200);
    assert.deepEqual(checked, ["tasks", "tasks", "flightDiscovery", "googlePrices", "destinations"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("a module lookup error fails closed, without affecting partner and public paths", async () => {
  const app = express();
  app.use(createModuleGuard(async () => { throw new Error("database offline"); }));
  app.all(/.*/, (_req, res) => res.json({ reached: true }));
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected server port");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/tasks`)).status, 503);
    assert.equal((await fetch(`${base}/v1/flights`)).status, 200);
    assert.equal((await fetch(`${base}/public/flights`)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("update route rejects non-admin, unknown, locked and malformed requests before DB access", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as typeof req & { session: { role: string; userId: number } }).session = {
      role: req.headers["x-test-role"] as string,
      userId: 1,
    };
    next();
  });
  app.use(moduleControlsRouter);
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected server port");
    const request = (path: string, role: string, body: unknown) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "x-test-role": role },
        body: JSON.stringify(body),
      });
    assert.equal((await request("/modules/tasks", "manager", { enabled: false })).status, 403);
    assert.equal((await request("/modules/tasks", "agent_staff", { enabled: false })).status, 403);
    assert.equal((await request("/modules/invalid", "admin", { enabled: false })).status, 404);
    assert.equal((await request("/modules/settings", "admin", { enabled: false })).status, 409);
    assert.equal((await request("/modules/tasks", "admin", { enabled: "false" })).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});