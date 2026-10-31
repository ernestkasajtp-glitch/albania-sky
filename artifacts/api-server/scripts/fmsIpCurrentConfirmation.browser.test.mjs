// Local, in-memory browser fixture. Build the FMS with BASE_PATH=/flight-system/ first.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { enabledModules } from "./modules.browser.fixture.mjs";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("IP browser fixture must never run in production");
}
const root = resolve("../flight-system/dist/public");
const current = "198.51.100.246";
const other = "198.51.100.247";
const records = [current, other].map(ip => ({
  ip, label: null, devices: [], loginCount: 1, verifiedCount: 0, lastVerifiedUser: null,
  lastLoginAt: null, activeSessions: 0, isBlocked: false, blockedAt: null,
}));
const changes = [];
let loggedIn = false;
function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path.startsWith("/api/")) {
    if (path === "/api/admin/has-admin") return send(res, 200, { exists: true });
    if (path === "/api/branding") return send(res, 200, {});
    if (path === "/api/admin/login" && req.method === "POST") {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      if (body.email !== "admin@example.invalid" || body.password !== "fixture-only") return send(res, 401, { error: "Invalid fixture login" });
      loggedIn = true;
      return send(res, 200, { id: 930000, name: "Fixture Admin", email: body.email, role: "admin" });
    }
    if (path === "/api/admin/me") return send(res, loggedIn ? 200 : 401,
      loggedIn ? { id: 930000, name: "Fixture Admin", email: "admin@example.invalid", role: "admin" } : { error: "Not logged in" });
    if (!loggedIn) return send(res, 401, { error: "Not logged in" });
    if (path === "/api/modules") return send(res, 200, enabledModules());
    if (path === "/api/permissions/my") return send(res, 200, {});
    if (path === "/api/admin/enrollments/count") return send(res, 200, { count: 0 });
    if (path === "/api/settings/ip-access/ips") return send(res, 200, { items: records, total: records.length, page: 1, limit: 10, currentIp: current });
    if (path === "/api/settings/ip-access/attempts") return send(res, 200, { items: [], total: 0, page: 1, limit: 10 });
    if (["/api/settings/ip-access/block", "/api/settings/ip-access/blocks"].includes(path) && req.method === "PUT") {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      changes.push({ path, body });
      const ips = body.ips ?? [body.ip];
      if (body.blocked && ips.includes(current) && body.confirmCurrentIp !== true) return send(res, 409, { code: "CONFIRM_CURRENT_IP" });
      for (const ip of ips) records.find(row => row.ip === ip).isBlocked = body.blocked;
      return send(res, 200, body.ips ? { blocked: body.blocked, succeeded: ips, failed: [] } : { ip: body.ip, blocked: body.blocked });
    }
    return send(res, 200, path === "/api/payment-methods" ? [] : {});
  }
  if (!path.startsWith("/flight-system/")) return send(res, 404, "Not found", "text/plain");
  const relative = path.slice("/flight-system/".length);
  const file = resolve(root, relative || "index.html");
  if (file !== root && !file.startsWith(root + sep)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const bytes = await readFile(file);
    send(res, 200, bytes, { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }[extname(file)] || "application/octet-stream");
  } catch {
    if (!extname(file)) return send(res, 200, await readFile(resolve(root, "index.html")), "text/html");
    send(res, 404, "Not found", "text/plain");
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
  page.setDefaultTimeout(10_000);
  await page.goto(`${origin}/flight-system/settings/ip-access`);
  await page.locator('input[type="email"]').fill("admin@example.invalid");
  await page.locator('input[autocomplete="current-password"]').fill("fixture-only");
  await page.getByRole("button", { name: "Hyr në sistem" }).click();
  await page.getByText("IP-të e Njohura").waitFor();
  await page.getByRole("checkbox", { name: `Zgjidh IP ${current}` }).waitFor();
  const row = page.locator("tr").filter({ has: page.getByRole("checkbox", { name: `Zgjidh IP ${current}` }) });
  await row.getByRole("button", { name: "Blloko" }).waitFor();
  assert.equal(await row.getByRole("button", { name: "Blloko" }).isEnabled(), true);
  await row.getByRole("button", { name: "Blloko" }).click();
  await page.getByText("Blloko IP-në tënde aktuale?").waitFor();
  await page.getByRole("button", { name: "Anulo" }).click();
  assert.equal(changes.length, 0, "cancel must not mutate");
  await row.getByRole("button", { name: "Blloko" }).click();
  await page.getByRole("button", { name: "Blloko IP", exact: true }).last().click();
  await row.getByRole("button", { name: "Zhblloko" }).waitFor();
  assert.deepEqual(changes[0], { path: "/api/settings/ip-access/block", body: { ip: current, blocked: true, confirmCurrentIp: true } });
  assert.equal(await row.getByRole("button", { name: "Zhblloko" }).isEnabled(), true);
  await row.getByRole("button", { name: "Zhblloko" }).click();
  await row.getByRole("button", { name: "Blloko" }).waitFor();
  assert.equal(changes[1].body.blocked, false);
  await page.getByRole("checkbox", { name: `Zgjidh IP ${current}` }).click();
  await page.getByRole("checkbox", { name: `Zgjidh IP ${other}` }).click();
  await page.getByRole("button", { name: "Blloko (2)" }).click();
  await page.getByRole("button", { name: "Anulo" }).click();
  assert.equal(changes.length, 2, "cancel batch must not mutate");
  await page.getByRole("button", { name: "Blloko (2)" }).click();
  await page.getByRole("button", { name: "Blloko të zgjedhurat" }).click();
  await page.getByRole("button", { name: "Zhblloko", exact: true }).first().waitFor();
  assert.deepEqual(changes[2], {
    path: "/api/settings/ip-access/blocks",
    body: { ips: [other, current], blocked: true, confirmCurrentIp: true },
  }, "current IP must be last in the batch");
  await context.close();
  console.log("Current-IP browser regression passed: cancel, confirm, unblock, batch ordering.");
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}