import { Router, type IRouter } from "express";
import { manualGooglePriority } from "../lib/rapidLimiter.js";
import {
  getStalePriceCheckConfig,
  runStalePriceCheckNow,
  saveStalePriceCheckConfig,
  stalePriceRunProgress,
} from "./flights.js";

const router: IRouter = Router();
router.use(manualGooglePriority);

router.get("/settings/stale-price-check", async (_req, res): Promise<void> => {
  res.json(await getStalePriceCheckConfig());
});

router.put("/settings/stale-price-check", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const intervalMinutes = parseFloat(body.intervalMinutes);
  const enabled = body.enabled === undefined
    ? undefined
    : body.enabled === true || body.enabled === "true";

  await saveStalePriceCheckConfig({
    enabled,
    intervalMinutes: Number.isFinite(intervalMinutes) && intervalMinutes >= 1 ? intervalMinutes : undefined,
  });
  res.json(await getStalePriceCheckConfig());
});

router.post("/settings/stale-price-check/run", async (_req, res): Promise<void> => {
  res.json(await runStalePriceCheckNow());
});

router.get("/settings/stale-price-check/progress", async (_req, res): Promise<void> => {
  res.json(stalePriceRunProgress);
});

export { router as stalePriceCheckSettingsRouter };