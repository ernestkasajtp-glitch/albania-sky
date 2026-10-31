import { isIP } from "node:net";
import type { Request, RequestHandler } from "express";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { notifyBlockedFmsAttempt } from "./fmsAccessApproval.js";

function normalizeIp(value: string): string | null {
  const ip = value.trim().replace(/^::ffff:/i, "");
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) === 6) return new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  return null;
}

export function validFmsIp(value: unknown): string | null {
  return typeof value === "string" && value.length <= 45 ? normalizeIp(value) : null;
}

// Informational browser identifier, not an authentication or trust factor.
export function validFmsDeviceId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : null;
}

export function trustedFmsIp(req: Request): string {
  return trustedFmsIpFromPeer(req.socket.remoteAddress, req.headers["x-forwarded-for"]);
}

export function trustedFmsIpFromPeer(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
): string {
  const peer = remoteAddress ?? "";
  // Only the local Apache proxy may provide X-Forwarded-For. A caller reaching
  // the Node port directly must never choose the address used for blocking.
  // Apache mod_proxy APPENDS its observed client to XFF; the rightmost entry
  // is the one it observed, not a client-supplied leftmost entry.
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer);
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
  const lastHop = forwarded?.split(",").at(-1)?.trim();
  return normalizeIp(loopback ? (lastHop || peer) : peer) ?? "unknown";
}

const lastBlockedAudit = new Map<string, number>();

export async function recordFmsLoginAttempt(ip: string, result: "success" | "failed" | "blocked" | "verified", userId?: number, deviceId?: string | null): Promise<void> {
  if (result === "blocked") {
    const now = Date.now();
    if (now - (lastBlockedAudit.get(ip) ?? 0) < 60_000) return;
    lastBlockedAudit.set(ip, now);
    if (lastBlockedAudit.size > 10_000) {
      for (const [key, time] of lastBlockedAudit) {
        if (now - time > 60_000) lastBlockedAudit.delete(key);
      }
    }
  }
  try {
    await pool.query(
      "INSERT INTO fms_login_attempts (ip, result, user_id, device_id) VALUES ($1, $2, $3, $4)",
      [ip, result, userId ?? null, ["success", "verified"].includes(result) ? (deviceId ?? null) : null],
    );
  } catch (error) {
    if (result === "blocked") lastBlockedAudit.delete(ip);
    throw error;
  }
}

export async function recordFmsDevice(req: Request, deviceId: string, ip: string, countLogin: boolean): Promise<void> {
  if (ip === "unknown") return;
  const userAgent = typeof req.headers["user-agent"] === "string"
    ? req.headers["user-agent"].slice(0, 300) : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO fms_devices (device_id, user_agent) VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET user_agent = EXCLUDED.user_agent, last_seen_at = now()`,
      [deviceId, userAgent],
    );
    await client.query(
      `INSERT INTO fms_device_ips (device_id, ip, login_count) VALUES ($1, $2, $3)
       ON CONFLICT (device_id, ip) DO UPDATE
       SET login_count = fms_device_ips.login_count + EXCLUDED.login_count, last_seen_at = now()`,
      [deviceId, ip, countLogin ? 1 : 0],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const lastPresenceWrite = new Map<string, number>();

export function trackFmsSession(req: Request, ip = trustedFmsIp(req)): void {
  const sid = req.sessionID;
  const userId = req.session?.userId;
  if (userId && (req.session as any).fmsCurrentIp !== ip) {
    (req.session as any).fmsCurrentIp = ip;
  }
  trackFmsSid(sid, userId, ip);
}

export function trackFmsSid(sid: string | undefined, userId: number | undefined, ip: string): void {
  if (!sid || !userId || ip === "unknown") return;
  const now = Date.now();
  if (now - (lastPresenceWrite.get(sid) ?? 0) < 60_000) return;
  lastPresenceWrite.set(sid, now);
  if (lastPresenceWrite.size > 10_000) {
    for (const [key, time] of lastPresenceWrite) {
      if (now - time > 60_000) lastPresenceWrite.delete(key);
    }
  }
  void pool.query(
    `INSERT INTO fms_ip_sessions (sid, ip, user_id, last_seen)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (sid) DO UPDATE
     SET ip = EXCLUDED.ip, user_id = EXCLUDED.user_id, last_seen = now()`,
    [sid, ip, userId],
  ).catch(error => {
    lastPresenceWrite.delete(sid);
    logger.error({ err: error }, "FMS IP session presence could not be recorded");
  });
}

// Runs only after the path-based session selector in app.ts. Never intercept
// booking-engine, partner API, webhooks, or public resources.
export const enforceFmsIp: RequestHandler = async (req, res, next) => {
  if (/^\/(auth|public|v1|webhook)(\/|$)/.test(req.path) ||
      req.path === "/healthz" ||
      (req.path === "/destinations" && req.method === "GET")) {
    next();
    return;
  }
  const login = req.path === "/admin/login" && req.method === "POST";
  const fmsSession = !!req.session?.userId &&
    ["admin", "manager", "agent_staff"].includes(req.session?.role ?? "") &&
    (req.session as any)?.source !== "be";
  if (!login && !fmsSession) { next(); return; }
  const ip = trustedFmsIp(req);
  try {
    const blocked = await pool.query("SELECT access_generation FROM fms_ip_blocks WHERE ip = $1 LIMIT 1", [ip]);
    if (blocked.rowCount) {
      if (!login && fmsSession && (req.session as any).source === "fms" &&
          (req.session as any).fmsIpVerified === ip &&
          (req.session as any).fmsIpVerifiedGeneration === blocked.rows[0].access_generation) {
        trackFmsSession(req, ip);
        next();
        return;
      }
      if (login) {
        await recordFmsLoginAttempt(ip, "blocked");
        void notifyBlockedFmsAttempt(ip, req.headers["user-agent"]).catch(error =>
          logger.error({ err: error }, "FMS blocked-IP alert email failed"));
      }
      if (fmsSession) {
        await new Promise<void>(resolve => req.session.destroy(() => resolve()));
        res.clearCookie("fms_sid", { path: "/" });
      }
      res.status(403).json({ code: "FMS_IP_BLOCKED", error: "Kjo IP është e bllokuar për faqen e brendshme." });
      return;
    }
    if (fmsSession) trackFmsSession(req, ip);
    next();
  } catch (error) {
    next(error);
  }
};

setInterval(() => {
  void pool.query("DELETE FROM fms_ip_sessions WHERE last_seen < now() - INTERVAL '13 hours'")
    .catch(error => logger.error({ err: error }, "FMS IP presence cleanup failed"));
}, 30 * 60_000).unref();