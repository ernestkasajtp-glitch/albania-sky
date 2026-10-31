/**
 * Browser-only regression fixture for AgentDetailContent + BulkPayment.
 * Import from a Playwright harness, call installAgentBulkPaymentFixture(context)
 * before navigation, then runAgentBulkPaymentRefreshTest(page, context).
 * Every /api request is intercepted; no backend/DB/payment writes are made.
 */
import assert from "node:assert/strict";

export async function installAgentBulkPaymentFixture(context) {
  const state = {
    balance: 75,
    phase: 0,
    historyShouldFail: false,
    creditsGets: 0,
    bulkPosts: 0,
  };
  const history = [{
    id: "batch_fixture-1",
    type: "payment",
    amount: 30,
    bookingRef: "2 bileta",
    source: "payment",
    method: "credit",
    notes: "Fixture grouped wallet payment",
    batchId: "fixture-batch-1",
    createdAt: "2025-05-10T12:00:00Z",
    _batch: true,
    _count: 2,
    _members: [
      { id: 9101, amount: 20, bookingRef: "FIX-301", createdAt: "2025-05-10T12:00:00Z" },
      { id: 9102, amount: 10, bookingRef: "FIX-302", createdAt: "2025-05-10T12:00:00Z" },
    ],
  }];

  await context.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/admin/me")
      return route.fulfill({ json: { id: 7, email: "fixture@local.test", name: "Fixture Admin", role: "admin" } });
    if (path === "/api/admin/has-admin") return route.fulfill({ json: { exists: true } });
    if (path === "/api/permissions/my") return route.fulfill({ json: {} });
    if (path === "/api/modules")
      return route.fulfill({ json: { revision: 1, modules: [{ id: "agents", label: "Agents", description: "fixture", paths: ["/agents"], enabled: true, locked: false }] } });
    if (path === "/api/admin/device") return route.fulfill({ json: { ok: true } });
    if (path === "/api/agents/42/credits") {
      state.creditsGets += 1;
      if (state.historyShouldFail) return route.fulfill({ status: 503, json: { error: "fixture history unavailable" } });
      return route.fulfill({ json: { balance: state.balance, transactions: state.phase > 0 ? history : [] } });
    }
    if (path === "/api/agents/42")
      return route.fulfill({ json: { id: 42, name: "Fixture Agent", walletBalance: 75, company: "Fixture Co", email: "agent@example.test", totalSales: 0, totalPaid: 0, totalBookings: 0, totalCommission: 0, grossDebt: 0, active: true } });
    if (path === "/api/agents")
      return route.fulfill({ json: [{ id: 42, name: "Fixture Agent", walletBalance: 75, showInReports: true }] });
    if (path === "/api/bookings") return route.fulfill({ json: [] });
    if (path === "/api/payment-methods")
      return route.fulfill({ json: [{ id: 1, name: "Cash", color: "#00aa00", active: true, sortOrder: 1 }] });
    if (path === "/api/payments/pending-bookings") {
      const rows = state.phase === 0
        ? [
            { id: 301, agentId: 42, agentName: "Fixture Agent", bookingRef: "FIX-301", pnr: "PNR301", customerName: "Fixture Customer A", createdAt: "2025-01-01T10:00:00Z", dueAmount: 20, paxCount: 1, status: "confirmed" },
            { id: 302, agentId: 42, agentName: "Fixture Agent", bookingRef: "FIX-302", pnr: "PNR302", customerName: "Fixture Customer B", createdAt: "2025-01-02T10:00:00Z", dueAmount: 10, paxCount: 1, status: "confirmed" },
          ]
        : [{ id: 303, agentId: 42, agentName: "Fixture Agent", bookingRef: "FIX-303", pnr: "PNR303", customerName: "Fixture Customer C", createdAt: "2025-01-03T10:00:00Z", dueAmount: 50, paxCount: 1, status: "confirmed" }];
      return route.fulfill({ json: rows });
    }
    if (path === "/api/payments/bulk" && request.method() === "POST") {
      state.bulkPosts += 1;
      state.phase += 1;
      state.balance = state.phase === 1 ? 45 : 25;
      return route.fulfill({ json: state.phase === 1
        ? { created: 2, payments: [{ paymentId: 9101, bookingRef: "FIX-301", amount: 20 }, { paymentId: 9102, bookingRef: "FIX-302", amount: 10 }], creditAdded: 0 }
        : { created: 1, payments: [{ paymentId: 9103, bookingRef: "FIX-303", amount: 50 }], creditAdded: 0 } });
    }
    // All other API calls are also mocked, preventing accidental backend writes.
    return route.fulfill({ json: [] });
  });
  // Register after the catch-all so EventSource does not get a JSON response.
  await context.route("**/api/live/events", route => route.abort());
  return state;
}

export async function runAgentBulkPaymentRefreshTest(page, context) {
  const state = await installAgentBulkPaymentFixture(context);
  await page.goto("/agents/42");
  await page.getByText("Fixture Customer A", { exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /€75/);

  await page.getByRole("button", { name: "Zgjidh të gjitha", exact: true }).click();
  await page.getByRole("combobox", { name: "Metoda e pagesës" }).click();
  await page.getByRole("option", { name: /Kredit \(Wallet\)/ }).click();
  await page.getByRole("button", { name: /Kryej Pagesën €30/ }).click();
  await page.getByText("2 pagesa u kryen me sukses!", { exact: true }).waitFor();
  let body = await page.locator("body").innerText();
  assert.equal(state.bulkPosts, 1);
  assert.match(body, /2 bileta/);
  assert.match(body, /€45/);
  assert.match(body, /2 pagesa u kryen me sukses!/);
  assert.ok(state.creditsGets >= 3, "credits endpoint should be reloaded after POST");

  await page.getByText("Fixture Customer C", { exact: true }).click();
  await page.getByRole("combobox", { name: "Metoda e pagesës" }).click();
  await page.getByRole("option", { name: /Kredit \(Wallet\)/ }).click();
  body = await page.locator("body").innerText();
  assert.match(body, /keni €45, nevojiten €50/);
  assert.equal(state.bulkPosts, 1, "insufficient refreshed wallet must prevent another POST");

  state.historyShouldFail = true;
  await page.getByRole("combobox", { name: "Metoda e pagesës" }).click();
  await page.getByRole("option", { name: "Cash", exact: true }).click();
  await page.getByRole("button", { name: /Kryej Pagesën €50/ }).click();
  await page.getByText("Historia nuk u rifreskua").waitFor();
  body = await page.locator("body").innerText();
  assert.equal(state.bulkPosts, 2);
  assert.match(body, /1 pagesa u kryen me sukses!/);
  assert.match(body, /Mos e përsëritni një pagesë që u shfaq si e suksesshme/);
  return state;
}