import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { db, pool, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { trackFmsSid, trustedFmsIpFromPeer } from "./fmsIpAccess";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// express-session signed cookie format: "s:<sid>.<sig>"
function extractSid(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("s:")) {
    const dot = raw.lastIndexOf(".");
    return dot > 2 ? raw.slice(2, dot) : null;
  }
  return raw;
}

async function authenticate(req: IncomingMessage): Promise<{
  userId: number; role: string; sid: string; verifiedIp: string | null; verifiedGeneration: string | null;
} | null> {
  let cookies: Record<string, string>;
  try { cookies = parseCookies(req.headers.cookie); } catch { return null; }
  const sid = extractSid(cookies["fms_sid"]);
  if (!sid) return null;
  try {
    const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
    if (!row || row.expiredAt < new Date()) return null;
    const sess = JSON.parse(row.sess);
    const role = sess?.role;
    const userId = sess?.userId;
    const source = sess?.source;
    const fmsRoles = ["admin", "manager", "agent_staff"];
    if (!userId || !role || !fmsRoles.includes(role) || source === "be") return null;
    return {
      userId, role, sid,
      verifiedIp: source === "fms" ? sess?.fmsIpVerified ?? null : null,
      verifiedGeneration: source === "fms" ? sess?.fmsIpVerifiedGeneration ?? null : null,
    };
  } catch {
    return null;
  }
}

export function attachTeamChatWs(server: HttpServer): void {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    if (!url.startsWith("/api/team-chat/ws")) return;

    const ip = trustedFmsIpFromPeer(req.socket.remoteAddress, req.headers["x-forwarded-for"]);
    authenticate(req).then(async auth => {
      if (!auth) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const blocked = await pool.query("SELECT access_generation FROM fms_ip_blocks WHERE ip = $1 LIMIT 1", [ip]);
      if (blocked.rowCount && (auth.verifiedIp !== ip ||
          auth.verifiedGeneration !== blocked.rows[0].access_generation)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      wss!.handleUpgrade(req, socket, head, (ws) => {
        (ws as any).userId = auth.userId;
        (ws as any).role = auth.role;
        (ws as any).fmsIp = ip;
        clients.add(ws);
        trackFmsSid(auth.sid, auth.userId, ip);
        const checkPresence = async () => {
          try {
            const [session, denied] = await Promise.all([
              db.select({ expiredAt: sessionsTable.expiredAt, sess: sessionsTable.sess }).from(sessionsTable).where(eq(sessionsTable.sid, auth.sid)),
              pool.query("SELECT access_generation FROM fms_ip_blocks WHERE ip = $1 LIMIT 1", [ip]),
            ]);
            const stored = session.length ? JSON.parse(session[0].sess) : null;
            if (!session.length || session[0].expiredAt < new Date() ||
                (denied.rowCount && (stored?.source !== "fms" || stored?.fmsIpVerified !== ip ||
                  stored?.fmsIpVerifiedGeneration !== denied.rows[0].access_generation))) {
              ws.terminate();
              return;
            }
            trackFmsSid(auth.sid, auth.userId, ip);
          } catch (error) {
            logger.error({ err: error }, "team-chat WS presence check failed");
            ws.close(1011, "Session unavailable");
          }
        };
        void checkPresence();
        const presenceTimer = setInterval(() => { void checkPresence(); }, 60_000);
        ws.on("close", () => { clients.delete(ws); clearInterval(presenceTimer); });
        ws.on("error", () => { clients.delete(ws); clearInterval(presenceTimer); });
        try { ws.send(JSON.stringify({ type: "hello", data: { online: clients.size } })); } catch {}
        broadcastPresence();
      });
    }).catch(err => {
      logger.warn({ err }, "team-chat ws auth failed");
      try { socket.destroy(); } catch {}
    });
  });

  logger.info("team-chat WS attached on /api/team-chat/ws");
}

export function closeTeamChatByIp(ip: string): void {
  for (const ws of clients) {
    if ((ws as any).fmsIp === ip) ws.terminate();
  }
}

function broadcastPresence() {
  broadcastTeamChat({ type: "presence", data: { online: clients.size } });
}

export function broadcastTeamChat(payload: any): void {
  const msg = JSON.stringify(payload);
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch {}
    }
  }
}
