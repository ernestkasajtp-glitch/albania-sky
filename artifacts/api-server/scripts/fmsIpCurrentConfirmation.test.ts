// Fully in-memory route regression: no database connection, real IP or configuration writes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import express from "express";

test("current-IP confirmation is strict, rejection is atomic, and unblocks need no confirmation", async () => {
  // Force a non-listening local endpoint even if the caller has a real DATABASE_URL.
  process.env.DATABASE_URL = "postgresql://USER:REPLACE_ME@127.0.0.1:1/never_connect";
  const { pool } = await import("@workspace/db");
  const { fmsIpAccessRouter } = await import("../src/routes/fmsIpAccess.js");
  const current = "198.51.100.246";
  const other = "198.51.100.247";
  const blocks = new Set<string>();
  const events: string[] = [];
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  (pool as any).query = async () => { throw new Error("Unexpected real database query"); };
  (pool as any).connect = async () => ({
    query: async (sql: string, params: unknown[] = []) => {
      sql = sql.trim();
      if (/^SELECT 1 FROM fms_ip_blocks/.test(sql)) return { rowCount: Number(blocks.has(params[0] as string)) };
      if (/^INSERT INTO fms_ip_blocks/.test(sql)) { blocks.add(params[0] as string); return { rowCount: 1 }; }
      if (/^DELETE FROM fms_ip_blocks/.test(sql)) {
        const removed = blocks.delete(params[0] as string);
        return { rowCount: Number(removed) };
      }
      if (/^INSERT INTO fms_ip_block_events/.test(sql)) { events.push(`${params[1]}:${params[0]}`); return { rowCount: 1 }; }
      if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock|DELETE FROM sessions|DELETE FROM fms_ip_sessions)/.test(sql)) return { rowCount: 0 };
      throw new Error(`Unexpected fixture SQL: ${sql}`);
    },
    release() {},
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: 987654321, role: "admin", source: "fms" };
    next();
  });
  app.use(fmsIpAccessRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    if (!server.listening) await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const request = async (path: string, body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/settings/ip-access/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.10, ${current}` },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    for (const path of ["block", "blocks"]) {
      for (const confirmation of [undefined, false, "true", 1]) {
        const base = path === "block" ? { ip: current, blocked: true } : { ips: [other, current], blocked: true };
        const result = await request(path, { ...base, ...(confirmation === undefined ? {} : { confirmCurrentIp: confirmation }) });
        assert.equal(result.status, 409, `${path}: ${String(confirmation)}`);
        assert.equal(result.body.code, "CONFIRM_CURRENT_IP");
        assert.deepEqual([...blocks], [], "rejected batch must not partially block the other IP");
        assert.deepEqual(events, []);
      }
    }
    assert.equal((await request("block", { ip: current, blocked: true, confirmCurrentIp: true })).status, 200);
    assert.ok(blocks.has(current));
    assert.equal((await request("block", { ip: current, blocked: false })).status, 200);
    assert.ok(!blocks.has(current), "unblock works without the flag");
    const batch = await request("blocks", { ips: [other, current], blocked: true, confirmCurrentIp: true });
    assert.equal(batch.status, 200);
    assert.deepEqual(batch.body.succeeded, [other, current]);
    assert.deepEqual([...blocks].sort(), [current, other].sort());
    assert.equal((await request("blocks", { ips: [other, current], blocked: false })).status, 200);
    assert.equal(blocks.size, 0);
    // A different IP is not subject to confirmation.
    assert.equal((await request("block", { ip: other, blocked: true })).status, 200);
    assert.ok(blocks.has(other));
    assert.equal((await request("block", { ip: other, blocked: false })).status, 200);
    // Importing the entire routes index would start unrelated background workers.
    // Assert that the real mount still has the FMS auth + admin-only guards.
    const index = await readFile("src/routes/index.ts", "utf8");
    assert.match(index, /router\.use\(requireFmsAuth,\s*requireAdmin,\s*fmsIpAccessRouter\)/);
    assert.match(index, /function requireAdmin\([\s\S]*?role !== "admin"[\s\S]*?res\.status\(403\)/);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    (pool as any).connect = originalConnect;
    (pool as any).query = originalQuery;
    await pool.end();
  }
});