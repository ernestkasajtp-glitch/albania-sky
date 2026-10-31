/**
 * Child process for the disposable-Postgres restart test. Only the session and
 * external work are fixtures: router, cache, SQL persistence, guard and worker
 * cycle are production implementations. Never import the full app (cron jobs).
 */
import assert from "node:assert/strict";
import express from "express";
import { db, pool, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isModuleEnabled } from "../src/lib/moduleControls";
import { guardModuleApi, moduleControlsRouter } from "../src/routes/moduleControls";
import { runDueWizzMonitorCycle } from "../src/lib/wizzPriceMonitorPolicy";

if (process.env.MODULE_RESTART_FIXTURE !== "isolated-postgres") {
  throw new Error("Run via moduleControls.restart.test.mjs only");
}

const KEY = "fms_module_controls_v1";
const actorId = 116001;
const phase = process.argv[2];
assert.ok(["disable", "reenable", "verify"].includes(phase));
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // Deliberately no auth provider/session-store dependency in this fixture.
  Object.assign(req, { session: { role: req.headers["x-test-role"] ?? "admin", userId: actorId } });
  next();
});
app.use(moduleControlsRouter);
app.use(guardModuleApi);
app.all(/.*/, (_req, res) => res.json({ reached: true }));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;

async function request(path: string, enabled?: boolean, role = "admin") {
  const response = await fetch(`${base}${path}`, {
    method: enabled === undefined ? "GET" : "PATCH",
    headers: { "Content-Type": "application/json", "x-test-role": role },
    body: enabled === undefined ? undefined : JSON.stringify({ enabled }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

async function persisted(revision: number, enabled: boolean) {
  // Direct SQL and Drizzle reads independently verify what the HTTP write stored.
  const { rows } = await pool.query("SELECT key, value FROM settings ORDER BY key");
  assert.equal(rows.length, revision + 1, "exactly one state and one audit per update");
  const state = JSON.parse(rows.find(row => row.key === KEY).value);
  assert.equal(state.revision, revision);
  assert.deepEqual(state.enabled, { wizzMonitor: enabled });
  assert.equal(state.lastChangedBy, actorId);
  assert.ok(Number.isFinite(Date.parse(state.lastChangedAt)));
  for (let n = 1; n <= revision; n++) {
    const audit = JSON.parse(rows.find(row => row.key === `${KEY}_audit_${n}`).value);
    assert.deepEqual({ ...audit, changedAt: undefined }, {
      revision: n, moduleId: "wizzMonitor", before: n === 1, after: n !== 1,
      actorId, changedAt: undefined,
    });
    assert.ok(Number.isFinite(Date.parse(audit.changedAt)));
    if (n === revision) assert.equal(audit.changedAt, state.lastChangedAt);
  }
  const [readBack] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY));
  assert.deepEqual(JSON.parse(readBack.value!), state);
}

async function access(enabled: boolean, revision: number) {
  const listing = await request("/modules");
  assert.equal(listing.status, 200);
  assert.equal(listing.body.revision, revision);
  assert.equal(listing.body.modules.find((m: { id: string }) => m.id === "wizzMonitor").enabled, enabled);
  for (const path of ["/wizz-price-monitors", "/wizz-price-monitors/fixture/run"]) {
    const result = await request(path);
    assert.equal(result.status, enabled ? 200 : 403, path);
    assert.deepEqual(result.body, enabled ? { reached: true } : { error: "Module disabled", module: "wizzMonitor" });
  }
  for (const path of ["/v1/flights", "/public/flights", "/public/bookings",
    "/booking-engine/settings", "/destinations", "/bookings", "/payments", "/settings"]) {
    assert.equal((await request(path)).status, 200, `protected exception: ${path}`);
  }
  let externalWorkCalls = 0;
  // Real production worker cycle and DB-backed gate; no provider request can run.
  await runDueWizzMonitorCycle([{ id: "fixture-monitor" }], async () => {
    externalWorkCalls++;
    return [];
  }, () => isModuleEnabled("wizzMonitor"));
  assert.equal(externalWorkCalls, enabled ? 1 : 0, "worker work gated by persisted module state");
}

try {
  if (phase === "disable") {
    await access(true, 0);
    assert.equal((await request("/modules/wizzMonitor", false, "manager")).status, 403);
    assert.equal((await request("/modules/payments", false)).status, 409);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM settings")).rows[0].n, 0);
    const changed = await request("/modules/wizzMonitor", false);
    assert.equal(changed.status, 200);
    assert.equal(changed.body.revision, 1);
    await persisted(1, false);
    await access(false, 1);
  } else if (phase === "reenable") {
    // First lookup in this fresh process: no in-memory state from phase one.
    await access(false, 1);
    await persisted(1, false);
    assert.equal((await request("/modules/wizzMonitor", true)).status, 200);
    await persisted(2, true);
    await access(true, 2);
  } else {
    await access(true, 2);
    await persisted(2, true);
  }
  console.log(`PASS ${phase}: fresh process ${process.pid}`);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
}