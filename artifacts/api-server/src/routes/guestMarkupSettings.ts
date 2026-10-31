import { Router, type IRouter } from "express";
import { getGuestMarkup, setGuestMarkup } from "../lib/priceRules.js";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm admin" });
    return;
  }
  next();
}

router.get("/settings/guest-markup", requireAdmin, async (_req, res): Promise<void> => {
  const gm = await getGuestMarkup();
  res.json(gm);
});

router.put("/settings/guest-markup", requireAdmin, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const type = b.type === "fixed" ? "fixed" : "percent";
  const raw = Number(b.value);
  const value = Number.isFinite(raw) ? Math.min(1_000_000, Math.max(0, raw)) : 0;
  await setGuestMarkup(type, value);
  res.json({ type, value });
});

export { router as guestMarkupSettingsRouter };
