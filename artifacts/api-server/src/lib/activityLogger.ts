import type { Request, Response, NextFunction } from "express";
import { db, agentActivityTable } from "@workspace/db";
import { getIp } from "./rateLimit.js";
import { activityPath } from "./agentActivityEvent.js";
import { activityApiDescription, activityResponse } from "./activityDescription.js";

// Paths we never log (noise / polling / the tracker itself).
const SKIP_EXACT = new Set<string>([
  "/healthz",
  "/auth/me",
  "/public/me",
  "/public/track-visit",
  "/branding",
  "/public/social-proof",
]);

// Build a short human-readable Albanian description from method + path + query.
function describe(method: string, path: string, query: Record<string, unknown>): string {
  const p = path.replace(/^\/public/, "").replace(/^\/+/, "/");
  const m = method.toUpperCase();
  const verb =
    m === "POST" ? "Krijoi" :
    m === "PUT" || m === "PATCH" ? "Ndryshoi" :
    m === "DELETE" ? "Fshiu" :
    "Hapi";

  // Readable route from search query params (from/to/date), e.g. "TIA → FCO · 2026-07-10".
  const routeStr = (): string => {
    const from = typeof query.from === "string" ? query.from.trim().toUpperCase() : "";
    const to = typeof query.to === "string" ? query.to.trim().toUpperCase() : "";
    const date = typeof query.date === "string" ? query.date.trim() : "";
    const parts: string[] = [];
    if (from || to) parts.push(`${from || "?"} → ${to || "?"}`);
    if (date) parts.push(date);
    return parts.join(" · ");
  };

  if (/^\/flights\/search/.test(p)) {
    const r = routeStr();
    return r ? `Kërkoi fluturime: ${r}` : "Kërkoi fluturime";
  }
  if (/^\/flights\/\d+/.test(p)) return "Shikoi një fluturim";
  if (/^\/flights/.test(p)) {
    const r = routeStr();
    return r ? `Kërkoi fluturime: ${r}` : "Shikoi fluturimet";
  }
  // Calendar/date lookup is the first step of a route search (carries from/to).
  if (/^\/flight-dates/.test(p)) {
    const r = routeStr();
    return r ? `Kërkoi fluturime: ${r}` : "Shikoi datat e fluturimeve";
  }
  if (/^\/bookings\/[^/]+\/pdf/.test(p)) return "Shkarkoi PDF rezervimi";
  if (/^\/bookings/.test(p) || /^\/my-bookings/.test(p)) {
    if (m === "POST") return "Krijoi një rezervim";
    if (m === "PATCH" || m === "PUT") return "Ndryshoi një rezervim";
    if (m === "DELETE") return "Anuloi një rezervim";
    return "Shikoi rezervimet";
  }
  if (/^\/payments/.test(p)) return m === "POST" ? "Shtoi një pagesë" : "Shikoi pagesat";
  if (/^\/group-tickets/.test(p)) return "Shikoi biletat grupore";
  if (/^\/destinations/.test(p)) return "Shikoi destinacionet";
  if (/^\/auth\/logout/.test(p)) return "Doli nga sistemi";
  return `${verb}: ${m} ${p}`;
}

// Logs every authenticated AGENT API request (fire-and-forget). An agent is
// identified by req.session.agentId, set at booking-engine login. Admin / FMS
// staff sessions have no agentId, so nothing is logged for them.
export function activityLogger(req: Request, res: Response, next: NextFunction): void {
  let responseDetail = "";
  if (req.session?.agentId && (req.path === "/public/flights" || req.path === "/public/bookings" || /\/pok-initiate$/.test(req.path))) {
    const originalJson = res.json;
    res.json = function(body: any) {
      responseDetail = activityResponse(req.path, body);
      return originalJson.call(this, body);
    };
  }
  res.on("finish", () => {
    const agentId = req.session?.agentId;
    if (!agentId) return;
    const path = req.path;
    if (req.method === "OPTIONS") return;
    if (SKIP_EXACT.has(path)) return;
    const ua = (req.headers["user-agent"] as string | undefined)?.slice(0, 400) ?? null;
    // Preserve the query string (from/to/date etc.) so the agent records show
    // which flight/route was searched, not just the bare path.
    const qIdx = req.originalUrl.indexOf("?");
    const qs = qIdx >= 0 ? req.originalUrl.slice(qIdx) : "";
    db.insert(agentActivityTable).values({
      agentId,
      userId: req.session?.userId ?? null,
      type: "api",
      method: req.method,
      path: activityPath(path + qs),
      description: activityApiDescription(req.method, path + qs, res.statusCode, responseDetail),
      ip: getIp(req as any),
      userAgent: ua,
      statusCode: res.statusCode,
    }).catch(() => {});
  });
  next();
}
