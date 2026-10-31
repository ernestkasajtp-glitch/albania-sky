import { Router, type IRouter } from "express";
import { manualGooglePriority } from "../lib/rapidLimiter.js";
import { getNewPriceCheckConfig, saveNewPriceCheckConfig, runNewPriceCheckNow, runNewPriceCheckForIds, newPriceRunProgress, automaticNewPriceProgress } from "./flights.js";

// "Çmim i Ri" candidate fetch interval settings. Access control (admin OR the
// can_use_google_price_tools permission) is enforced at mount time in
// routes/index.ts via requirePermission("can_use_google_price_tools").
const router: IRouter = Router();
router.use(manualGooglePriority);

router.get("/settings/new-price-check", async (_req, res): Promise<void> => {
  const cfg = await getNewPriceCheckConfig();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ...cfg, automaticProgress: automaticNewPriceProgress.snapshot() });
});

router.put("/settings/new-price-check", async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const intervalMinutes = parseFloat(b.intervalMinutes);
  const enabled =
    b.enabled === undefined
      ? undefined
      : b.enabled === true || b.enabled === "true";

  await saveNewPriceCheckConfig({
    enabled,
    intervalMinutes: Number.isFinite(intervalMinutes) && intervalMinutes >= 1 ? intervalMinutes : undefined,
  });

  const cfg = await getNewPriceCheckConfig();
  res.json(cfg);
});

router.post("/settings/new-price-check/run", async (_req, res): Promise<void> => {
  const result = await runNewPriceCheckNow();
  res.json(result);
});

// Refresh candidates for a specific set of flight IDs (the selected rows on the
// "Çmim i Ri" tab). DISPLAY-ONLY: never promotes/recomputes the sale price.
router.post("/settings/new-price-check/run-selected", async (req, res): Promise<void> => {
  const rawIds = Array.isArray(req.body?.flightIds) ? req.body.flightIds : [];
  const flightIds = Array.from(new Set(
    rawIds.map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0),
  )) as number[];
  if (!flightIds.length) { res.status(400).json({ error: "Asnjë fluturim i zgjedhur" }); return; }
  const result = await runNewPriceCheckForIds(flightIds);
  res.json(result);
});

// Progresi i rifreskimit manual "Çmim i Ri" (running/total/done/refreshed).
// Frontend-i e ndjek me polling derisa running=false — puna kryhet në sfond.
router.get("/settings/new-price-check/progress", async (_req, res): Promise<void> => {
  res.json(newPriceRunProgress);
});

export { router as newPriceCheckSettingsRouter };
