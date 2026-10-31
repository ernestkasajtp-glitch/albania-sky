// Local pre-publish browser regression. Never point this at a deployed URL.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:18997";
const fixturePath = "node_modules/.cache/fms-browser-fixture/fmsBlockedAccess.browser.fixture.mjs";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT || !process.env.DATABASE_URL) {
  throw new Error("The browser regression requires a development database, never production");
}

function ready(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Fixture did not start within 30 seconds")), 30_000);
    let output = "";
    const onData = data => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
      if (output.includes("Fixture ready at ")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", data => process.stderr.write(data));
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Fixture exited before ready: ${code ?? signal}`));
    });
  });
}

function waitForExit(child, timeoutMs = 15_000) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error("Fixture cleanup timed out"));
    }, timeoutMs);
    const onExit = code => {
      clearTimeout(timer);
      resolve(code);
    };
    child.once("exit", onExit);
  });
}

async function state() {
  const response = await fetch(`${origin}/__fixture/state`);
  assert.equal(response.status, 200);
  return response.json();
}

async function fixtureAction(action) {
  const response = await fetch(`${origin}/__fixture/${action}`, { method: "POST" });
  assert.equal(response.status, 200, `${action} fixture action failed`);
}

async function run() {
  const child = spawn(process.execPath, [fixturePath], {
    cwd: process.cwd(),
    env: { ...process.env, FMS_BROWSER_TEST: "1", NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  let started = false;
  try {
    await ready(child);
    started = true;
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({ serviceWorkers: "block" });
    let page = await context.newPage();
    await page.goto(`${origin}/flight-system/`);
    const first = await state();
    assert.equal(first.emails.length, 2);
    let email = page.locator('input[type="email"]');
    let password = page.locator('input[autocomplete="current-password"]');
    await email.fill(first.emails[0]);
    await password.fill(first.password);
    await page.getByRole("button", { name: "Hyr në sistem" }).click();
    await page.getByRole("region", { name: "Kërko akses nga IP e bllokuar" }).waitFor();

    // The challenge requires a real password; failed requests never send a code.
    await password.fill("wrong-password");
    await page.getByRole("button", { name: "Kërko Akses", exact: true }).click();
    await page.getByText(/Kredencialet nuk janë të sakta/).waitFor();
    assert.equal((await state()).messages.filter(m => m.includes("letter-spacing:3px")).length, 0);
    await password.fill(first.password);
    const challengeResponse = page.waitForResponse(r => r.url().endsWith("/api/admin/access/request") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Kërko Akses", exact: true }).click();
    const response = await challengeResponse;
    assert.equal(response.status(), 200);
    const { expiresAt } = await response.json();
    const seconds = (Date.parse(expiresAt) - Date.now()) / 1000;
    assert.ok(seconds > 45 && seconds <= 61, `Code lifetime should be 60 seconds, got ${seconds}`);
    await page.getByRole("status").getByText(/Mbeten \d+ sekonda/).waitFor();
    const sent = (await state()).messages.filter(m => m.includes("letter-spacing:3px"));
    assert.equal(sent.length, 1, "Exactly one local code email must arrive");
    const match = sent[0].match(/letter-spacing:3px">(\d{8})/);
    assert.ok(match, "Code must be present in the local email, not an API response");
    const code = match[1];

    await page.locator("#blocked-access-code").fill(code === "00000000" ? "99999999" : "00000000");
    await page.getByRole("button", { name: "Verifiko dhe hyr" }).click();
    await page.getByText(/Kredencialet ose kodi nuk janë të sakta/).waitFor();
    await fixtureAction("expire");
    await page.locator("#blocked-access-code").fill(code);
    await page.getByRole("button", { name: "Verifiko dhe hyr" }).click();
    await page.getByText(/Kredencialet ose kodi nuk janë të sakta/).waitFor();
    // Advance the browser clock for the visible expiry state, without waiting a minute.
    await page.clock.install();
    await page.clock.fastForward(61_000);
    await page.getByText("Kodi ka skaduar. Kërko një kod të ri.").waitFor();
    await page.clock.setSystemTime(new Date());

    await page.getByRole("button", { name: "Kërko kod të ri" }).click();
    await page.locator("#blocked-access-code").waitFor();
    const second = (await state()).messages.filter(m => m.includes("letter-spacing:3px"));
    assert.equal(second.length, 2);
    const fresh = second[1].match(/letter-spacing:3px">(\d{8})/)?.[1];
    assert.ok(fresh);
    await page.locator("#blocked-access-code").fill(fresh);
    const verifiedResponse = page.waitForResponse(r => r.url().endsWith("/api/admin/access/verify") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Verifiko dhe hyr" }).click();
    assert.equal((await verifiedResponse).status(), 200);
    await page.locator('input[type="email"]').waitFor({ state: "detached" });
    const me = await context.request.get(`${origin}/api/admin/me`);
    assert.equal(me.status(), 200);
    assert.equal((await me.json()).email, first.emails[0]);

    // A consumed code cannot grant a second session.
    const replay = await browser.newContext();
    const replayResponse = await replay.request.post(`${origin}/api/admin/access/verify`, {
      data: { email: first.emails[0], password: first.password, code: fresh },
    });
    assert.equal(replayResponse.status(), 401);
    await replay.close();

    // Stop dashboard polling/SSE before rotating the generation. Otherwise a
    // background request can destroy the shared session before our probe, and
    // /admin/me correctly returns 401 rather than the first rejection's 403.
    // Keep the context (and its cookie jar) so this still tests the real session.
    await page.close();
    assert.equal((await context.request.get(`${origin}/api/admin/me`)).status(), 200);
    await fixtureAction("reblock");
    const revoked = await context.request.get(`${origin}/api/admin/me`);
    assert.equal(revoked.status(), 403, "Rotating a block must revoke the verified session");
    assert.equal((await revoked.json()).code, "FMS_IP_BLOCKED");
    const afterRevocation = await Promise.all(Array.from({ length: 8 }, () =>
      context.request.get(`${origin}/api/admin/me`)));
    for (const result of afterRevocation) {
      assert.equal(result.status(), 401, "A destroyed session must remain unauthenticated");
    }
    page = await context.newPage();
    email = page.locator('input[type="email"]');
    password = page.locator('input[autocomplete="current-password"]');
    await page.goto(`${origin}/flight-system/`);
    await page.getByRole("button", { name: "Hyr në sistem" }).waitFor();
    await fixtureAction("unblock");
    await email.fill(first.emails[1]);
    await password.fill(first.password);
    const normalResponse = page.waitForResponse(r => r.url().endsWith("/api/admin/login") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Hyr në sistem" }).click();
    const normalLogin = await normalResponse;
    assert.equal(normalLogin.status(), 200);
    await normalLogin.finished();
    await email.waitFor({ state: "detached" });
    const normal = await context.request.get(`${origin}/api/admin/me`);
    assert.equal(normal.status(), 200);
    assert.equal((await normal.json()).email, first.emails[1]);
    await context.close();
    console.log("Blocked-IP browser journey passed: password, local email, expiry, one-use, reblock, second account.");
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      if (started) {
        try {
          await fixtureAction("stop");
          const code = await waitForExit(child);
          assert.equal(code, 0, "Fixture teardown failed");
        } catch (error) {
          if (child.exitCode === null) child.kill("SIGTERM");
          throw error;
        }
      } else if (child.exitCode === null) {
        child.kill("SIGTERM");
        assert.equal(await waitForExit(child), 0, "Fixture startup cleanup failed");
      }
    }
  }
}

await run();