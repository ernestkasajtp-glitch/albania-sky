import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import flightsRouter from "./flights";
import discountCampaignsRouter from "./discountCampaigns";
import bannerConfigsRouter from "./bannerConfigs";
import { flightDiscoveryRouter } from "./flightDiscovery";
import bookingsRouter from "./bookings";
import { bookingSaveRouter } from "./bookingSave";
import { bookingColumnPreferencesRouter } from "./bookingColumnPreferences";
import passengersRouter from "./passengers";
import paymentsRouter from "./payments";
import paymentMethodsRouter from "./paymentMethods";
import agentsRouter from "./agents";
import dashboardRouter from "./dashboard";
import reportsRouter, { excelDownloadRouter } from "./reports";
import authRouter from "./auth";
import adminRouter from "./admin";
import publicRouter from "./public";
import { chatbotRouter } from "./chatbot";
import permissionsRouter, { getEffectivePermissions } from "./permissions";
import priceRequestsRouter from "./priceRequests";
import brandingRouter from "./branding";
import groupTicketsRouter from "./groupTickets";
import airportAlternativesRouter from "./airportAlternatives";
import { webhookRouter } from "./webhook";
import { webhookSettingsRouter } from "./webhookSettings";
import { seatCheckSettingsRouter } from "./seatCheckSettings";
import { noPriceCheckSettingsRouter } from "./noPriceCheckSettings";
import { stalePriceCheckSettingsRouter } from "./stalePriceCheckSettings";
import { newPriceCheckSettingsRouter } from "./newPriceCheckSettings";
import { priceReportEmailSettingsRouter } from "./priceReportEmailSettings";
import { agentRoundingSettingsRouter } from "./agentRoundingSettings";
import { guestMarkupSettingsRouter } from "./guestMarkupSettings";
import { guestFlightAccessRouter } from "./guestFlightAccess";
import { publicEnrollmentsRouter } from "./publicEnrollments";
import { externalApiRouter } from "./externalApi";
import { externalApiSettingsRouter } from "./externalApiSettings";
import { cancelPasswordRouter } from "./cancelPassword";
import { publicDestRouter, adminDestRouter } from "./destinations";
import cpExportRouter from "./cpExport";
import cpImportAlertsRouter from "./cpImportAlerts";
import scheduleChangesRouter from "./scheduleChanges";
import bookingEngineSettingsRouter from "./bookingEngineSettings";
import tasksRouter from "./tasks";
import claimsRouter from "./claims";
import teamChatRouter from "./teamChat";
import adminEmailRouter from "./adminEmail";
import priceRulesRouter from "./priceRules";
import googlePriceRulesRouter from "./googlePriceRules";
import { socialProofSettingsRouter } from "./socialProofSettings";
import pokAccountsSettingsRouter from "./pokAccountsSettings";
import pokReconciliationRouter from "./pokReconciliation";
import { addLiveClient, notifyDataChanged } from "../lib/liveEvents";
import { pool } from "@workspace/db";
import { trackFmsSession, trustedFmsIp } from "../lib/fmsIpAccess";
import { fmsIpAccessRouter } from "./fmsIpAccess";
import { atlasSeatAlertsRouter } from "./atlasSeatAlerts";
import wizzPriceMonitorRouter from "./wizzPriceMonitor";
import assistantRouter from "./assistant";
import { kyteSearchRouter } from "./kyteSearch";
import { kyteSandboxBookingsRouter } from "./kyteSandboxBookings";
import { moduleControlsRouter, guardModuleApi } from "./moduleControls";
import { publicPageLayoutsRouter, pageLayoutSettingsRouter } from "./pageLayouts";

const router: IRouter = Router();

// Require an active FMS session
function requireFmsAuth(req: Request, res: Response, next: NextFunction): void {
  const role = (req as any).session?.role;
  const source = (req as any).session?.source;
  const fmsRoles = ["admin", "manager", "agent_staff"];
  if (!role || !fmsRoles.includes(role) || source === "be") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Require admin or manager role
function requireManagerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req as any).session?.role;
  if (role !== "admin" && role !== "manager") {
    res.status(403).json({ error: "Forbidden: admin or manager only" });
    return;
  }
  next();
}

// Require admin role
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req as any).session?.role;
  if (role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin only" });
    return;
  }
  next();
}

// Allow admin/manager always, or any FMS user holding a specific permission.
// Lets agent_staff use a page once granted `permKey` from the permissions panel.
function requireManagerOrPermission(permKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = (req as any).session;
    const role = session?.role;
    const userId = session?.userId;
    if (role === "admin" || role === "manager") { next(); return; }
    if (!userId || !role) { res.status(403).json({ error: "Forbidden" }); return; }
    try {
      const perms = await getEffectivePermissions(role, userId);
      if (perms[permKey]) { next(); return; }
    } catch (err) {
      req.log?.error({ err }, "permission check failed");
    }
    res.status(403).json({ error: "Forbidden" });
  };
}

// Enforce a granular permission for ALL non-admin FMS roles (manager + agent_staff).
// Admin always passes. Unlike requireManagerOrPermission, this does NOT short-circuit
// managers — so removing `permKey` from a manager actually blocks them server-side.
function requirePermission(permKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = (req as any).session;
    const role = session?.role;
    const userId = session?.userId;
    if (role === "admin") { next(); return; }
    const fmsRoles = ["manager", "agent_staff"];
    if (!userId || !role || !fmsRoles.includes(role)) { res.status(403).json({ error: "Forbidden" }); return; }
    try {
      const perms = await getEffectivePermissions(role, userId);
      if (perms[permKey]) { next(); return; }
    } catch (err) {
      req.log?.error({ err }, "permission check failed");
    }
    res.status(403).json({ error: "Forbidden" });
  };
}

// Mount `sub` behind `guards`, but run the guards ONLY for requests that `sub`
// has an endpoint for (same path + method). A bare `router.use(guard, sub)`
// runs the guard for EVERY request that reaches that line, so a role check in
// front of one router silently blocked all routers mounted after it — e.g.
// requireAdmin before the Atlas router answered 403 to managers on /payments,
// /agents, /permissions/my, /group-tickets and more.
function hasEndpoint(sub: any, req: Request): boolean {
  return (sub.stack ?? []).some((layer: any) =>
    layer.route && layer.match(req.path) && layer.route._handlesMethod(req.method));
}
function scoped(sub: IRouter, ...guards: Array<(req: Request, res: Response, next: NextFunction) => unknown>): IRouter {
  const chain: IRouter = Router();
  chain.use((req: Request, _res: Response, next: NextFunction) => {
    if (hasEndpoint(sub, req)) next(); else next("router");
  });
  chain.use(...(guards as any[]), sub);
  return chain;
}

// Çdo mutacion i suksesshëm (jo-GET) në rezervime/pagesa/pasagjerë → njoftim
// live. Regjistrohet PËRPARA routerave që të kapë edhe rrugët publike
// (booking i ri nga booking-engine) — API i partnerit /v1/* është read-only.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300 && /^\/agents(?:\/|$)/.test(req.path)) {
        notifyDataChanged("agents");
      }
      if (res.statusCode >= 200 && res.statusCode < 300 &&
          /^\/(bookings|payments|passengers|public\/bookings|group-tickets)/.test(req.path)) {
        notifyDataChanged("bookings");
        // Rezervim I RI (krijim, jo editim) → njoftim me zile në panelin admin.
        if (req.method === "POST" &&
            (req.path === "/bookings" || req.path === "/public/bookings" || req.path === "/group-tickets")) {
          notifyDataChanged("booking_new");
        }
      }
    });
  }
  next();
});

// ── Always public ─────────────────────────────────────────────────────────────
router.use(healthRouter);          // GET /healthz
router.use(authRouter);            // POST /auth/register, POST /auth/login
router.use(adminRouter);           // POST /admin/setup, POST /admin/login, GET /admin/has-admin
router.use(publicRouter);          // GET /public/flights, POST /public/bookings
router.use(chatbotRouter);         // Separate read-only NESTI chatbot; does not alter partner /v1 routes.
router.use(brandingRouter);        // GET /branding
router.use(webhookRouter);         // POST /webhook/booking — secured with X-Webhook-Secret header
router.use(externalApiRouter);     // GET /v1/flights — partner pull, secured with X-API-Key header
router.use(publicDestRouter);       // GET /destinations (public)
router.use(publicPageLayoutsRouter); // GET /page-layouts (read-only layout metadata)

// FMS module management is always reachable, including while every optional
// module is disabled. Public routes above bypass the FMS-only module guard.
router.use(requireFmsAuth, moduleControlsRouter);
// Per-page layout settings are core config (like modules): reachable even if optional modules are off.
router.use("/settings/page-layouts", requireFmsAuth, requireAdmin);
router.use(pageLayoutSettingsRouter);
router.use(requireFmsAuth, guardModuleApi);

// ── Kanal live (SSE) — njofton panelin sapo ndryshon një rezervim ────────────
router.get("/live/events", requireFmsAuth, (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(": connected\n\n");
  req.socket.setTimeout(0);
  addLiveClient(res, trustedFmsIp(req));
  const checkPresence = async () => {
    try {
      const [denied, session] = await Promise.all([
        pool.query("SELECT access_generation FROM fms_ip_blocks WHERE ip = $1 LIMIT 1", [trustedFmsIp(req)]),
        pool.query("SELECT sess FROM sessions WHERE sid = $1 AND expired_at > now() LIMIT 1", [req.sessionID]),
      ]);
      const stored = session.rows[0]?.sess;
      const data = typeof stored === "string" ? JSON.parse(stored) : stored;
      const verified = data?.source === "fms" && data?.fmsIpVerified === trustedFmsIp(req) &&
        data?.fmsIpVerifiedGeneration === denied.rows[0]?.access_generation;
      if (!session.rowCount || (denied.rowCount && !verified)) { res.end(); return; }
      trackFmsSession(req);
    } catch {
      res.end();
    }
  };
  void checkPresence();
  const presenceTimer = setInterval(() => { void checkPresence(); }, 60_000);
  res.on("close", () => clearInterval(presenceTimer));
});

// ── FMS-authenticated routes (admin / manager / agent_staff) ─────────────────
router.use(requireFmsAuth, dashboardRouter);
router.use(requireFmsAuth, flightsRouter);
router.use(requireFmsAuth, discountCampaignsRouter);
router.use(requireFmsAuth, bannerConfigsRouter);
router.use(requireFmsAuth, bookingSaveRouter);
router.use(requireFmsAuth, bookingsRouter);
router.use(requireFmsAuth, bookingColumnPreferencesRouter);
router.use(requireFmsAuth, passengersRouter);
router.use(requireFmsAuth, priceRequestsRouter);
router.use(requireFmsAuth, tasksRouter);
router.use(requireFmsAuth, claimsRouter);
router.use(scoped(atlasSeatAlertsRouter, requireAdmin));
router.use(scoped(teamChatRouter, requireManagerOrAdmin));
// Permissions router handles its own role checks internally
router.use(requireFmsAuth, permissionsRouter);

// ── Excel download: all authenticated FMS users (agent_staff too) ─────────────
router.use(requireFmsAuth, excelDownloadRouter);

// ── Admin + Manager only ──────────────────────────────────────────────────────
router.use(scoped(paymentsRouter, requireManagerOrAdmin));
router.use(scoped(paymentMethodsRouter, requireManagerOrAdmin));
router.use(scoped(agentsRouter, requireManagerOrAdmin));
router.use(scoped(priceRulesRouter, requireManagerOrAdmin));
router.use(scoped(reportsRouter, requirePermission("can_access_reports")));
router.use(scoped(assistantRouter, requirePermission("can_access_reports")));
router.use(scoped(groupTicketsRouter, requireManagerOrAdmin));
router.use(scoped(airportAlternativesRouter, requireManagerOrAdmin));
router.use(scoped(adminDestRouter, requireManagerOrPermission("can_access_destinations")));
router.use(scoped(cpExportRouter, requireManagerOrAdmin));

// ── Admin only ────────────────────────────────────────────────────────────────
router.use(scoped(fmsIpAccessRouter, requireFmsAuth, requireAdmin)); // /settings/ip-access/*
  router.use(kyteSearchRouter);  // /kyte/search (sandbox; guarded inside router)
  router.use(scoped(kyteSandboxBookingsRouter, requireFmsAuth, requireAdmin)); // Kyte Sandbox bookings; guarded again inside router
router.use(requireFmsAuth, cancelPasswordRouter);       // GET/POST /cancel-password/* + admin /settings/cancel-password
router.use(scoped(adminEmailRouter, requireAdmin));             // /admin-email/* — inbox i brendshëm (vetëm admin)
router.use(scoped(webhookSettingsRouter, requireAdmin));        // GET/POST /settings/webhook
router.use(scoped(seatCheckSettingsRouter, requireAdmin));      // GET/PUT /settings/seat-check + POST run
router.use(scoped(noPriceCheckSettingsRouter, requirePermission("can_use_google_price_tools")));   // GET/PUT /settings/no-price-check + POST run (admin or granted)
router.use(scoped(stalePriceCheckSettingsRouter, requirePermission("can_use_google_price_tools"))); // GET/PUT /settings/stale-price-check + POST run
router.use(scoped(newPriceCheckSettingsRouter, requirePermission("can_use_google_price_tools")));  // GET/PUT /settings/new-price-check + POST run (admin or granted)
router.use(scoped(priceReportEmailSettingsRouter, requireAdmin)); // GET/PUT /settings/price-report-email (admin only)
router.use(scoped(agentRoundingSettingsRouter, requireAdmin));  // GET/PUT /settings/agent-rounding
router.use(scoped(guestMarkupSettingsRouter, requireAdmin));    // GET/PUT /settings/guest-markup
router.use(scoped(guestFlightAccessRouter, requireAdmin));
router.use(scoped(externalApiSettingsRouter, requireAdmin));    // GET/POST/DELETE /settings/external-api
router.use(scoped(bookingEngineSettingsRouter, requireAdmin));  // GET/PATCH /booking-engine/...
router.use(scoped(publicEnrollmentsRouter, requireAdmin));
router.use(scoped(googlePriceRulesRouter, requireAdmin));       // CRUD /google-price-rules (changes REAL sale prices)
router.use(scoped(socialProofSettingsRouter, requireAdmin));   // GET/PUT /settings/social-proof (booking-engine badge toggle)
router.use(scoped(pokAccountsSettingsRouter, requireAdmin));   // CRUD/activate/disable /settings/pok-accounts
router.use(scoped(pokReconciliationRouter, requireAdmin));     // reconciliation for unknown POK intents
router.use(scoped(cpImportAlertsRouter, requireAdmin));        // GET/POST /cp-import-alerts (CitizenPlane import-failure notifications)
router.use("/wizz-price-monitors", requireAdmin, wizzPriceMonitorRouter); // Wizz Air route price monitor
router.use(scoped(scheduleChangesRouter, requireManagerOrAdmin)); // GET/POST /schedule-changes (flights with schedule changes — notify recipients)
router.use("/flight-discovery", flightDiscoveryRouter); // standalone admin-only Google direct-flight discovery

export default router;
