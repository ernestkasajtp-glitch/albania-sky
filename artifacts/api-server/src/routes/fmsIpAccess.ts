import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { trustedFmsIp, validFmsIp, validFmsDeviceId } from "../lib/fmsIpAccess.js";
import { closeLiveClientsByIp } from "../lib/liveEvents.js";
import { closeTeamChatByIp } from "../lib/teamChatWs.js";
import { logger } from "../lib/logger.js";
import { randomUUID } from "node:crypto";

export const fmsIpAccessRouter: IRouter = Router();

function pageOptions(query: Record<string, unknown>, defaultLimit: number): { page: number; limit: number | "all"; search: string } {
  const all = query.limit === "all";
  const page = all ? 1 : Math.min(10_000, Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1));
  const limit = all ? "all" : Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit));
  const search = String(query.search ?? "").trim().slice(0, 60);
  return { page, limit, search };
}

fmsIpAccessRouter.get("/settings/ip-access/ips", async (req, res) => {
  const { page, limit, search } = pageOptions(req.query as Record<string, unknown>, 20);
  const offset = limit === "all" ? 0 : (page - 1) * limit;
  const source = `
    WITH logins AS (
      SELECT ip, count(*)::integer AS login_count,
             count(*) FILTER (WHERE result = 'verified')::integer AS verified_count,
             max(created_at) AS last_login_at
      FROM fms_login_attempts WHERE result IN ('success', 'verified') GROUP BY ip
    ),
    known AS (
      SELECT ip FROM logins UNION SELECT ip FROM fms_ip_blocks UNION SELECT ip FROM fms_ip_labels
    ),
    presence AS (
      SELECT p.ip, count(*)::integer AS active_sessions
      FROM fms_ip_sessions p
      JOIN sessions s ON s.sid = p.sid AND s.expired_at > now()
      WHERE p.last_seen > now() - INTERVAL '15 minutes'
      GROUP BY p.ip
    )
    SELECT k.ip, coalesce(l.login_count, 0) AS "loginCount",
           coalesce(l.verified_count, 0) AS "verifiedCount",
           verified_user.name AS "lastVerifiedUser",
           l.last_login_at AS "lastLoginAt",
           coalesce(p.active_sessions, 0) AS "activeSessions",
            (b.ip IS NOT NULL) AS "isBlocked", b.blocked_at AS "blockedAt",
            il.label, dv.devices
    FROM known k
    LEFT JOIN logins l ON l.ip = k.ip
    LEFT JOIN presence p ON p.ip = k.ip
    LEFT JOIN fms_ip_blocks b ON b.ip = k.ip
    LEFT JOIN fms_ip_labels il ON il.ip = k.ip
    LEFT JOIN LATERAL (
      SELECT coalesce(u.name, u.email) AS name
      FROM fms_login_attempts a LEFT JOIN booking_users u ON u.id = a.user_id
      WHERE a.ip = k.ip AND a.result = 'verified'
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1
    ) verified_user ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(json_agg(json_build_object(
        'deviceId', d.device_id, 'label', d.label, 'userAgent', d.user_agent,
        'lastSeenAt', v.last_seen_at, 'loginCount', v.login_count
      ) ORDER BY v.last_seen_at DESC), '[]'::json) AS devices
      FROM fms_device_ips v JOIN fms_devices d ON d.device_id = v.device_id
      WHERE v.ip = k.ip
    ) dv ON true
    WHERE k.ip ILIKE '%' || $1 || '%' OR coalesce(il.label, '') ILIKE '%' || $1 || '%'
  `;
  const [rows, count] = await Promise.all([
    pool.query(`${source} ORDER BY coalesce(l.last_login_at, b.blocked_at) DESC NULLS LAST, k.ip ASC ${limit === "all" ? "" : "LIMIT $2 OFFSET $3"}`,
      limit === "all" ? [search] : [search, limit, offset]),
    pool.query(`SELECT count(*)::integer AS total FROM (${source}) summary`, [search]),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.json({ items: rows.rows, total: count.rows[0]?.total ?? 0, page, limit, currentIp: trustedFmsIp(req) });
});

fmsIpAccessRouter.get("/settings/ip-access/attempts", async (req, res) => {
  const { page, limit, search } = pageOptions(req.query as Record<string, unknown>, 25);
  const offset = limit === "all" ? 0 : (page - 1) * limit;
  const result = String(req.query.result ?? "");
  if (result && !["success", "failed", "blocked", "verified"].includes(result)) {
    res.status(400).json({ error: "Filtër i pavlefshëm" }); return;
  }
  const source = `FROM fms_login_attempts a
    LEFT JOIN fms_ip_blocks b ON b.ip = a.ip
    LEFT JOIN fms_ip_labels il ON il.ip = a.ip
    LEFT JOIN fms_devices d ON d.device_id = a.device_id
    LEFT JOIN booking_users u ON u.id = a.user_id`;
  const where = `WHERE (a.ip ILIKE '%' || $1 || '%' OR coalesce(il.label, '') ILIKE '%' || $1 || '%'
     OR coalesce(d.label, '') ILIKE '%' || $1 || '%') AND ($2 = '' OR a.result = $2)`;
  const [rows, count] = await Promise.all([
    pool.query(`SELECT a.id, a.ip, a.result, a.created_at AS "createdAt",
                      (b.ip IS NOT NULL) AS "isBlocked", il.label AS "ipLabel",
                       a.device_id AS "deviceId", d.label AS "deviceLabel", d.user_agent AS "deviceUserAgent",
                       CASE WHEN a.result = 'verified' THEN coalesce(u.name, u.email) END AS "verifiedUser"
                ${source} ${where}
                ORDER BY a.created_at DESC, a.id DESC ${limit === "all" ? "" : "LIMIT $3 OFFSET $4"}`,
      limit === "all" ? [search, result] : [search, result, limit, offset]),
    pool.query(`SELECT count(*)::integer AS total ${source} ${where}`, [search, result]),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.json({ items: rows.rows, total: count.rows[0]?.total ?? 0, page, limit });
});

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 100) return null;
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 60);
}

fmsIpAccessRouter.put("/settings/ip-access/ips/label", async (req, res) => {
  const ip = validFmsIp(req.body?.ip);
  const label = cleanLabel(req.body?.label);
  if (!ip || label === null) {
    res.status(400).json({ error: "IP ose emër i pavlefshëm" }); return;
  }
  if (label) {
    await pool.query(
      `INSERT INTO fms_ip_labels (ip, label) VALUES ($1, $2)
       ON CONFLICT (ip) DO UPDATE SET label = EXCLUDED.label`,
      [ip, label],
    );
  } else {
    await pool.query("DELETE FROM fms_ip_labels WHERE ip = $1", [ip]);
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ip, label: label || null });
});

fmsIpAccessRouter.put("/settings/ip-access/devices/label", async (req, res) => {
  const deviceId = validFmsDeviceId(req.body?.deviceId);
  const label = cleanLabel(req.body?.label);
  if (!deviceId || label === null) {
    res.status(400).json({ error: "Pajisje ose emër i pavlefshëm" }); return;
  }
  const updated = await pool.query(
    "UPDATE fms_devices SET label = $2 WHERE device_id = $1 RETURNING device_id",
    [deviceId, label || null],
  );
  if (!updated.rowCount) { res.status(404).json({ error: "Pajisja nuk u gjet" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ deviceId, label: label || null });
});

async function setIpBlocked(ip: string, blocked: boolean, actorId: number): Promise<void> {
  const client = await pool.connect();
  let changed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [ip]);
    if (blocked) {
      const existing = await client.query("SELECT 1 FROM fms_ip_blocks WHERE ip = $1", [ip]);
      await client.query(
        `INSERT INTO fms_ip_blocks (ip, blocked_by, access_generation) VALUES ($1, $2, $3)
         ON CONFLICT (ip) DO UPDATE SET blocked_at = now(), blocked_by = EXCLUDED.blocked_by,
           access_generation = EXCLUDED.access_generation`,
        [ip, actorId, randomUUID()],
      );
      changed = !existing.rowCount;
      // Revoke only sessions tracked from the FMS cookie, never booking-engine
      // sessions or partner API credentials from the same public IP.
      await client.query(
        `DELETE FROM sessions WHERE sess::jsonb->>'source' = 'fms'
         AND (sid IN (SELECT sid FROM fms_ip_sessions WHERE ip = $1)
              OR sess::jsonb->>'fmsLoginIp' = $1
              OR sess::jsonb->>'fmsCurrentIp' = $1)`,
        [ip],
      );
      await client.query("DELETE FROM fms_ip_sessions WHERE ip = $1", [ip]);
    } else {
      const removed = await client.query("DELETE FROM fms_ip_blocks WHERE ip = $1 RETURNING ip", [ip]);
      changed = !!removed.rowCount;
    }
    if (changed) {
      await client.query(
        "INSERT INTO fms_ip_block_events (ip, action, actor_id) VALUES ($1, $2, $3)",
        [ip, blocked ? "block" : "unblock", actorId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (blocked) {
    closeLiveClientsByIp(ip);
    closeTeamChatByIp(ip);
  }
}

fmsIpAccessRouter.put("/settings/ip-access/block", async (req, res) => {
  const ip = validFmsIp(req.body?.ip);
  const blocked = req.body?.blocked;
  if (!ip || typeof blocked !== "boolean") {
    res.status(400).json({ error: "IP ose veprim i pavlefshëm" }); return;
  }
  if (blocked && ip === trustedFmsIp(req) && req.body?.confirmCurrentIp !== true) {
    res.status(409).json({ error: "Bllokimi i IP-së aktuale mund të ndërpresë aksesin tënd. Konfirmo për të vazhduar.", code: "CONFIRM_CURRENT_IP" }); return;
  }
  await setIpBlocked(ip, blocked, req.session.userId!);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ip, blocked });
});

// The whole batch is validated before any change. Individual database failures
// are reported explicitly, so the client only updates rows confirmed by the API.
fmsIpAccessRouter.put("/settings/ip-access/blocks", async (req, res) => {
  const submitted = req.body?.ips;
  const blocked = req.body?.blocked;
  if (!Array.isArray(submitted) || submitted.length < 1 || submitted.length > 100 ||
      typeof blocked !== "boolean") {
    res.status(400).json({ error: "Zgjidh 1 deri në 100 IP për çdo veprim." }); return;
  }
  const ips = submitted.map(validFmsIp);
  if (ips.some(ip => !ip)) {
    res.status(400).json({ error: "Lista përmban një IP të pavlefshme." }); return;
  }
  const succeeded: string[] = [];
  const failed: { ip: string; error: string }[] = [];
  const currentIp = trustedFmsIp(req);
  if (blocked && ips.includes(currentIp) && req.body?.confirmCurrentIp !== true) {
    res.status(409).json({ error: "Lista përfshin IP-në tënde aktuale. Konfirmo rrezikun e ndërprerjes së aksesit.", code: "CONFIRM_CURRENT_IP" }); return;
  }
  for (const ip of new Set(ips as string[])) {
    try {
      await setIpBlocked(ip, blocked, req.session.userId!);
      succeeded.push(ip);
    } catch (error) {
      logger.error({ err: error }, "FMS IP batch action failed");
      failed.push({ ip, error: "Veprimi dështoi në server." });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ blocked, succeeded, failed });
});