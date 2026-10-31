import { Router } from "express";
import { manualGooglePriority } from "../lib/rapidLimiter.js";
import {
  createWizzMonitor, deleteWizzMonitor, getWizzMonitor, getWizzRunInfo,
  getWizzMonitorDefaultRule, isWizzRunActive, isWizzRunAllActive, listWizzMonitors,
  runAllWizzPriceMonitors, runWizzPriceMonitor,
  setWizzMonitorDefaultRule, updateWizzMonitor, validateWizzMonitorDefaultRule, validateWizzMonitorInput,
  WizzMonitorDuplicateError,
  getWizzMonitoringEnabled, setWizzMonitoringEnabled,
} from "../lib/wizzPriceMonitor.js";

interface WizzPriceMonitorRouteDependencies {
  getWizzMonitoringEnabled: typeof getWizzMonitoringEnabled;
  setWizzMonitoringEnabled: typeof setWizzMonitoringEnabled;
  createWizzMonitor: typeof createWizzMonitor;
  deleteWizzMonitor: typeof deleteWizzMonitor;
  getWizzMonitor: typeof getWizzMonitor;
  getWizzRunInfo: typeof getWizzRunInfo;
  getWizzMonitorDefaultRule: typeof getWizzMonitorDefaultRule;
  isWizzRunActive: typeof isWizzRunActive;
  isWizzRunAllActive: typeof isWizzRunAllActive;
  listWizzMonitors: typeof listWizzMonitors;
  runAllWizzPriceMonitors: typeof runAllWizzPriceMonitors;
  runWizzPriceMonitor: typeof runWizzPriceMonitor;
  setWizzMonitorDefaultRule: typeof setWizzMonitorDefaultRule;
  updateWizzMonitor: typeof updateWizzMonitor;
}

const defaultDependencies: WizzPriceMonitorRouteDependencies = {
  getWizzMonitoringEnabled,
  setWizzMonitoringEnabled,
  createWizzMonitor,
  deleteWizzMonitor,
  getWizzMonitor,
  getWizzRunInfo,
  getWizzMonitorDefaultRule,
  isWizzRunActive,
  isWizzRunAllActive,
  listWizzMonitors,
  runAllWizzPriceMonitors,
  runWizzPriceMonitor,
  setWizzMonitorDefaultRule,
  updateWizzMonitor,
};

const sessionUserId = (req: any): number => Number(req.session?.userId);
const idOf = (req: any): string => Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

export function buildWizzPriceMonitorRouter(
  dependencies: WizzPriceMonitorRouteDependencies = defaultDependencies,
): Router {
const router = Router();
router.use(manualGooglePriority);

router.get("/", async (_req, res): Promise<void> => {
  res.json({
    monitoringEnabled: await dependencies.getWizzMonitoringEnabled(),
    monitors: await dependencies.listWizzMonitors(),
    running: dependencies.getWizzRunInfo(),
    runAllRunning: dependencies.isWizzRunAllActive(),
    defaultRule: await dependencies.getWizzMonitorDefaultRule(),
  });
});

router.put("/monitoring", async (req, res): Promise<void> => {
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "Aktivizimi duhet të jetë true ose false." });
    return;
  }
  res.json({ monitoringEnabled: await dependencies.setWizzMonitoringEnabled(req.body.enabled) });
});

router.put("/default", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const rule = {
    startDate: body.startDate,
    endDate: body.endDate,
    intervalHours: body.intervalHours,
  };
  const error = validateWizzMonitorDefaultRule(rule);
  if (error) { res.status(400).json({ error }); return; }
  res.json(await dependencies.setWizzMonitorDefaultRule(rule as any));
});

router.post("/", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const input = {
    fromAirport: typeof body.fromAirport === "string" ? body.fromAirport.trim().toUpperCase() : body.fromAirport,
    toAirport: typeof body.toAirport === "string" ? body.toAirport.trim().toUpperCase() : body.toAirport,
    startDate: body.startDate, endDate: body.endDate,
  };
  const error = validateWizzMonitorInput(input);
  if (error) { res.status(400).json({ error }); return; }
  try {
    const result = await dependencies.createWizzMonitor({ ...input as any, name: body.name, createdBy: sessionUserId(req) });
    res.status(result.created ? 201 : 200).json({ ...result.monitor, created: result.created });
  } catch (err) {
    if (err instanceof WizzMonitorDuplicateError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.patch("/:id", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const current = await dependencies.getWizzMonitor(idOf(req));
  if (!current) { res.status(404).json({ error: "Monitori nuk u gjet." }); return; }
  const next = {
    fromAirport: body.fromAirport == null ? current.fromAirport : String(body.fromAirport).trim().toUpperCase(),
    toAirport: body.toAirport == null ? current.toAirport : String(body.toAirport).trim().toUpperCase(),
    startDate: body.startDate ?? current.startDate, endDate: body.endDate ?? current.endDate,
  };
  const error = validateWizzMonitorInput(next);
  if (error) { res.status(400).json({ error }); return; }
  try {
    const updated = await dependencies.updateWizzMonitor(idOf(req), {
      ...next, ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof WizzMonitorDuplicateError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/:id", async (req, res): Promise<void> => {
  if (!(await dependencies.deleteWizzMonitor(idOf(req)))) { res.status(404).json({ error: "Monitori nuk u gjet." }); return; }
  res.json({ ok: true });
});

router.post("/run-all", async (_req, res): Promise<void> => {
  if (!(await dependencies.getWizzMonitoringEnabled())) {
    res.status(409).json({ error: "Monitorimi Wizz është çaktivizuar. Aktivizoje për të nisur kontrollin." });
    return;
  }
  if (dependencies.isWizzRunAllActive()) {
    res.status(409).json({ error: "Kontrolli i gjithë listës është tashmë në proces." });
    return;
  }
  void dependencies.runAllWizzPriceMonitors();
  res.status(202).json({ started: true });
});

router.post("/:id/run", async (req, res): Promise<void> => {
  if (!(await dependencies.getWizzMonitoringEnabled())) {
    res.status(409).json({ error: "Monitorimi Wizz është çaktivizuar. Aktivizoje për të nisur kontrollin." });
    return;
  }
  const id = idOf(req);
  if (!await dependencies.getWizzMonitor(id)) { res.status(404).json({ error: "Monitori nuk u gjet." }); return; }
  if (dependencies.isWizzRunAllActive()) { res.status(409).json({ error: "Kontrolli i gjithë listës është në proces." }); return; }
  if (dependencies.isWizzRunActive(id)) { res.status(409).json({ error: "Ky monitor po kontrollohet tashmë." }); return; }
  void dependencies.runWizzPriceMonitor(id);
  res.status(202).json({ started: true });
});

return router;
}

const router = buildWizzPriceMonitorRouter();
export default router;