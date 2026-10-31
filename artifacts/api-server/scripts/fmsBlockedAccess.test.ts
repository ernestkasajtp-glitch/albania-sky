import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { consumeFmsAccessCode } from "../src/lib/fmsAccessApproval.js";
import { enforceFmsIp } from "../src/lib/fmsIpAccess.js";

const ip = "198.51.100.242"; // Documentation-only address; never a real visitor.
const userId = 2_000_000_001;
const testSecret = "local-test-only-fms-access-secret";
process.env.SESSION_SECRET = testSecret;
process.env.NOTIFY_EMAIL = ""; // Never send real email from this local test.
const challengeIds: string[] = [];

async function challenge(code: string, expires = "1 minute"): Promise<void> {
  const id = randomUUID();
  challengeIds.push(id);
  const digest = createHmac("sha256", testSecret).update(`${id}:${code}`).digest("hex");
  await pool.query(
    `INSERT INTO fms_ip_access_codes (id, ip, user_id, code_hash, sent_at, expires_at)
     VALUES ($1, $2, $3, $4, now(), now() + $5::interval)`,
    [id, ip, userId, digest, expires],
  );
}

before(async () => {
  await pool.query(
    `INSERT INTO fms_ip_blocks (ip, blocked_by, access_generation) VALUES ($1, $2, $3)
     ON CONFLICT (ip) DO UPDATE SET access_generation = EXCLUDED.access_generation`,
    [ip, userId, "test-generation"],
  );
});

after(async () => {
  await pool.query("DELETE FROM fms_ip_access_codes WHERE id = ANY($1::text[])", [challengeIds]);
  await pool.query("DELETE FROM fms_login_attempts WHERE ip = $1", [ip]);
  await pool.query("DELETE FROM fms_ip_blocks WHERE ip = $1", [ip]);
  await pool.end();
});

test("one code works once only for its original IP and user, even concurrently", async () => {
  await challenge("00012345");
  assert.equal(await consumeFmsAccessCode(ip, userId + 1, "00012345"), false);
  assert.equal(await consumeFmsAccessCode("198.51.100.243", userId, "00012345"), false);
  // More callers than the default PG pool size must not exhaust the pool.
  const results = await Promise.all(
    Array.from({ length: 32 }, () => consumeFmsAccessCode(ip, userId, "00012345")),
  );
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await consumeFmsAccessCode(ip, userId, "00012345"), false);
});

test("expired code and code with five failed attempts cannot be used", async () => {
  await challenge("87654321", "-1 second");
  assert.equal(await consumeFmsAccessCode(ip, userId, "87654321"), false);
  await challenge("87654322");
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(await consumeFmsAccessCode(ip, userId, "11111111"), false);
  }
  assert.equal(await consumeFmsAccessCode(ip, userId, "87654322"), false);
});

test("blocked normal login cannot inherit a verified session from another account", async () => {
  let status = 0;
  let body: any;
  let continued = false;
  const session = {
    userId, role: "admin", source: "fms", fmsIpVerified: ip,
    fmsIpVerifiedGeneration: "test-generation",
    destroy(callback: () => void) { callback(); },
  };
  const req = {
    path: "/admin/login", method: "POST", socket: { remoteAddress: ip },
    headers: {}, session, sessionID: "test-only-session",
  } as unknown as Request;
  const res = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
    clearCookie() { return this; },
  } as unknown as Response;
  await (enforceFmsIp as any)(req, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(status, 403);
  assert.equal(body.code, "FMS_IP_BLOCKED");
});

test("rotating a block generation revokes an old verified session", async () => {
  await pool.query("UPDATE fms_ip_blocks SET access_generation = $2 WHERE ip = $1", [ip, "new-generation"]);
  let continued = false;
  let status = 0;
  const req = {
    path: "/flights", method: "GET", socket: { remoteAddress: ip }, headers: {},
    session: {
      userId, role: "admin", source: "fms", fmsIpVerified: ip,
      fmsIpVerifiedGeneration: "test-generation", destroy(callback: () => void) { callback(); },
    },
    sessionID: "test-only-session",
  } as unknown as Request;
  const res = {
    status(value: number) { status = value; return this; },
    json() { return this; },
    clearCookie() { return this; },
  } as unknown as Response;
  await (enforceFmsIp as any)(req, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(status, 403);
});