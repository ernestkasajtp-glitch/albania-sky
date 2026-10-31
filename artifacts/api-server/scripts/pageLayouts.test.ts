import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { PAGE_LAYOUT_REGISTRY, layoutKey } from "../src/lib/pageLayouts";
import { createPageLayoutRouters } from "../src/routes/pageLayouts";

type Row = { key: string; value: string | null; updatedAt: Date };

function makeApp(role?: string, failRead = false) {
  const rows = new Map<string, Row>();
  const topics: string[] = [];
  const { publicPageLayoutsRouter, pageLayoutSettingsRouter } = createPageLayoutRouters({
    read: async () => { if (failRead) throw new Error("db down"); return [...rows.values()]; },
    write: async (def, variant) => { const k = layoutKey(def.scope, def.page); rows.set(k, { key: k, value: variant, updatedAt: new Date() }); },
    clear: async def => { rows.delete(layoutKey(def.scope, def.page)); },
  }, t => topics.push(t));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = role ? { role, userId: 1 } : {}; next(); });
  app.use("/api", publicPageLayoutsRouter);
  app.use("/api", pageLayoutSettingsRouter);
  return { app, rows, topics };
}

async function call(app: express.Express, method: string, path: string, body?: unknown) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) as any };
  } finally { server.close(); }
}

test("registry: unique pages, defaults and approved external canvas are ready", () => {
  const ids = PAGE_LAYOUT_REGISTRY.map(p => `${p.scope}:${p.page}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PAGE_LAYOUT_REGISTRY) {
    assert.ok(p.variants.some(v => v.id === p.defaultVariant && v.status === "ready"), ids.join());
    for (const v of p.variants) if (v.id === "canvas") {
      assert.equal(v.status, "ready");
      assert.equal(p.scope, "external");
      assert.ok(["home", "flights", "book_flight"].includes(p.page));
    }
  }
});

test("unauthenticated and non-admin writes/reads of admin settings are denied", async () => {
  for (const role of [undefined, "manager", "agent_staff"]) {
    const { app, rows } = makeApp(role);
    assert.equal((await call(app, "GET", "/settings/page-layouts")).status, role ? 403 : 401);
    assert.equal((await call(app, "PUT", "/settings/page-layouts/internal/bookings_list", { variant: "premium" })).status, role ? 403 : 401);
    assert.equal((await call(app, "DELETE", "/settings/page-layouts/internal/bookings_list")).status, role ? 403 : 401);
    assert.equal(rows.size, 0);
  }
});

test("public read exposes only scope/page/variant, only approved external defaults change", async () => {
  const { app } = makeApp();
  const r = await call(app, "GET", "/page-layouts");
  assert.equal(r.status, 200);
  for (const l of r.json.layouts) assert.deepEqual(Object.keys(l).sort(), ["page", "scope", "variant"]);
  const get = (s: string, p: string) => r.json.layouts.find((l: any) => l.scope === s && l.page === p)?.variant;
  assert.equal(get("internal", "bookings_list"), "theme");
  assert.equal(get("internal", "booking_new"), "theme");
  assert.equal(get("external", "flights"), "canvas");
  assert.equal(get("external", "home"), "canvas");
  assert.equal(get("external", "book_flight"), "canvas");
  assert.equal(get("external", "my_bookings"), "current");
});

test("homepage choices persist independently and reset to the approved default", async () => {
  const { app } = makeApp("admin");
  assert.equal((await call(app, "PUT", "/settings/page-layouts/external/home", { variant: "current" })).status, 200);
  let result = await call(app, "GET", "/page-layouts");
  assert.equal(result.json.layouts.find((p: any) => p.scope === "external" && p.page === "home").variant, "current");
  assert.equal(result.json.layouts.find((p: any) => p.scope === "external" && p.page === "flights").variant, "canvas");
  assert.equal((await call(app, "PUT", "/settings/page-layouts/external/home", { variant: "canvas" })).status, 200);
  result = await call(app, "GET", "/page-layouts");
  assert.equal(result.json.layouts.find((p: any) => p.scope === "external" && p.page === "home").variant, "canvas");
  assert.equal((await call(app, "DELETE", "/settings/page-layouts/external/home")).status, 200);
  result = await call(app, "GET", "/page-layouts");
  assert.equal(result.json.layouts.find((p: any) => p.scope === "external" && p.page === "home").variant, "canvas");
});

test("allowlist rejects unknown pages, unknown or preparing variants, extra fields", async () => {
  const { app, rows } = makeApp("admin");
  assert.equal((await call(app, "PUT", "/settings/page-layouts/internal/nope", { variant: "current" })).status, 404);
  assert.equal((await call(app, "PUT", "/settings/page-layouts/public/bookings_list", { variant: "premium" })).status, 404);
  assert.equal((await call(app, "PUT", "/settings/page-layouts/internal/bookings_list", { variant: "neoGlass" })).status, 400);
  assert.equal((await call(app, "PUT", "/settings/page-layouts/internal/dashboard", { variant: "premium" })).status, 400);
  assert.equal((await call(app, "PUT", "/settings/page-layouts/external/my_bookings", { variant: "canvas" })).status, 400);
  assert.equal((await call(app, "PUT", "/settings/page-layouts/internal/bookings_list", { variant: "premium", x: 1 })).status, 400);
  assert.equal(rows.size, 0);
});

test("per-page persistence is scoped: one page change and reset leave others untouched", async () => {
  const { app, rows, topics } = makeApp("admin");
  await Promise.all([
    call(app, "PUT", "/settings/page-layouts/internal/bookings_list", { variant: "premium" }),
    call(app, "PUT", "/settings/page-layouts/internal/booking_new", { variant: "neoGlass" }),
  ]);
  const s = await call(app, "GET", "/settings/page-layouts");
  const v = (scope: string, page: string) => s.json.pages.find((p: any) => p.scope === scope && p.page === page);
  assert.equal(v("internal", "bookings_list").variant, "premium");
  assert.equal(v("internal", "booking_new").variant, "neoGlass");
  assert.equal(v("internal", "booking_detail").variant, "theme");
  assert.equal(v("external", "booking_detail").variant, "current");
  const reset = await call(app, "DELETE", "/settings/page-layouts/internal/bookings_list");
  assert.equal(reset.json.variant, "theme");
  assert.equal(reset.json.isDefault, true);
  assert.equal(rows.get(layoutKey("internal", "booking_new"))?.value, "neoGlass");
  assert.ok(topics.every(t => t === "page_layouts") && topics.length === 3);
});

test("stale stored value outside allowlist falls back to default; read failure is explicit 503", async () => {
  const { app, rows } = makeApp("admin");
  rows.set(layoutKey("internal", "bookings_list"), { key: layoutKey("internal", "bookings_list"), value: "removed", updatedAt: new Date() });
  const r = await call(app, "GET", "/page-layouts");
  assert.equal(r.json.layouts.find((l: any) => l.page === "bookings_list").variant, "theme");
  const failing = makeApp("admin", true);
  assert.equal((await call(failing.app, "GET", "/page-layouts")).status, 503);
  assert.equal((await call(failing.app, "GET", "/settings/page-layouts")).status, 503);
});
