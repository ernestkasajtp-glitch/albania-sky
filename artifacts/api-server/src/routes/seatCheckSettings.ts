import { Router, type IRouter } from "express";
import { manualGooglePriority } from "../lib/rapidLimiter.js";
import { getSeatCheckConfig, saveSeatCheckConfig, runSeatAvailabilityCheck } from "../lib/seatCheck.js";

const router: IRouter = Router();
router.use(manualGooglePriority);

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm admin" });
    return;
  }
  next();
}

router.get("/settings/seat-check", requireAdmin, async (_req, res): Promise<void> => {
  const cfg = await getSeatCheckConfig();
  res.json(cfg);
});

router.put("/settings/seat-check", requireAdmin, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const days = parseInt(b.days, 10);
  const minSeats = parseInt(b.minSeats, 10);
  const intervalHours = parseFloat(b.intervalHours);
  const flaggedIntervalMinutes = b.flaggedIntervalMinutes === undefined ? undefined : Number(b.flaggedIntervalMinutes);
  if (flaggedIntervalMinutes !== undefined && (!Number.isSafeInteger(flaggedIntervalMinutes) || flaggedIntervalMinutes < 1)) {
    res.status(400).json({ error: "Intervali për pak vende duhet të jetë numër i plotë, të paktën 1 minutë." });
    return;
  }

  await saveSeatCheckConfig({
    enabled: b.enabled === true || b.enabled === "true",
    days: Number.isFinite(days) && days > 0 ? days : undefined,
    minSeats: Number.isFinite(minSeats) && minSeats > 0 ? minSeats : undefined,
    intervalHours: Number.isFinite(intervalHours) && intervalHours > 0 ? intervalHours : undefined,
    flaggedIntervalMinutes,
    autoSoldOut: b.autoSoldOut === true || b.autoSoldOut === "true",
    refreshPrices: b.refreshPrices === true || b.refreshPrices === "true",
    soldOutTask: b.soldOutTask === true || b.soldOutTask === "true",
  });

  const cfg = await getSeatCheckConfig();
  res.json(cfg);
});

router.post("/settings/seat-check/run", requireAdmin, async (_req, res): Promise<void> => {
  const result = await runSeatAvailabilityCheck(true);
  res.json(result);
});

export { router as seatCheckSettingsRouter };
