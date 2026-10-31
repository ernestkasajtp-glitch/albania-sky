// Isolated FMS UI regression: local assets and in-memory API only; no DB, email or external network.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { enabledModules } from "./modules.browser.fixture.mjs";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Agency groups browser fixture must not run in production");
}

const root = resolve("../flight-system/dist/public");
const prefix = "/flight-system/";
const screenshotDir = resolve("node_modules/.cache/group-ui-test");
const originalGroup = { id: 940010, name: "Grupi ekzistues", agentCount: 1, rules: [
  { id: 940011, groupId: 940010, airport: "TIA", direction: "from", dateFrom: null, dateTo: null },
] };
const groups = [originalGroup];
let nextGroupId = 940100;
let nextRuleId = 940200;
let loggedIn = false;
const calls = [];
const agents = [{
  id: 940001, name: "Agjenci Prove", company: "TEST-ONLY", email: "agency@example.invalid",
  groupId: originalGroup.id, groupName: originalGroup.name, status: "active",
  discountType: "percent", discountPercent: 0, totalBookings: 0, totalPassengers: 0,
  totalSales: 0, totalPaid: 0, totalDebt: 0, grossDebt: 0, walletBalance: 0,
  netCredit: 0, totalCommission: 0, loginCount: 0, showInReports: true,
}];
const legacyRule = {
  id: 940020, fromAirport: "LHR", toAirport: null,
  dateFrom: "2026-01-01", dateTo: "2028-12-31", flightId: null,
};
const flights = [{
  id: 940030, airline: "Fixture Air", flightNumber: "FX100", fromCity: "TIA",
  toCity: "FCO", departureDate: "2028-06-01", status: "open", showInBookingEngine: true,
}];

function send(res, status, data, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(status === 204 ? undefined : type === "application/json" ? JSON.stringify(data) : data);
}
async function bodyOf(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname;
  if (path.startsWith("/api/")) {
    const method = req.method;
    const body = method === "POST" || method === "PATCH" || method === "PUT" ? await bodyOf(req) : undefined;
    calls.push({ method, path, body });
    if (path === "/api/admin/login" && method === "POST") {
      if (body.email !== "admin@example.invalid" || body.password !== "fixture-only")
        return send(res, 401, { error: "Invalid fixture login" });
      loggedIn = true;
      return send(res, 200, { id: 940000, name: "Admin Prove", email: body.email, role: "admin" });
    }
    if (path === "/api/admin/has-admin") return send(res, 200, { exists: true });
    if (path === "/api/admin/me") return send(res, loggedIn ? 200 : 401, loggedIn
      ? { id: 940000, name: "Admin Prove", email: "admin@example.invalid", role: "admin" }
      : { error: "Not logged in" });
    if (path === "/api/admin/device" && method === "POST") return send(res, 200, { ok: true });
    if (path === "/api/branding") return send(res, 200, {
      siteName: "Fixture FMS", tagline: "", logoBase64: null, backgroundBase64: null, primaryColor: "#3b82f6",
    });
    if (!loggedIn) return send(res, 401, { error: "Not logged in" });
    if (path === "/api/modules") return send(res, 200, enabledModules());
    if (path === "/api/permissions/my") return send(res, 200, {});
    if (path === "/api/booking-engine/agency-groups" && method === "GET") return send(res, 200, groups);
    if (path === "/api/booking-engine/agency-groups" && method === "POST") {
      if (!body.name?.trim()) return send(res, 400, { error: "Name required" });
      const group = { id: nextGroupId++, name: body.name.trim(), agentCount: 0, rules: [] };
      groups.push(group);
      return send(res, 201, group);
    }
    const groupRoute = path.match(/^\/api\/booking-engine\/agency-groups\/(\d+)(?:\/rules(?:\/(\d+))?)?$/);
    if (groupRoute) {
      const group = groups.find(item => item.id === Number(groupRoute[1]));
      if (!group) return send(res, 404, { error: "Group not found" });
      if (method === "PATCH" && !path.includes("/rules")) {
        group.name = body.name;
        return send(res, 200, group);
      }
      if (method === "DELETE" && !path.includes("/rules")) {
        if (group.agentCount) return send(res, 409, { error: "Group has agents" });
        groups.splice(groups.indexOf(group), 1);
        return send(res, 204);
      }
      if (method === "POST" && path.endsWith("/rules")) {
        if (!/^[A-Z]{3}$/.test(body.airport) || !["either", "from", "to"].includes(body.direction) ||
            !body.dateFrom || !body.dateTo || body.dateFrom > body.dateTo)
          return send(res, 400, { error: "Invalid airport rule" });
        const rule = { id: nextRuleId++, groupId: group.id, airport: body.airport, direction: body.direction,
          dateFrom: body.dateFrom, dateTo: body.dateTo };
        group.rules.push(rule);
        return send(res, 201, rule);
      }
      if (method === "PATCH" && groupRoute[2]) {
        const rule = group.rules.find(rule => rule.id === Number(groupRoute[2]));
        if (!rule) return send(res, 404, { error: "Rule not found" });
        Object.assign(rule, body);
        return send(res, 200, rule);
      }
      if (method === "DELETE" && groupRoute[2]) {
        const index = group.rules.findIndex(rule => rule.id === Number(groupRoute[2]));
        if (index < 0) return send(res, 404, { error: "Rule not found" });
        group.rules.splice(index, 1);
        return send(res, 204);
      }
    }
    const contextRoute = path.match(/^\/api\/booking-engine\/agents\/(\d+)\/visibility-context$/);
    if (contextRoute) {
      const agent = agents.find(item => item.id === Number(contextRoute[1]));
      if (!agent) return send(res, 404, { error: "Agent not found" });
      const group = groups.find(item => item.id === agent.groupId);
      return send(res, 200, { groupId: group?.id ?? null, groupName: group?.name ?? null,
        groupRules: group?.rules ?? [], legacyExcluded: false });
    }
    if (/^\/api\/booking-engine\/agents\/\d+\/visibility-rules$/.test(path)) return send(res, 200, []);
    if (path === "/api/booking-engine/default-visibility-rules") return send(res, 200, [legacyRule]);
    if (path === "/api/booking-engine/default-visibility-exclusions") return send(res, 200, []);
    if (path === "/api/booking-engine/flights") return send(res, 200, flights);
    if (path === "/api/agents" && method === "GET") return send(res, 200, agents);
    if (path === "/api/agents" && method === "POST") {
      if (!groups.some(group => group.id === body.groupId)) return send(res, 400, { error: "Group required" });
      const created = { ...agents[0], ...body, id: 940002, groupName: groups.find(g => g.id === body.groupId).name };
      agents.push(created);
      groups.find(g => g.id === body.groupId).agentCount++;
      return send(res, 201, created);
    }
    const agentRoute = path.match(/^\/api\/agents\/(\d+)$/);
    if (agentRoute) {
      const agent = agents.find(item => item.id === Number(agentRoute[1]));
      if (!agent) return send(res, 404, { error: "Agent not found" });
      if (method === "GET") return send(res, 200, agent);
      if (method === "PATCH" || method === "PUT") {
        if (body.groupId && !groups.some(group => group.id === body.groupId))
          return send(res, 400, { error: "Invalid group" });
        Object.assign(agent, body);
        return send(res, 200, agent);
      }
    }
    if (/^\/api\/agents\/\d+\/credits$/.test(path)) return send(res, 200, { balance: 0, transactions: [] });
    if (path === "/api/bookings" || path === "/api/payments/pending-bookings" ||
        path === "/api/payment-methods" || path === "/api/price-rules" ||
        path === "/api/google-price-rules" || path === "/api/flights") return send(res, 200, []);
    if (path === "/api/settings/pok-accounts") return send(res, 200, { accounts: [] });
    if (path === "/api/settings/pok-reconciliation") return send(res, 200, { intents: [] });
    // Settings embeds many unrelated panels. Their GET settings carry object-shaped values.
    if (method === "GET" && path.startsWith("/api/settings/")) return send(res, 200, {});
    return send(res, 501, { error: `Unmocked fixture request: ${method} ${path}` });
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
  await mkdir(screenshotDir, { recursive: true });
  await page.goto(`${origin}${prefix}settings`);
  await page.locator('input[type="email"]').fill("admin@example.invalid");
  await page.locator('input[autocomplete="current-password"]').fill("fixture-only");
  await page.getByRole("button", { name: "Hyr në sistem" }).click();
  const settings = page.locator("#agency-flight-rules");
  await settings.getByText("Grupet e agjencive", { exact: true }).waitFor();
  await settings.getByText("Rregullat e përgjithshme – VETËM agjencitë pa grup", { exact: true }).waitFor();
  await page.screenshot({ path: join(screenshotDir, "settings-before-group.png") });
  await settings.getByText("LHR → Çdo aeroport", { exact: false }).waitFor();
  await settings.getByText("Përjashtimet – VETËM agjencitë pa grup", { exact: true }).waitFor();
  await settings.getByRole("button", { name: "Grupi ekzistues (1 agjenci)" }).click();
  assert.equal(await settings.getByRole("button", { name: "Fshi", exact: true }).isDisabled(), true,
    "A group with assigned agencies must not be deletable");

  await settings.getByRole("textbox", { name: "Emri i grupit të ri" }).fill("Grupi prove");
  await settings.getByRole("button", { name: "Krijo grupin" }).click();
  await settings.getByRole("heading", { name: "Grupi prove · 0 agjenci" }).waitFor();
  const createdId = groups.find(g => g.name === "Grupi prove")?.id;
  assert.ok(createdId, "Group creation must reach the fixture API");
  await settings.getByRole("textbox", { name: "Emri i ri i grupit" }).fill("Grupi i riemërtuar");
  await settings.getByRole("button", { name: "Riemërto" }).click();
  await settings.getByRole("heading", { name: "Grupi i riemërtuar · 0 agjenci" }).waitFor();
  await settings.getByText("Pa rregulla grupi:", { exact: false }).waitFor();
  await settings.getByRole("textbox", { name: "Kodi i aeroportit" }).fill("fco");
  await settings.getByRole("combobox", { name: "Drejtimi" }).selectOption("to");
  await settings.locator("#group-rule-from").fill("2031-08-10");
  await settings.locator("#group-rule-to").fill("2031-08-31");
  await settings.getByRole("button", { name: "Shto rregullin" }).first().click();
  await settings.getByText("FCO: vetëm mbërritje · 2031-08-10 – 2031-08-31").waitFor();
  assert.deepEqual(groups.find(g => g.id === createdId).rules.map(r => [r.airport, r.direction]), [["FCO", "to"]]);
  await settings.getByText("FCO: vetëm mbërritje · 2031-08-10 – 2031-08-31").locator("..").getByRole("button", { name: "Ndrysho" }).click();
  await settings.locator("#group-rule-to").fill("2031-09-01");
  await settings.getByRole("button", { name: "Ruaj rregullin" }).click();
  await settings.getByText("FCO: vetëm mbërritje · 2031-08-10 – 2031-09-01").waitFor();
  await page.screenshot({ path: join(screenshotDir, "settings-group-rule.png") });
  page.once("dialog", dialog => dialog.accept());
  await settings.getByText("FCO: vetëm mbërritje · 2031-08-10 – 2031-09-01").locator("..").getByRole("button", { name: "Hiq" }).click();
  await settings.getByText("FCO: vetëm mbërritje · 2031-08-10 – 2031-09-01").waitFor({ state: "hidden" });
  assert.deepEqual(groups.find(g => g.id === createdId).rules, []);
  page.once("dialog", dialog => dialog.accept());
  await settings.getByRole("button", { name: "Fshi", exact: true }).click();
  await settings.getByRole("button", { name: "Grupi i riemërtuar (0 agjenci)" }).waitFor({ state: "hidden" });
  assert.equal(groups.some(g => g.id === createdId), false);
  for (const [method, suffix] of [
    ["POST", ""], ["PATCH", `/${createdId}`], ["POST", `/${createdId}/rules`],
    ["PATCH", `/${createdId}/rules/${nextRuleId - 1}`],
    ["DELETE", `/${createdId}/rules/${nextRuleId - 1}`], ["DELETE", `/${createdId}`],
  ]) assert.ok(calls.some(call => call.method === method && call.path === `/api/booking-engine/agency-groups${suffix}`),
    `Missing ${method} ${suffix}`);

  await page.goto(`${origin}${prefix}agents`);
  await page.getByRole("button", { name: "Shto Agjent" }).click();
  const addDialog = page.getByRole("dialog", { name: "Shto Agjent të Ri" });
  await addDialog.getByLabel("Emri i Plotë").fill("Agjenci e re");
  await addDialog.getByLabel("NIPT").fill("FIXTURE-NEW");
  await addDialog.getByLabel("Email", { exact: true }).fill("new@example.invalid");
  // The tall agency dialog overflows a headless viewport; keyboard submit still uses the real form.
  await addDialog.getByRole("button", { name: "Ruaj Agentin" }).focus();
  await page.keyboard.press("Enter");
  await page.screenshot({ path: join(screenshotDir, "agency-group-required.png") });
  assert.equal(await addDialog.getByLabel("Grupi i agjencisë").evaluate(select => select.validity.valueMissing), true,
    "Native form validation must require a group");
  assert.equal(calls.filter(call => call.method === "POST" && call.path === "/api/agents").length, 0,
    "Group is required before creating an agency");
  await addDialog.getByLabel("Grupi i agjencisë").selectOption(String(originalGroup.id));
  await addDialog.getByRole("button", { name: "Ruaj Agentin" }).focus();
  await page.keyboard.press("Enter");
  await addDialog.waitFor({ state: "hidden" });
  const create = calls.find(call => call.method === "POST" && call.path === "/api/agents");
  assert.equal(create?.body.groupId, originalGroup.id, "Agency create request must include groupId");
  await page.screenshot({ path: join(screenshotDir, "agents-with-group.png") });

  const row = page.getByRole("row").filter({ hasText: "TEST-ONLY" });
  await row.getByRole("button", { name: /Agjenci Prove/ }).click();
  const detail = page.getByRole("dialog", { name: "Detajet e Agjentit" });
  await detail.getByText("Grupi: Grupi ekzistues", { exact: false }).first().waitFor();
  await detail.getByText("Aksesi i agjentit te fluturimet në Booking Engine").waitFor();
  await detail.getByText("Grupi: Grupi ekzistues · 1 rregulla të trashëguara").waitFor();
  await detail.getByText("TIA: vetëm nisje · Pa afat").waitFor();
  assert.equal(await detail.getByText("LHR → Çdo aeroport", { exact: false }).count(), 0,
    "Grouped agency must not inherit global legacy rules");
  assert.ok(calls.some(call => call.path === `/api/booking-engine/agents/${agents[0].id}/visibility-context`));
  await page.screenshot({ path: join(screenshotDir, "profile-inherited-group.png") });
  assert.deepEqual(errors, [], "No browser runtime error or missing app asset allowed");
  const incidentalWrites = calls.filter(call => call.method !== "GET" && ![
    "/api/admin/login", "/api/admin/device", "/api/agents",
  ].includes(call.path) && !call.path.startsWith("/api/booking-engine/agency-groups"));
  assert.deepEqual(incidentalWrites.map(call => `${call.method} ${call.path}`), [],
    "No other write requests should be made");
  await context.close();
  console.log("Agency groups browser regression passed: settings CRUD, directional rules, required profile group and inherited visibility.");
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, "close");
}