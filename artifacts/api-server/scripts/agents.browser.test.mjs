// Isolated browser regression for the lazy-loaded Agents UI. No database, real login, or production URL.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { enabledModules } from "./modules.browser.fixture.mjs";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Agents browser fixture must never run in production");
}

const root = resolve("../flight-system/dist/public");
const prefix = "/flight-system/";
const agent = {
  id: 930001, name: "Agjenci Prove", company: "TEST-ONLY", email: "agent@example.invalid",
  status: "active", discountType: "percent", discountPercent: 0,
  totalBookings: 1, totalPassengers: 1, totalSales: 120, totalPaid: 40,
  totalDebt: 80, grossDebt: 80, walletBalance: 0, netCredit: 0,
  totalCommission: 10, loginCount: 1, showInReports: true,
};
const booking = {
  id: 930002, bookingRef: "KTF9001", customerName: "Klient Prove",
  status: "confirmed", pnr: "TESTPNR", totalAmount: 120, paidAmount: 40,
  dueAmount: 80, createdAt: "2026-01-02T10:00:00Z",
  flight: { fromCity: "Tirane", toCity: "Rome", airline: "Test", flightNumber: "TT1", departureDate: "2026-02-01" },
  paymentHistory: [{ status: "completed", amount: 40, method: "cash", createdAt: "2026-01-02T10:00:00Z" }],
};
const activity = {
  total: 1,
  rows: [{
    id: 930003, type: "login", method: "POST", path: "/api/admin/login",
    description: "Hyrje prove", ip: "127.0.0.1", userAgent: "Test browser",
    statusCode: 200, createdAt: "2026-01-02T10:00:00Z",
  }],
};
const csv = "Data,Lloji,Veprimi\n2026-01-02,Hyrje,Hyrje prove\n";

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

let loggedIn = false;
const calls = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname;
  if (path.startsWith("/api/")) {
    calls.push(`${req.method} ${path}${url.search}`);
    if (path === "/api/admin/login" && req.method === "POST") {
      let data = "";
      for await (const chunk of req) data += chunk;
      const credentials = JSON.parse(data);
      if (credentials.email !== "admin@example.invalid" || credentials.password !== "fixture-only") {
        return send(res, 401, { error: "Invalid fixture login" });
      }
      loggedIn = true;
      return send(res, 200, { id: 930000, name: "Admin Prove", email: credentials.email, role: "admin" });
    }
    if (path === "/api/admin/has-admin") return send(res, 200, { exists: true });
    if (path === "/api/branding") return send(res, 200, {});
    if (path === "/api/admin/me") return send(res, loggedIn ? 200 : 401, loggedIn
      ? { id: 930000, name: "Admin Prove", email: "admin@example.invalid", role: "admin" }
      : { error: "Not logged in" });
    if (!loggedIn) return send(res, 401, { error: "Not logged in" });
    if (path === "/api/modules") return send(res, 200, enabledModules());
    if (path === "/api/permissions/my") return send(res, 200, {});
    // The agent list also loads users linked to agencies.
    if (path === "/api/admin/users") return send(res, 200, []);
    // Agent details also mount the group and flight-access editors. Collection
    // endpoints need arrays, not the generic background response below.
    if (path === "/api/admin/users" ||
        path === "/api/booking-engine/agency-groups" ||
        path === "/api/booking-engine/flights" ||
        path === `/api/booking-engine/agents/${agent.id}/visibility-rules`) {
      return send(res, 200, []);
    }
    if (path === `/api/booking-engine/agents/${agent.id}/visibility-context`) {
      return send(res, 200, { groupId: null, groupName: null, groupRules: [], legacyExcluded: false });
    }
    if (path === "/api/admin/enrollments/count") return send(res, 200, { count: 0 });
    if (path === "/api/agents") return send(res, 200, [agent]);
    // The agent detail mounts visibility controls even when this regression
    // only reads contact data. Match their contracts instead of returning {}.
    if (path === "/api/booking-engine/flights" ||
        path === `/api/booking-engine/agents/${agent.id}/visibility-rules`) return send(res, 200, []);
    if (path === `/api/booking-engine/agents/${agent.id}/visibility-context`) {
      return send(res, 200, { groupId: null, groupName: null, groupRules: [], legacyExcluded: false });
    }
    if (path === `/api/agents/${agent.id}`) return send(res, 200, agent);
    if (path === `/api/agents/${agent.id}/credits`) return send(res, 200, { balance: 0, transactions: [] });
    if (path === `/api/agents/${agent.id}/activity`) return send(res, 200, activity);
    if (path === `/api/agents/${agent.id}/activity/export`) {
      res.setHeader("Content-Disposition", 'attachment; filename="activity.csv"');
      return send(res, 200, csv, "text/csv; charset=utf-8");
    }
    if (path === "/api/payments/report" && url.searchParams.get("agentId") === String(agent.id)) {
      return send(res, 200, [booking]);
    }
    if (path === "/api/bookings" && url.searchParams.get("agentId") === String(agent.id)) {
      return send(res, 200, [booking]);
    }
    if (path === "/api/payments/pending-bookings") return send(res, 200, []);
    // Background layout requests are unrelated to this fixture; never forward to a real API.
    return send(res, 200, path === "/api/payment-methods" ? [] : {});
  }
  if (!path.startsWith(prefix)) return send(res, 404, "Not found", "text/plain");
  const relative = path.slice(prefix.length);
  const file = resolve(root, relative || "index.html");
  if (file !== root && !file.startsWith(root + sep)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const bytes = await readFile(file);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
    send(res, 200, bytes, mime[extname(file)] || "application/octet-stream");
  } catch {
    // Client-side routes use the SPA entry point.
    if (!extname(file)) return send(res, 200, await readFile(join(root, "index.html")), "text/html");
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
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
  // Even CDN requests from the report window cannot leave this isolated test.
  await context.route("**/*", route =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(7_000);
  const errors = [];
  page.on("console", message => {
    // React's error boundary catches render failures, so pageerror alone misses
    // them. Ignore expected transport noise from deliberately isolated services.
    if (message.type() === "error" && /^\w*Error:/.test(message.text())) {
      errors.push(message.text());
      console.error("Agents browser render error:", message.text());
    }
  });
  page.on("pageerror", error => {
    errors.push(error.message);
    console.error("Agents browser runtime error:", error.message);
  });
  page.on("response", response => {
    if (response.url().startsWith(origin + prefix) && response.status() >= 400) {
      errors.push(`Missing app asset: ${response.url()} (${response.status()})`);
    }
  });
  await page.goto(`${origin}${prefix}agents`);
  await page.locator('input[type="email"]').fill("admin@example.invalid");
  await page.locator('input[autocomplete="current-password"]').fill("fixture-only");
  await page.getByRole("button", { name: "Hyr në sistem" }).click();
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: agent.name, exact: true }) });
  await row.waitFor();
  assert.match(await row.innerText(), /TEST-ONLY/);

  await row.getByRole("button", { name: agent.name, exact: true }).click();
  const detail = page.getByRole("dialog", { name: "Detajet e Agjentit" });
  await detail.getByRole("heading", { name: agent.name }).waitFor();
  await detail.getByText("agent@example.invalid").first().waitFor();
  assert.ok(calls.some(c => c.startsWith(`GET /api/agents/${agent.id}`)));
  await page.keyboard.press("Escape");
  await detail.waitFor({ state: "hidden" });
  assert.deepEqual(errors, [], "Agent detail must not crash its child components");

  assert.equal(await page.getByText("Diçka shkoi keq", { exact: true }).count(), 0, "Agent details must not crash the app");
  await row.getByTitle("Shiko aktivitetin e plotë / shkarko raport").click();
  const activityDialog = page.getByRole("dialog", { name: "Jurnali i aktivitetit" });
  await activityDialog.getByTestId("text-activity-agent").waitFor();
  await activityDialog.getByText("Hyrje prove").waitFor();
  assert.equal(await activityDialog.getByTestId("text-activity-agent").textContent(), agent.company);
  assert.ok(calls.some(c => c.includes(`/api/agents/${agent.id}/activity?`)));
  const activityDownload = page.waitForEvent("download");
  await activityDialog.getByRole("button", { name: "Raporti Excel" }).click();
  const exportedActivity = await activityDownload;
  assert.match((await readFile(await exportedActivity.path())).toString(), /Hyrje prove/);
  await page.keyboard.press("Escape");
  await activityDialog.waitFor({ state: "hidden" });

  await row.getByRole("button", { name: "Gjenero Raport" }).hover();
  await row.getByRole("button", { name: "Shkarko", exact: true }).click();
  const reportFrame = page.frameLocator('iframe[aria-hidden="true"]');
  await reportFrame.getByText("KTF9001").waitFor();
  const reportHtml = await reportFrame.locator("html").evaluate(el => el.outerHTML);
  assert.match(reportHtml, /Klient Prove/);
  // Print the actual generated report markup locally; no external PDF service/library is called.
  const printPage = await context.newPage();
  await printPage.setContent(reportHtml);
  const pdf = await printPage.pdf({ format: "A4", landscape: true });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1_000, "The generated report must produce a nonempty PDF");
  await printPage.close();

  // The debt CSV uses the lazy report helper too; verify actual downloaded bytes.
  await row.getByRole("button", { name: "Gjenero Raport" }).hover();
  const debtDownload = page.waitForEvent("download");
  await row.getByRole("button", { name: "Shkarko Excel" }).click();
  const exportedDebt = await debtDownload;
  assert.match(exportedDebt.suggestedFilename(), /Detyrimet .*\.csv$/);
  const debtCsv = (await readFile(await exportedDebt.path())).toString("utf8");
  assert.ok(debtCsv.startsWith("\uFEFFRezervimi,"));
  assert.match(debtCsv, /KTF9001/);
  assert.match(debtCsv, /TOTALI/);
  assert.ok(calls.some(c => c.includes(`/api/payments/report?agentId=${agent.id}&debtFilter=debt`)));
  assert.deepEqual(errors, [], "No lazy chunk or browser runtime error is allowed");
  await context.close();
  console.log("Agents browser regression passed: list, detail, activity, PDF, activity CSV, debt CSV.");
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, "close");
}