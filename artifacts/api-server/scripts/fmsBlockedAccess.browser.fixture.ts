// Isolated browser-test fixture. Run with:
// From artifacts/api-server:
// node build-script.mjs scripts/fmsBlockedAccess.browser.fixture.ts node_modules/.cache/fms-browser-fixture
// node node_modules/.cache/fms-browser-fixture/fmsBlockedAccess.browser.fixture.mjs
// POST /__fixture/stop when done; this removes all fixture rows and stops the servers.
// Never run against a production database. SMTP is deliberately local and cannot relay mail.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer as createSmtpServer } from "node:net";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";

if (process.env.NODE_ENV === "production" || process.env.FMS_BROWSER_TEST !== "1" ||
    !process.env.DATABASE_URL || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("The browser fixture requires an explicitly opted-in development database");
}

const ip = "198.51.100.241";
const host = "127.0.0.1";
const smtpPort = 18998;
const apiPort = 18999;
const browserPort = 18997;
const suffix = randomUUID().slice(0, 8);
const emails = [`fms-blocked-${suffix}@example.invalid`, `fms-normal-${suffix}@example.invalid`];
const password = `fixture-${randomUUID()}`;
const startedAt = new Date();
const smtpMessages: string[] = [];
const userIds: number[] = [];
let cleaned = false;
let stopProcess: (() => Promise<void>) | undefined;

// Nodemailer authenticates with PLAIN or LOGIN. The listener only acknowledges
// SMTP, stores DATA in memory, and has no code path to forward it anywhere.
const smtp = createSmtpServer(socket => {
  let buffer = "";
  let data = "";
  let inData = false;
  let loginStep = 0;
  socket.write("220 local fixture SMTP\r\n");
  socket.on("data", chunk => {
    buffer += chunk.toString();
    while (buffer.includes("\r\n")) {
      const end = buffer.indexOf("\r\n");
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (inData) {
        if (line === ".") {
          smtpMessages.push(data);
          data = "";
          inData = false;
          socket.write("250 queued locally\r\n");
        } else {
          data += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
        }
      } else if (loginStep) {
        if (loginStep === 1) {
          loginStep = 2;
          socket.write("334 UGFzc3dvcmQ6\r\n");
        } else {
          loginStep = 0;
          socket.write("235 authenticated\r\n");
        }
      } else if (/^EHLO|^HELO/i.test(line)) {
        socket.write("250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1000000\r\n");
      } else if (/^AUTH PLAIN/i.test(line)) {
        socket.write("235 authenticated\r\n");
      } else if (/^AUTH LOGIN/i.test(line)) {
        loginStep = 1;
        socket.write("334 VXNlcm5hbWU6\r\n");
      } else if (/^DATA$/i.test(line)) {
        inData = true;
        socket.write("354 end with dot\r\n");
      } else if (/^QUIT$/i.test(line)) {
        socket.end("221 bye\r\n");
      } else {
        socket.write("250 ok\r\n");
      }
    }
  });
});

const listen = (server: ReturnType<typeof createHttpServer> | typeof smtp, port: number) =>
  new Promise<void>((resolve, reject) => server.once("error", reject).listen(port, host, resolve));
const close = (server: ReturnType<typeof createHttpServer> | typeof smtp) =>
  new Promise<void>(resolve => server.close(() => resolve()));

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    const devices = await pool.query<{ device_id: string }>(
      "SELECT device_id FROM fms_device_ips WHERE ip = $1", [ip],
    );
    await pool.query("DELETE FROM fms_ip_access_codes WHERE ip = $1 AND user_id = ANY($2::integer[])", [ip, userIds]);
    await pool.query("DELETE FROM fms_ip_sessions WHERE ip = $1 AND user_id = ANY($2::integer[])", [ip, userIds]);
    await pool.query("DELETE FROM fms_login_attempts WHERE ip = $1 AND (user_id IS NULL OR user_id = ANY($2::integer[]))", [ip, userIds]);
    await pool.query("DELETE FROM fms_ip_block_alert_emails WHERE ip = $1", [ip]);
    await pool.query("DELETE FROM fms_device_ips WHERE ip = $1", [ip]);
    await pool.query(
      `DELETE FROM fms_devices WHERE device_id = ANY($1::text[]) AND first_seen_at >= $2
       AND NOT EXISTS (SELECT 1 FROM fms_device_ips WHERE fms_device_ips.device_id = fms_devices.device_id)`,
      [devices.rows.map(row => row.device_id), startedAt],
    );
    await pool.query("DELETE FROM fms_ip_blocks WHERE ip = $1 AND blocked_by = $2", [ip, userIds[0]]);
    await pool.query(
      "DELETE FROM sessions WHERE (sess::jsonb->>'userId') = ANY($1::text[])",
      [userIds.map(String)],
    );
    await pool.query("DELETE FROM booking_users WHERE id = ANY($1::integer[]) AND email = ANY($2::text[])", [userIds, emails]);
    const remaining = await pool.query<{ kind: string; count: string }>(
      `SELECT 'users' AS kind, count(*)::text AS count FROM booking_users WHERE id = ANY($1::integer[])
       UNION ALL SELECT 'sessions', count(*)::text FROM sessions WHERE sess::jsonb->>'userId' = ANY($2::text[])
       UNION ALL SELECT 'codes', count(*)::text FROM fms_ip_access_codes WHERE ip = $3 AND user_id = ANY($1::integer[])
       UNION ALL SELECT 'presence', count(*)::text FROM fms_ip_sessions WHERE ip = $3 AND user_id = ANY($1::integer[])
       UNION ALL SELECT 'attempts', count(*)::text FROM fms_login_attempts WHERE ip = $3 AND (user_id IS NULL OR user_id = ANY($1::integer[]))
       UNION ALL SELECT 'alerts', count(*)::text FROM fms_ip_block_alert_emails WHERE ip = $3
       UNION ALL SELECT 'device_ips', count(*)::text FROM fms_device_ips WHERE ip = $3
       UNION ALL SELECT 'devices', count(*)::text FROM fms_devices WHERE device_id = ANY($4::text[]) AND first_seen_at >= $5
         AND NOT EXISTS (SELECT 1 FROM fms_device_ips WHERE fms_device_ips.device_id = fms_devices.device_id)
       UNION ALL SELECT 'blocks', count(*)::text FROM fms_ip_blocks WHERE ip = $3 AND blocked_by = ANY($1::integer[])`,
      [userIds, userIds.map(String), ip, devices.rows.map(row => row.device_id), startedAt],
    );
    for (const row of remaining.rows) {
      assert.equal(Number(row.count), 0, `Fixture ${row.kind} were not removed`);
    }
    console.log("Fixture cleanup verified: users, sessions, codes, presence, attempts, alerts, devices and blocks removed.");
  } finally {
    // The imported app can retain background workers waiting on the pool.
    // Test rows are deleted and verified before closing the pool; do not let
    // unrelated app timers prevent a completed teardown from exiting.
    await Promise.race([pool.end(), new Promise<void>(resolve => setTimeout(resolve, 3000))]);
  }
}

async function main() {
  const existing = await pool.query("SELECT 1 FROM fms_ip_blocks WHERE ip = $1", [ip]);
  assert.equal(existing.rowCount, 0, "Fixture IP already blocked; refusing to overwrite it");
  const hash = await bcrypt.hash(password, 10);
  for (const email of emails) {
    const result = await pool.query<{ id: number }>(
      "INSERT INTO booking_users (email, password_hash, name, role, is_approved) VALUES ($1, $2, $3, 'manager', true) RETURNING id",
      [email, hash, "Browser Fixture"],
    );
    userIds.push(result.rows[0].id);
  }
  await pool.query(
    "INSERT INTO fms_ip_blocks (ip, blocked_by, access_generation) VALUES ($1, $2, $3)",
    [ip, userIds[0], randomUUID()],
  );
  await listen(smtp, smtpPort);
  process.env.SMTP_HOST = host;
  process.env.SMTP_PORT = String(smtpPort);
  process.env.SMTP_USER = "local@example.invalid";
  process.env.SMTP_PASS = "fixture-only";
  process.env.GMAIL_FROM = "local@example.invalid";
  process.env.NOTIFY_EMAIL = "admin@example.invalid";
  process.env.SESSION_SECRET = `fixture-${randomUUID()}`;
  process.env.NODE_ENV = "development";

  // Import app, not index: no cron jobs, external payment setup, or background imports.
  const { default: app } = await import("../src/app.js");
  const api = createHttpServer(app);
  await listen(api, apiPort);
  const frontend = path.resolve(process.cwd(), "../flight-system/dist/public");
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    browser.closeAllConnections();
    api.closeAllConnections();
    await close(browser);
    await close(api);
    await close(smtp);
    await cleanup();
    process.exit(0);
  };
  const browser = createHttpServer(async (req, res) => {
    const pathname = new URL(req.url ?? "/", `http://${host}`).pathname;
    if (pathname === "/__fixture/stop" && req.method === "POST") {
      res.end("cleaning up");
      setImmediate(() => void stop().catch(error => {
        console.error("Fixture cleanup failed", error);
        process.exit(1);
      }));
      return;
    }
    if (pathname === "/__fixture/state") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ emails, password, ip, messages: smtpMessages }));
      return;
    }
    if (pathname === "/__fixture/reblock" && req.method === "POST") {
      await pool.query("UPDATE fms_ip_blocks SET access_generation = $2, blocked_at = now() WHERE ip = $1", [ip, randomUUID()]);
      res.end("ok");
      return;
    }
    if (pathname === "/__fixture/expire" && req.method === "POST") {
      await pool.query("UPDATE fms_ip_access_codes SET expires_at = now() - interval '1 second', created_at = now() - interval '2 minutes' WHERE ip = $1 AND user_id = $2 AND used_at IS NULL", [ip, userIds[0]]);
      res.end("ok");
      return;
    }
    if (pathname === "/__fixture/unblock" && req.method === "POST") {
      await pool.query("DELETE FROM fms_ip_blocks WHERE ip = $1 AND blocked_by = $2", [ip, userIds[0]]);
      res.end("ok");
      return;
    }
    if (pathname.startsWith("/api/")) {
      const upstream = httpRequest(
        { host, port: apiPort, path: req.url, method: req.method,
          headers: { ...req.headers, host: `${host}:${apiPort}`, "x-forwarded-for": ip } },
        response => {
          res.writeHead(response.statusCode ?? 500, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("error", () => { res.writeHead(502); res.end("fixture API unavailable"); });
      req.pipe(upstream);
      return;
    }
    try {
      const assetPath = pathname.startsWith("/flight-system/")
        ? pathname.slice("/flight-system".length) : pathname;
      const file = path.join(frontend, assetPath === "/" ? "index.html" : assetPath);
      if (!file.startsWith(frontend + path.sep)) throw new Error("outside frontend");
      const body = await readFile(file);
      const ext = path.extname(file);
      res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
        ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" } as Record<string, string>)[ext] ?? "application/octet-stream");
      res.end(body);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  await listen(browser, browserPort);
  stopProcess = stop;
  console.log(`Fixture ready at http://${host}:${browserPort}/ (SMTP captured locally; credentials via /__fixture/state)`);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void (stopProcess ? stopProcess() : cleanup().then(() => process.exit(0)))
    .catch(error => {
      console.error("Fixture cleanup failed", error);
      process.exit(1);
    }));
}

main().catch(async error => {
  console.error(error);
  await cleanup();
  process.exitCode = 1;
});