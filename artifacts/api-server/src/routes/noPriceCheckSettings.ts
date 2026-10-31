import { Router, type IRouter } from "express";
import { manualGooglePriority } from "../lib/rapidLimiter.js";
import { getNoPriceCheckConfig, saveNoPriceCheckConfig, runNoPriceCheckNow } from "./flights.js";

// Access control (admin OR the can_use_google_price_tools permission) is enforced
// at mount time in routes/index.ts via requirePermission("can_use_google_price_tools").
const router: IRouter = Router();
router.use(manualGooglePriority);

router.get("/settings/no-price-check", async (_req, res): Promise<void> => {
  const cfg = await getNoPriceCheckConfig();
  res.json(cfg);
});

router.put("/settings/no-price-check", async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const intervalMinutes = parseFloat(b.intervalMinutes);
  const enabled =
    b.enabled === undefined
      ? undefined
      : b.enabled === true || b.enabled === "true";

  await saveNoPriceCheckConfig({
    enabled,
    intervalMinutes: Number.isFinite(intervalMinutes) && intervalMinutes >= 1 ? intervalMinutes : undefined,
  });

  const cfg = await getNoPriceCheckConfig();
  res.json(cfg);
});

router.post("/settings/no-price-check/run", async (_req, res): Promise<void> => {
  const result = await runNoPriceCheckNow();
  res.json(result);
});

export { router as noPriceCheckSettingsRouter };
