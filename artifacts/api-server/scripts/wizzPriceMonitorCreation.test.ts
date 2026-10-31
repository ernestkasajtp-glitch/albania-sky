import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { mock } from "node:test";
import { db } from "@workspace/db";
import { PgDialect } from "drizzle-orm/pg-core";
import express from "express";
import {
  applyWizzMonitorCreate,
  createSerializedWizzStoreMutator,
  type WizzMonitor,
  type WizzStore,
  WizzMonitorDuplicateError,
  getWizzMonitoringEnabled, setWizzMonitoringEnabled, runWizzPriceMonitor,
  runAllWizzPriceMonitors,
} from "../src/lib/wizzPriceMonitor.js";
import { buildWizzPriceMonitorRouter } from "../src/routes/wizzPriceMonitor.js";
import { buildWizzMonitorRoutes } from "../../flight-system/src/lib/wizzMonitorRoutes.js";

const baseInput = {
  fromAirport: "TIA",
  toAirport: "BUD",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  createdBy: 7,
};

function routeTestApp() {
  let store: WizzStore = { version: 1, monitors: [] };
  let sequence = 0;
  const activeRuns = new Set<string>();
  let runAllActive = false;
  let monitoringEnabled = true;
  const mutate = createSerializedWizzStoreMutator(
    async () => structuredClone(store),
    async next => { store = structuredClone(next); },
  );
  const getMonitor = async (id: string) => store.monitors.find(monitor => monitor.id === id);
  const router = buildWizzPriceMonitorRouter({
    getWizzMonitoringEnabled: async () => monitoringEnabled,
    setWizzMonitoringEnabled: async enabled => { monitoringEnabled = enabled; return enabled; },
    createWizzMonitor: async input => mutate(next => applyWizzMonitorCreate(
      next,
      input,
      "2026-09-22T12:00:00.000Z",
      `route-${++sequence}`,
    )),
    updateWizzMonitor: async (id, patch) => mutate(next => {
      const monitor = next.monitors.find(candidate => candidate.id === id);
      if (!monitor) return undefined;
      const fromAirport = patch.fromAirport ?? monitor.fromAirport;
      const toAirport = patch.toAirport ?? monitor.toAirport;
      if (next.monitors.some(candidate =>
        candidate.id !== id &&
        candidate.fromAirport === fromAirport &&
        candidate.toAirport === toAirport
      )) {
        throw new WizzMonitorDuplicateError(fromAirport, toAirport);
      }
      Object.assign(monitor, patch);
      return monitor;
    }),
    getWizzMonitor: getMonitor,
    listWizzMonitors: async () => store.monitors,
    deleteWizzMonitor: async id => {
      const index = store.monitors.findIndex(monitor => monitor.id === id);
      if (index === -1) return false;
      store.monitors.splice(index, 1);
      return true;
    },
    getWizzRunInfo: () => ({}),
    getWizzMonitorDefaultRule: async () => null,
    isWizzRunActive: id => activeRuns.has(id),
    isWizzRunAllActive: () => runAllActive,
    runAllWizzPriceMonitors: async () => { runAllActive = true; },
    runWizzPriceMonitor: async id => { activeRuns.add(id); },
    setWizzMonitorDefaultRule: async rule => rule,
  });
  const app = express();
  app.use(express.json());
  app.use("/wizz-price-monitors", router);
  return app;
}

async function withRouteServer(
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = routeTestApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}/wizz-price-monitors`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())
    );
  }
}

const postJson = (url: string, body: object, method = "POST") => fetch(url, {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("global Wizz switch persists separately and stopped workers do not fetch or rewrite monitors", async () => {
  const values = new Map<string, string>();
  const dialect = new PgDialect();
  const select = mock.method(db, "select", () => ({
    from: () => ({
      where: async (condition: any) => {
        const key = String(dialect.sqlToQuery(condition).params[0]);
        return values.has(key) ? [{ key, value: values.get(key) }] : [];
      },
    }),
  }) as any);
  const insert = mock.method(db, "insert", () => ({
    values: (row: { key: string; value: string }) => ({
      onConflictDoUpdate: async () => { values.set(row.key, row.value); },
    }),
  }) as any);
  const upstream = mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external request"); });
  try {
    assert.equal(await getWizzMonitoringEnabled(), true, "legacy installation remains enabled");
    const store: WizzStore = { version: 1, monitors: [] };
    applyWizzMonitorCreate(store, { ...baseInput, startDate: "2099-01-01", endDate: "2099-01-02" }, "2026-10-07", "fixture");
    const saved = JSON.stringify(store);
    values.set("wizz_price_monitors.v1", saved);
    await setWizzMonitoringEnabled(false);
    assert.equal(await getWizzMonitoringEnabled(), false);
    await runWizzPriceMonitor("fixture");
    await runAllWizzPriceMonitors();
    assert.equal(upstream.mock.callCount(), 0);
    assert.equal(values.get("wizz_price_monitors.v1"), saved, "monitor settings/results untouched");
    await setWizzMonitoringEnabled(true);
    assert.equal(await getWizzMonitoringEnabled(), true);
    assert.equal(values.get("wizz_price_monitors.v1"), saved);
  } finally {
    upstream.mock.restore(); select.mock.restore(); insert.mock.restore();
  }
});

test("global switch blocks both manual endpoints and restores them after activation", async () => {
  await withRouteServer(async baseUrl => {
    const created = await postJson(baseUrl, baseInput);
    const { id } = await created.json() as { id: string };
    const invalid = await postJson(`${baseUrl}/monitoring`, { enabled: "false" }, "PUT");
    assert.equal(invalid.status, 400);
    assert.equal((await (await fetch(baseUrl)).json()).monitoringEnabled, true);
    const paused = await postJson(`${baseUrl}/monitoring`, { enabled: false }, "PUT");
    assert.deepEqual(await paused.json(), { monitoringEnabled: false });
    assert.equal((await postJson(`${baseUrl}/${id}/run`, {})).status, 409);
    assert.equal((await postJson(`${baseUrl}/run-all`, {})).status, 409);
    const state = await (await fetch(baseUrl)).json();
    assert.equal(state.monitoringEnabled, false);
    assert.equal(state.monitors.length, 1);
    assert.equal(state.monitors[0].enabled, true);
    await postJson(`${baseUrl}/monitoring`, { enabled: true }, "PUT");
    assert.equal((await postJson(`${baseUrl}/${id}/run`, {})).status, 202);
    assert.equal((await postJson(`${baseUrl}/run-all`, {})).status, 202);
  });
});

test("route contract distinguishes create, recreate, invalid input, and duplicate update", async () => {
  await withRouteServer(async baseUrl => {
    const first = await postJson(baseUrl, baseInput);
    assert.equal(first.status, 201);
    const firstBody = await first.json() as { id: string; created: boolean };
    assert.equal(firstBody.created, true);

    const recreated = await postJson(baseUrl, {
      ...baseInput,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    assert.equal(recreated.status, 200);
    assert.equal((await recreated.json() as { created: boolean }).created, false);

    const invalid = await postJson(baseUrl, { ...baseInput, fromAirport: "TI" });
    assert.equal(invalid.status, 400);

    const second = await postJson(baseUrl, { ...baseInput, toAirport: "VIE" });
    assert.equal(second.status, 201);
    const secondBody = await second.json() as { id: string };

    const duplicateUpdate = await postJson(
      `${baseUrl}/${secondBody.id}`,
      { fromAirport: "TIA", toAirport: "BUD" },
      "PATCH",
    );
    assert.equal(duplicateUpdate.status, 409);
  });
});

test("action routes preserve delete, manual run, missing-monitor, and default-rule responses", async () => {
  await withRouteServer(async baseUrl => {
    const created = await postJson(baseUrl, baseInput);
    const { id } = await created.json() as { id: string };

    const started = await postJson(`${baseUrl}/${id}/run`, {});
    assert.equal(started.status, 202);
    assert.deepEqual(await started.json(), { started: true });

    const alreadyRunning = await postJson(`${baseUrl}/${id}/run`, {});
    assert.equal(alreadyRunning.status, 409);
    assert.deepEqual(await alreadyRunning.json(), {
      error: "Ky monitor po kontrollohet tashmë.",
    });

    const missingRun = await postJson(`${baseUrl}/missing/run`, {});
    assert.equal(missingRun.status, 404);
    assert.deepEqual(await missingRun.json(), { error: "Monitori nuk u gjet." });

    const deleted = await fetch(`${baseUrl}/${id}`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { ok: true });

    const missingDelete = await fetch(`${baseUrl}/${id}`, { method: "DELETE" });
    assert.equal(missingDelete.status, 404);
    assert.deepEqual(await missingDelete.json(), { error: "Monitori nuk u gjet." });

    const invalidDefaultRule = await postJson(
      `${baseUrl}/default`,
      { startDate: "2026-11-30", endDate: "2026-11-01" },
      "PUT",
    );
    assert.equal(invalidDefaultRule.status, 400);
    assert.deepEqual(await invalidDefaultRule.json(), {
      error: "Data e mbarimit duhet të jetë pas datës së fillimit.",
    });
  });
});

test("simultaneous creates leave one route and the later period updates it", async () => {
  let persisted: { version: 1; monitors: WizzMonitor[] } = { version: 1, monitors: [] };
  const mutate = createSerializedWizzStoreMutator(
    async () => structuredClone(persisted),
    async store => {
      await new Promise(resolve => setTimeout(resolve, 5));
      persisted = structuredClone(store);
    },
  );

  const [first, second] = await Promise.all([
    mutate(store => applyWizzMonitorCreate(store, baseInput, "2026-09-22T10:00:00.000Z", "first")),
    mutate(store => applyWizzMonitorCreate(store, {
      ...baseInput,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    }, "2026-09-22T10:00:01.000Z", "second")),
  ]);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(persisted.monitors.length, 1);
  assert.equal(persisted.monitors[0].id, "first");
  assert.equal(persisted.monitors[0].startDate, "2026-11-01");
  assert.equal(persisted.monitors[0].endDate, "2026-11-30");
});

test("period changes clear old results, alerts, run times, and errors", () => {
  const monitor: WizzMonitor = {
    id: "existing",
    name: "TIA → BUD",
    ...baseInput,
    enabled: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    lastRunAt: "2026-09-20T08:00:00.000Z",
    lastCompletedAt: "2026-09-20T08:05:00.000Z",
    lastError: "old failure",
    results: [{
      departureDate: "2026-10-10", flightNumber: "W45123", airline: "Wizz Air",
      departureTime: "08:00", arrivalTime: "09:30", currentPrice: 49,
      previousPrice: 59, lowestPrice: 49, dropAmount: 10, dropPercent: 16.95,
      lastCheckedAt: "2026-09-20T08:00:00.000Z", history: [],
    }],
    pendingAlerts: [{
      eventId: "old-alert", departureDate: "2026-10-10", flightNumber: "W45123",
      airline: "Wizz Air", departureTime: "08:00", arrivalTime: "09:30",
      currentPrice: 49, previousPrice: 59, lowestPrice: 49, dropAmount: 10,
      dropPercent: 16.95, lastCheckedAt: "2026-09-20T08:00:00.000Z",
    }],
  };
  const store = { version: 1 as const, monitors: [monitor] };

  const result = applyWizzMonitorCreate(store, {
    ...baseInput,
    startDate: "2026-12-01",
    endDate: "2026-12-20",
  }, "2026-09-22T11:00:00.000Z", "unused");

  assert.equal(result.created, false);
  assert.deepEqual(monitor.results, []);
  assert.deepEqual(monitor.pendingAlerts, []);
  assert.equal(monitor.lastRunAt, null);
  assert.equal(monitor.lastCompletedAt, null);
  assert.equal(monitor.lastError, null);
});

test("multiple departures or multiple arrivals produce the exact routes", () => {
  const common = { name: "", startDate: "2026-10-01", endDate: "2026-10-31" };
  assert.deepEqual(
    buildWizzMonitorRoutes({ ...common, fromAirport: "tia, skp, TIA", toAirport: "BUD" })
      .map(({ fromAirport, toAirport }) => `${fromAirport}-${toAirport}`),
    ["TIA-BUD", "SKP-BUD"],
  );
  assert.deepEqual(
    buildWizzMonitorRoutes({ ...common, fromAirport: "TIA", toAirport: "bud, vie" })
      .map(({ fromAirport, toAirport }) => `${fromAirport}-${toAirport}`),
    ["TIA-BUD", "TIA-VIE"],
  );
});