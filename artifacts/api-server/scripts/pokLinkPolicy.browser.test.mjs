// Isolated UI fixture: local built assets + in-memory fake API. Never calls POK or a real server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { enabledModules } from "./modules.browser.fixture.mjs";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT)
  throw new Error("POK policy browser fixture must not run in production");

const root = resolve("../flight-system/dist/public");
const prefix = "/flight-system/";
let loggedIn = false;
let enabled = false;
let failNextGet = true;
let failNextPut = false;
const puts = [];
let notificationClosedAt = null;
let closeCalls = 0;
const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const bodyOf = async req => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
};

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path.startsWith("/api/")) {
    if (path === "/api/admin/has-admin") return send(res, 200, { exists: true });
    if (path === "/api/admin/me") return send(res, loggedIn ? 200 : 401, loggedIn
      ? { id: 987001, name: "Admin Fixture", email: "pok-policy@example.invalid", role: "admin" }
      : { error: "Not logged in" });
    if (path === "/api/admin/login" && req.method === "POST") {
      loggedIn = true;
      return send(res, 200, { id: 987001, name: "Admin Fixture", email: "pok-policy@example.invalid", role: "admin" });
    }
    if (path === "/api/branding") return send(res, 200, { siteName: "Fixture", tagline: "", logoBase64: null, backgroundBase64: null, primaryColor: "#3b82f6" });
    if (!loggedIn) return send(res, 401, { error: "Not logged in" });
    if (path === "/api/settings/pok-link-policy") {
      if (req.method === "GET") {
        if (failNextGet) { failNextGet = false; return send(res, 503, { error: "Fixture: GET unavailable" }); }
        return send(res, 200, { createNewLinkEachAttempt: enabled });
      }
      if (req.method === "PUT") {
        const body = await bodyOf(req);
        puts.push(body);
        if (failNextPut) { failNextPut = false; return send(res, 503, { error: "Fixture: PUT unavailable" }); }
        assert.equal(typeof body.createNewLinkEachAttempt, "boolean");
        enabled = body.createNewLinkEachAttempt;
        return send(res, 200, { createNewLinkEachAttempt: enabled });
      }
    }
    if (path === "/api/modules") return send(res, 200, enabledModules());
    if (path === "/api/settings/page-layouts") return send(res, 200, { pages: [] });
    if (path === "/api/page-layouts") return send(res, 200, { layouts: [] });
    if (path === "/api/permissions/my") return send(res, 200, {});
    if (path === "/api/settings/pok-accounts") return send(res, 200, { accounts: [] });
    if (path === "/api/settings/pok-reconciliation/987011/close" && req.method === "POST") {
      closeCalls++;
      notificationClosedAt = "2026-10-14T12:00:00Z";
      return send(res, 200, { ok: true });
    }
    if (path === "/api/settings/pok-reconciliation") return send(res, 200, { intents: [
      { id: 987010, bookingRef: "FIXTURE-REVIEW", accountLabel: "Fixture", amount: 10, status: "review_required", providerOrderId: "fixture-order", createdAt: "2028-01-01T00:00:00Z" },
      { id: 987011, bookingRef: "FIXTURE-OLD", accountLabel: "Fixture", amount: 10, status: "superseded", providerOrderId: "fixture-old", createdAt: "2028-01-01T00:00:00Z", notificationClosedAt },
    ] });
    if (["/api/agents", "/api/booking-engine/agency-groups", "/api/booking-engine/flights", "/api/price-rules", "/api/google-price-rules", "/api/bookings", "/api/payments/pending-bookings", "/api/payment-methods"].includes(path))
      return send(res, 200, []);
    if (req.method === "GET" && path.startsWith("/api/settings/")) return send(res, 200, {});
    return send(res, 200, {});
  }
  if (!path.startsWith(prefix)) return send(res, 404, "Not found", "text/plain");
  const relative = path.slice(prefix.length);
  const file = resolve(root, relative || "index.html");
  if (file !== root && !file.startsWith(root + sep)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const bytes = await readFile(file);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
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
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.goto(`${origin}${prefix}settings`);
  await page.locator('input[type="email"]').fill("pok-policy@example.invalid");
  await page.locator('input[autocomplete="current-password"]').fill("fixture-only");
  await page.getByRole("button", { name: "Hyr në sistem" }).click();
  const policy = page.getByTestId("card-pok-link-policy");
  const toggle = policy.getByTestId("switch-pok-link-policy");
  await policy.locator("[data-settings-expand]").click();
  await policy.getByText("Fixture: GET unavailable").waitFor();
  assert.equal(await toggle.isDisabled(), true, "GET failure must not silently enable toggle");
  await policy.getByTestId("button-retry-pok-link-policy").click();
  await toggle.waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid="switch-pok-link-policy"]')?.hasAttribute("disabled"));
  assert.equal(await toggle.getAttribute("aria-checked"), "false", "Server default OFF");
  await toggle.click();
  const dialog = page.getByRole("dialog", { name: "Krijo link të ri për çdo tentativë?" });
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /më shumë se një herë/);
  await dialog.getByRole("button", { name: "Anulo" }).click();
  assert.equal(puts.length, 0, "Cancel must not PUT");
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.click();
  await dialog.getByRole("button", { name: "Po, aktivizo" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="switch-pok-link-policy"]')?.getAttribute("aria-checked") === "true");
  assert.deepEqual(puts, [{ createNewLinkEachAttempt: true }]);
  await page.reload();
  await policy.locator("[data-settings-expand]").click();
  await toggle.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="switch-pok-link-policy"]')?.getAttribute("aria-checked") === "true");
  assert.equal(await toggle.getAttribute("aria-checked"), "true", "GET after reload reflects persisted fake server value");
  failNextPut = true;
  await toggle.click();
  await policy.getByText("Fixture: PUT unavailable").waitFor();
  assert.deepEqual(puts, [{ createNewLinkEachAttempt: true }, { createNewLinkEachAttempt: false }]);
  assert.equal(enabled, true, "Failed PUT did not update server");
  assert.equal(await toggle.isDisabled(), true, "Ambiguous PUT must require fresh GET");
  await policy.getByTestId("button-retry-pok-link-policy").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="switch-pok-link-policy"]')?.getAttribute("aria-checked") === "true");
  const review = page.getByTestId("status-pok-intent-987010");
  await page.locator("[data-settings-expand]").filter({ hasText: "Rikonsiliimi i Pagesave me Kartë" }).click();
  assert.equal(await review.innerText(), "Kërkon shqyrtim");
  assert.equal(await review.locator("xpath=../..").getByRole("button", { name: "Shëno dështim" }).count(), 0, "Captured review cannot be failed");
  assert.equal(await page.getByTestId("status-pok-intent-987011").innerText(), "Link i mëparshëm — mund të paguhet");
  await page.getByTestId("status-pok-intent-987011").locator("xpath=../../..").getByRole("button", { name: "Mbyll njoftimin" }).click();
  await page.getByRole("button", { name: "Të mbyllura (1)", exact: true }).waitFor();
  assert.equal(await page.getByTestId("status-pok-intent-987011").count(), 0);
  assert.equal(closeCalls, 1);
  await page.reload();
  await page.locator("[data-settings-expand]").filter({ hasText: "Rikonsiliimi i Pagesave me Kartë" }).click();
  await page.getByRole("button", { name: "Aktive (1)", exact: true }).waitFor();
  assert.equal(await page.getByTestId("status-pok-intent-987011").count(), 0, "Closed remains hidden after reload");
  await page.getByRole("button", { name: "Të mbyllura (1)", exact: true }).click();
  assert.equal(await page.getByTestId("status-pok-intent-987011").innerText(), "Link i mëparshëm — mund të paguhet", "Payment status unchanged");
  await page.getByText("Mbyllur më", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Mbyll njoftimin" }).count(), 0);
  await page.getByRole("button", { name: "Aktive (1)", exact: true }).click();
  await review.waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log("POK policy browser fixture passed: policy safety; close notification, active/closed lists, reload persistence, unchanged payment status.");
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, "close");
}