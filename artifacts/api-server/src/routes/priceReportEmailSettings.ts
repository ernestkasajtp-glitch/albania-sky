import { Router, type IRouter } from "express";
import { getPriceReportEmailConfig, savePriceReportEmailConfig, type PriceReportEmailMode } from "./flights.js";

// Access control (admin only) is enforced at mount time in routes/index.ts.
// Controls the "Raport Ndryshimi Çmimesh" email mode (see flights.ts helpers).
const router: IRouter = Router();

const VALID_MODES: PriceReportEmailMode[] = ["always", "daily_manual", "threshold", "off"];

router.get("/settings/price-report-email", async (_req, res): Promise<void> => {
  const cfg = await getPriceReportEmailConfig();
  res.json(cfg);
});

router.put("/settings/price-report-email", async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const mode = VALID_MODES.includes(b.mode) ? (b.mode as PriceReportEmailMode) : undefined;
  const threshold = parseInt(b.threshold, 10);
  await savePriceReportEmailConfig({
    mode,
    threshold: Number.isFinite(threshold) && threshold >= 1 ? threshold : undefined,
  });
  const cfg = await getPriceReportEmailConfig();
  res.json(cfg);
});

export { router as priceReportEmailSettingsRouter };
