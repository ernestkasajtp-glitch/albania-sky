import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import { sendEmailStrict } from "./gmail.js";
import { logger } from "./logger.js";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function hashCode(id: string, code: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for FMS access codes");
  return createHmac("sha256", secret).update(`${id}:${code}`).digest("hex");
}

export class AccessRequestLimited extends Error {}

// Persist a reservation before sending: parallel blocked requests cannot flood the inbox.
// A failed delivery restores the prior state so the next attempt may retry.
export async function notifyBlockedFmsAttempt(ip: string, userAgent: string | undefined): Promise<void> {
  const to = process.env.NOTIFY_EMAIL;
  if (!to || ip === "unknown") return;
  const client = await pool.connect();
  let previous: Date | null = null;
  let reserved: Date | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fms-block-alert-global'))");
    const prior = await client.query<{ last_sent_at: Date }>(
      "SELECT last_sent_at FROM fms_ip_block_alert_emails WHERE ip = $1", [ip],
    );
    previous = prior.rows[0]?.last_sent_at ?? null;
    const total = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM fms_ip_block_alert_emails WHERE last_sent_at > now() - interval '1 hour'",
    );
    if ((previous && Date.now() - new Date(previous).getTime() < 10 * 60_000) ||
        Number(total.rows[0]?.count ?? 0) >= 30) {
      await client.query("COMMIT");
      return;
    }
    const updated = await client.query<{ last_sent_at: Date }>(
      `INSERT INTO fms_ip_block_alert_emails (ip, last_sent_at) VALUES ($1, now())
       ON CONFLICT (ip) DO UPDATE SET last_sent_at = now() RETURNING last_sent_at`,
      [ip],
    );
    reserved = updated.rows[0].last_sent_at;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  try {
    await sendEmailStrict(
      to,
      "Tentativë hyrjeje nga IP e bllokuar — FMS",
      `<p>U tentua hyrja në FMS nga IP-ja e bllokuar <strong>${escapeHtml(ip)}</strong>.</p>
       <p>Shfletuesi: ${escapeHtml((userAgent ?? "I panjohur").slice(0, 300))}</p>
       <p>Përdoruesi mund të kërkojë akses, por kodi dërgohet vetëm pas verifikimit të fjalëkalimit.</p>`,
    );
  } catch (error) {
    // Only restore our reservation; a newer send must not be undone.
    if (previous) {
      await pool.query(
        "UPDATE fms_ip_block_alert_emails SET last_sent_at = $2 WHERE ip = $1 AND last_sent_at = $3",
        [ip, previous, reserved],
      );
    } else {
      await pool.query(
        "DELETE FROM fms_ip_block_alert_emails WHERE ip = $1 AND last_sent_at = $2",
        [ip, reserved],
      );
    }
    throw error;
  }
}

// A password-verified user can request at most one code per minute, five per
// 10 minutes per user/IP, and 60 globally per hour. Never return the code to the browser.
export async function requestFmsAccessCode(ip: string, userId: number): Promise<Date> {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) throw new Error("NOTIFY_EMAIL is not configured");
  const id = randomUUID();
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const codeHash = hashCode(id, code);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fms-access-global'))");
    const limits = await client.query<{ recent: number; by_user: number; by_ip: number; global_hour: number }>(
      `SELECT
        (SELECT count(*)::integer FROM fms_ip_access_codes WHERE user_id = $2 AND created_at > now() - interval '1 minute') AS recent,
        (SELECT count(*)::integer FROM fms_ip_access_codes WHERE user_id = $2 AND created_at > now() - interval '10 minutes') AS by_user,
        (SELECT count(*)::integer FROM fms_ip_access_codes WHERE ip = $1 AND created_at > now() - interval '10 minutes') AS by_ip,
        (SELECT count(*)::integer FROM fms_ip_access_codes WHERE created_at > now() - interval '1 hour') AS global_hour`,
      [ip, userId],
    );
    const limitsRow = limits.rows[0];
    if (limitsRow.recent || limitsRow.by_user >= 5 || limitsRow.by_ip >= 5 || limitsRow.global_hour >= 60) {
      await client.query("COMMIT");
      throw new AccessRequestLimited("Shumë kërkesa për kod. Provo përsëri pas pak minutash.");
    }
    // Pending codes have no sent_at and cannot be used.
    await client.query(
      "INSERT INTO fms_ip_access_codes (id, ip, user_id, code_hash) VALUES ($1, $2, $3, $4)",
      [id, ip, userId, codeHash],
    );
    await client.query("COMMIT");
  } catch (error) {
    if (!(error instanceof AccessRequestLimited)) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  try {
    await sendEmailStrict(
      to,
      "Kodi 60-sekondësh për akses nga IP e bllokuar — FMS",
      `<p>Përdoruesi me llogarinë e brendshme kërkoi akses nga IP-ja e bllokuar <strong>${escapeHtml(ip)}</strong>.</p>
       <p>Kodi njëpërdorimësh: <strong style="font-size:22px;letter-spacing:3px">${code}</strong></p>
       <p>Kodi vlen vetëm 60 sekonda pas dërgimit, vetëm për atë llogari dhe atë IP. Jepja vetëm përdoruesit që e njeh.</p>`,
    );
    const updated = await pool.query<{ expires_at: Date }>(
      `UPDATE fms_ip_access_codes SET sent_at = now(), expires_at = now() + interval '1 minute'
       WHERE id = $1 AND sent_at IS NULL RETURNING expires_at`,
      [id],
    );
    if (!updated.rowCount) throw new Error("Access code activation failed");
    return updated.rows[0].expires_at;
  } catch (error) {
    await pool.query("DELETE FROM fms_ip_access_codes WHERE id = $1 AND sent_at IS NULL", [id]).catch(
      cleanupError => logger.error({ err: cleanupError }, "Could not remove unsent FMS access code"),
    );
    throw error;
  }
}

export async function consumeFmsAccessCode(ip: string, userId: number, code: unknown): Promise<boolean> {
  if (typeof code !== "string" || !/^\d{8}$/.test(code)) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const active = await client.query<{ id: string; code_hash: string; failed_attempts: number }>(
      `SELECT id, code_hash, failed_attempts FROM fms_ip_access_codes
       WHERE ip = $1 AND user_id = $2 AND sent_at IS NOT NULL
         AND expires_at > now() AND used_at IS NULL AND failed_attempts < 5
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [ip, userId],
    );
    if (!active.rowCount) { await client.query("COMMIT"); return false; }
    const challenge = active.rows[0];
    const expected = Buffer.from(hashCode(challenge.id, code), "hex");
    const actual = Buffer.from(challenge.code_hash, "hex");
    const valid = actual.length === expected.length && timingSafeEqual(expected, actual);
    if (valid) {
      await client.query("UPDATE fms_ip_access_codes SET used_at = now() WHERE id = $1", [challenge.id]);
    } else {
      await client.query(
        "UPDATE fms_ip_access_codes SET failed_attempts = failed_attempts + 1 WHERE id = $1",
        [challenge.id],
      );
    }
    await client.query("COMMIT");
    return valid;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

setInterval(() => {
  void pool.query("DELETE FROM fms_ip_access_codes WHERE created_at < now() - interval '1 day'")
    .catch(error => logger.error({ err: error }, "FMS access code cleanup failed"));
  void pool.query("DELETE FROM fms_ip_block_alert_emails WHERE last_sent_at < now() - interval '30 days'")
    .catch(error => logger.error({ err: error }, "FMS block alert cleanup failed"));
}, 60 * 60_000).unref();