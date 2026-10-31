// Isolated FMS module-controls regression. Run from artifacts/api-server after
// BASE_PATH=/flight-system/ pnpm --filter @workspace/flight-system build.
// Only local static assets and an in-memory API are served; no real credentials or DB.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { enabledModules } from "./modules.browser.fixture.mjs";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT)
  throw new Error("Module browser fixture must never run in production");

const root = resolve("../flight-system/dist/public");
const prefix = "/flight-system/";
let loggedIn = false;
let revision = 0;
// Uppercase catalogue path exercises case-insensitive matching while the
// browser route, including query/hash, remains the normal lowercase path.
let modules = enabledModules().modules.map(module =>
  module.id === "agents" ? { ...module, paths: ["/AgEnTs"] } : module);
const streams = new Set();
const patches = [];
let moduleReads = 0;

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
function snapshot() { return { modules, revision }; }
function update(id, enabled) {
  modules = modules.map(module => module.id === id ? { ...module, enabled } : module);
  revision++;
}
function broadcast() {
  for (const res of streams) res.write('event: changed\ndata: {"topics":["modules"]}\n\n');
}
async function bodyOf(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname;
  if (path === "/__fixture/disable-agents" && req.method === "POST") {
    update("agents", false);
    broadcast();
    return send(res, 200, snapshot());
  }
  if (path === "/__fixture/enable-agents" && req.method === "POST") {
    update("agents", true);
    broadcast();
    return send(res, 200, snapshot());
  }
  if (path === "/__fixture/streams") return send(res, 200, { count: streams.size });
  if (path.startsWith("/api/")) {
    if (path === "/api/admin/has-admin") return send(res, 200, { exists: true });
    if (path === "/api/admin/me") return send(res, loggedIn ? 200 : 401, loggedIn
      ? { id: 951000, name: "Admin Prove", email: "admin@example.invalid", role: "admin" }
      : { error: "Not logged in" });
    if (path === "/api/admin/login" && req.method === "POST") {
      const body = await bodyOf(req);
      if (body.email !== "admin@example.invalid" || body.password !== "fixture-only")
        return send(res, 401, { error: "Invalid fixture login" });
      loggedIn = true;
      return send(res, 200, { id: 951000, name: "Admin Prove", email: body.email, role: "admin" });
    }
    if (path === "/api/branding") return send(res, 200, {
      siteName: "Fixture FMS", tagline: "", logoBase64: null, backgroundBase64: null, primaryColor: "#3b82f6",
    });
    if (!loggedIn) return send(res, 401, { error: "Not logged in" });
    if (path === "/api/live/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(": connected\n\n");
      streams.add(res);
      req.on("close", () => streams.delete(res));
      return;
    }
    if (path === "/api/permissions/my") return send(res, 200, {});
    if (path === "/api/modules" && req.method === "GET") {
      moduleReads++;
      return send(res, 200, snapshot());
    }
    if (path.startsWith("/api/modules/") && req.method === "PATCH") {
      const id = decodeURIComponent(path.slice("/api/modules/".length));
      const module = modules.find(item => item.id === id);
      const body = await bodyOf(req);
      if (!module) return send(res, 404, { error: "Unknown module" });
      if (module.locked) return send(res, 409, { error: "Locked module" });
      if (typeof body.enabled !== "boolean") return send(res, 400, { error: "Invalid value" });
      patches.push({ id, enabled: body.enabled });
      update(id, body.enabled);
      return send(res, 200, snapshot());
    }
    if (path === "/api/admin/enrollments/count") return send(res, 200, { count: 0 });
    if (path === "/api/agents" || path === "/api/booking-engine/agency-groups" ||
        path === "/api/booking-engine/flights" || path === "/api/price-rules" ||
        path === "/api/google-price-rules" || path === "/api/bookings" ||
        path === "/api/payments/pending-bookings" || path === "/api/payment-methods")
      return send(res, 200, []);
    if (path === "/api/settings/pok-accounts") return send(res, 200, { accounts: [] });
    if (path === "/api/settings/page-layouts") return send(res, 200, { pages: [] });
    if (path === "/api/page-layouts") return send(res, 200, { layouts: [] });
    if (path === "/api/settings/pok-reconciliation") return send(res, 200, { intents: [] });
    if (req.method === "GET" && path.startsWith("/api/settings/")) return send(res, 200, {});
    // Layout and settings load other unrelated read-only panels.
    return send(res, 200, {});
  }
  if (!path.startsWith(prefix)) return send(res, 404, "Not found", "text/plain");
  const relative = path.slice(prefix.length);
  const file = resolve(root, relative || "index.html");
  if (file !== root && !file.startsWith(root + sep)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const bytes = await readFile(file);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
      ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
    return send(res, 200, bytes, mime[extname(file)] || "application/octet-stream");
  } catch {
    if (!extname(file)) return send(res, 200, await readFile(join(root, "index.html")), "text/html");
    return send(res, 404, "Not found", "text/plain");
  }
});

let browser;
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
    headless: true, args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", route =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.url().startsWith(origin + prefix) && response.status() >= 400)
      errors.push(`Missing app asset: ${response.url()} (${response.status()})`);
  });
  await page.goto(`${origin}${prefix}settings`);
  assert.equal((await context.request.get(`${origin}/__fixture/streams`)).status(), 200);
  assert.equal(moduleReads, 0, "Modules must not be queried before authentication");
  assert.equal(patches.length, 0);
  await page.locator('input[type="email"]').fill("admin@example.invalid");
  await page.locator('input[autocomplete="current-password"]').fill("fixture-only");
  await page.getByRole("button", { name: "Hyr në sistem" }).click();
  const settings = page.getByTestId("card-modules-settings");
  await settings.waitFor();
  const disclosures = page.locator("[data-settings-expand]");
  assert.ok(await disclosures.count() >= 25, "All settings categories use disclosures");
  for (const button of await disclosures.all()) {
    assert.equal(await button.getAttribute("aria-expanded"), "false");
    await button.click();
    assert.equal(await button.getAttribute("aria-expanded"), "true");
    const content = page.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
    assert.equal(await content.isVisible(), true);
    await button.click();
    assert.equal(await content.isVisible(), false);
  }
  assert.deepEqual(patches, [], "Category disclosure does not write module settings");
  const identity = page.locator("[data-settings-category]").filter({ has: page.getByPlaceholder("FMS Pro") });
  await identity.locator("[data-settings-expand]").click();
  await page.getByPlaceholder("FMS Pro").fill("Unsaved fixture name");
  await identity.locator("[data-settings-expand]").click();
  await identity.locator("[data-settings-expand]").click();
  assert.equal(await page.getByPlaceholder("FMS Pro").inputValue(), "Unsaved fixture name");
  await identity.locator("[data-settings-expand]").click();
  await page.screenshot({ path: "/tmp/settings-collapsed.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const layoutsExpand = page.getByTestId("card-page-layouts").locator("[data-settings-expand]");
  await layoutsExpand.click();
  assert.equal(await page.getByTestId("group-page-layouts-internal").isVisible(), true);
  await layoutsExpand.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  const expand = settings.getByRole("button", { name: /Faqet \/ Modulet/ });
  await expand.waitFor();
  assert.equal(await expand.getAttribute("aria-expanded"), "false");
  assert.equal(await settings.getByTestId("switch-module-agents").isVisible(), false);
  await expand.click();
  await settings.getByTestId("switch-module-agents").waitFor();
  const row = settings.getByTestId("row-module-agents");
  assert.ok((await row.boundingBox()).height <= 42, "Module rows are compact single lines");
  await settings.screenshot({ path: "/tmp/modules-expanded.png" });
  await expand.click();
  assert.equal(await settings.getByTestId("switch-module-agents").isVisible(), false);
  assert.deepEqual(patches, [], "Expanding/collapsing must not change module state");
  await expand.click();
  const agentSwitch = settings.getByTestId("switch-module-agents");
  assert.equal(await agentSwitch.getAttribute("aria-checked"), "true");
  assert.equal(await settings.getByTestId("switch-module-settings").isDisabled(), true, "Recovery settings stay locked");
  assert.match(await settings.getByTestId("status-module-settings").innerText(), /I bllokuar/);
  assert.equal(await settings.getByTestId("switch-module-flights").isDisabled(), true, "Core modules stay locked");
  await agentSwitch.click();
  await page.getByTestId("status-module-agents").filter({ hasText: "I çaktivizuar" }).waitFor();
  assert.deepEqual(patches, [{ id: "agents", enabled: false }]);
  await page.locator("nav").getByRole("link", { name: "Agjentët", exact: true }).waitFor({ state: "hidden" });
  await page.goto(`${origin}${prefix}agents?source=fixture#detail`);
  await page.getByTestId("status-module-disabled").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Agjentet" }).count(), 0, "Disabled route must not mount the page");
  await page.reload();
  await page.getByTestId("status-module-disabled").waitFor();
  assert.equal(await page.locator("nav").getByRole("link", { name: "Agjentët", exact: true }).count(), 0);
  await page.goto(`${origin}${prefix}settings`);
  await expand.waitFor();
  assert.equal(await expand.getAttribute("aria-expanded"), "false", "Section starts collapsed on returning");
  await expand.click();
  await settings.getByTestId("switch-module-agents").waitFor();
  assert.equal(await agentSwitch.getAttribute("aria-checked"), "false", "Server change survives reload");
  await agentSwitch.click();
  await page.getByTestId("status-module-agents").filter({ hasText: /^Aktiv$/ }).waitFor();
  assert.deepEqual(patches, [{ id: "agents", enabled: false }, { id: "agents", enabled: true }]);
  await page.locator("nav").getByRole("link", { name: "Agjentët", exact: true }).waitFor();
  await page.goto(`${origin}${prefix}agents`);
  await page.getByRole("heading", { name: "Agjentet" }).waitFor();
  await page.waitForFunction(async () => {
    const result = await fetch("/__fixture/streams");
    return (await result.json()).count > 0;
  });
  assert.equal((await context.request.post(`${origin}/__fixture/disable-agents`)).status(), 200);
  await page.getByTestId("status-module-disabled").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Agjentet" }).count(), 0, "Remote SSE must unmount the open page");
  await page.locator("nav").getByRole("link", { name: "Agjentët", exact: true }).waitFor({ state: "hidden" });
  assert.deepEqual(errors, [], "No runtime error or missing app asset");
  await context.close();
  console.log("Modules browser regression passed: toggle, nav, route, reload, SSE and locked controls.");
} finally {
  if (browser) await browser.close();
  for (const res of streams) res.end();
  server.close();
  await once(server, "close");
}