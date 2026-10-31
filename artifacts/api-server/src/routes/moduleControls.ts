import { Router, type Request, type Response, type NextFunction } from "express";
import {
  getModuleState, isModuleEnabled, moduleCatalogue, moduleEnvelope, setModuleEnabled,
  type ModuleId,
} from "../lib/moduleControls";
import { notifyDataChanged } from "../lib/liveEvents";

export const moduleControlsRouter = Router();

moduleControlsRouter.get("/modules", async (_req, res): Promise<void> => {
  try {
    res.json(moduleEnvelope(await getModuleState()));
  } catch (err) {
    console.error("Could not read module settings", err);
    res.status(503).json({ error: "Module settings unavailable" });
  }
});

moduleControlsRouter.patch("/modules/:id", async (req, res): Promise<void> => {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Forbidden: admin only" });
    return;
  }
  if (!Number.isSafeInteger(req.session.userId) || !req.session.userId || req.session.userId <= 0) {
    res.status(401).json({ error: "Identiteti i administratorit nuk u verifikua." });
    return;
  }
  const entry = moduleCatalogue.find(module => module.id === req.params.id);
  if (!entry) {
    res.status(404).json({ error: "Unknown module" });
    return;
  }
  if ("locked" in entry) {
    res.status(409).json({ error: entry.reason });
    return;
  }
  if (!req.body || typeof req.body.enabled !== "boolean" || Object.keys(req.body).some(key => key !== "enabled")) {
    res.status(400).json({ error: "Expected { enabled: boolean }" });
    return;
  }
  try {
    const state = await setModuleEnabled(entry.id as ModuleId, req.body.enabled, req.session.userId);
    notifyDataChanged("modules");
    res.json(moduleEnvelope(state));
  } catch (err) {
    console.error("Could not update module settings", err);
    res.status(503).json({ error: "Module settings unavailable" });
  }
});

// Only protect dedicated FMS API endpoints. Shared booking/flight/agency lookups
// remain available to other modules, the Booking Engine and partner /v1 API.
export function moduleForApiPath(path: string, method: string): ModuleId | undefined {
  // Express routing is case-insensitive by default. Apply identical matching
  // here so a mixed-case request cannot evade the module guard.
  path = path.toLowerCase();
  method = method.toUpperCase();
  if (/^\/flight-discovery(?:\/|$)/.test(path)) return "flightDiscovery";
  // Discovery launched from the flight list uses a separate long-running job
  // alias. Flight-type/extend inventory tools are shared core operations.
  if (/^\/flights\/google-search(?:\/|$)/.test(path)) return "flightDiscovery";
  if (/^\/wizz-price-monitors(?:\/|$)/.test(path)) return "wizzMonitor";
  if (/^\/kyte(?:\/|$)/.test(path)) return "kyte";
  if (/^\/atlas-seat-alerts(?:\/|$)/.test(path)) return "atlasAlerts";
  if (/^\/admin-email(?:\/|$)/.test(path)) return "adminEmail";
  if (/^\/(?:citizenplane\/export|settings\/citizen-pricing)(?:\/|$)/.test(path) ||
      /^\/flights\/[^/]+\/citizen-price$/.test(path)) return "offlineFlights";
  if (/^\/flights\/schedule-check(?:-email)?$/.test(path) ||
      /^\/flights\/[^/]+\/sync-schedule$/.test(path)) return "scheduleCheck";
  if (/^\/schedule-changes(?:\/|$)/.test(path)) return "scheduleChanges";
  if (/^\/(?:google-price-rules|settings\/(?:google-price-ttl|no-price-check|stale-price-check|new-price-check|price-report-email))(?:\/|$)/.test(path) ||
      /^\/flights\/(?:google-price(?:s-bulk|\/apply-bulk|\/refresh)?|new-prices-bulk|sync-google-prices|check-google-(?:progress|selected))$/.test(path) ||
      /^\/flights\/[^/]+\/google-price(?:\/live|\/apply)?$/.test(path)) return "googlePrices";
  if (/^\/(?:reports|assistant)(?:\/|$)/.test(path) || path === "/flights/report-data") return "reports";
  if (/^\/(?:tasks|task-labels|tasks-meta|tasks-notifications|tasks-stats)(?:\/|$)/.test(path)) return "tasks";
  if (/^\/claims(?:\/|$)/.test(path)) return "claim";
  if (/^\/flights\/(?:alert-count|closing-soon|seat-alerts|soldout-recent)$/.test(path) ||
      /^\/bookings\/[^/]+\/email-alerts(?:\/read)?$/.test(path)) return "notifications";
  // GET /agents is also a shared selector on booking/payment screens.
  if (/^\/agents(?:\/|$)/.test(path) &&
      (method !== "GET" || /^\/agents\/[^/]+(?:\/|$)/.test(path))) return "agents";
  // Financial endpoints belong to the locked payments module: bookings and
  // agents depend on their invoices, payment history and settlement flows.
  if (/^\/payments(?:\/|$)/.test(path)) return "payments";
  if (/^\/group-tickets(?:\/|$)/.test(path)) return "groupTickets";
  if (/^\/price-requests(?:\/|$)/.test(path)) return "priceRequests";
  if (/^\/cp-import-alerts(?:\/|$)/.test(path)) return "importAlerts";
  // /destinations supplies the public Booking Engine; only the FMS admin
  // management endpoints are private to the destinations module.
  if (/^\/admin\/destinations(?:\/|$)/.test(path)) return "destinations";
  return undefined;
}

export function createModuleGuard(checkEnabled: (id: string) => Promise<boolean> = isModuleEnabled) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = moduleForApiPath(req.path, req.method);
    if (!id) {
      next();
      return;
    }
    try {
      if (await checkEnabled(id)) {
        next();
        return;
      }
    } catch (err) {
      console.error("Module guard failed; denying access", err);
      res.status(503).json({ error: "Module settings unavailable", module: id });
      return;
    }
    res.status(403).json({ error: "Module disabled", module: id });
  };
}

export const guardModuleApi = createModuleGuard();