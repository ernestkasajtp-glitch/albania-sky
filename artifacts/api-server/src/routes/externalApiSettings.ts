import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import crypto from "crypto";

const router: IRouter = Router();

const API_KEY_SETTING = "external_api_key";

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm admin" });
    return;
  }
  next();
}

router.get("/settings/external-api", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, API_KEY_SETTING));
  const apiKey = rows[0]?.value ?? null;
  res.json({ enabled: !!apiKey, apiKey });
});

router.post("/settings/external-api/regenerate", requireAdmin, async (_req, res): Promise<void> => {
  const newKey = "kf_" + crypto.randomBytes(24).toString("hex");
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, API_KEY_SETTING));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value: newKey, updatedAt: new Date() }).where(eq(settingsTable.key, API_KEY_SETTING));
  } else {
    await db.insert(settingsTable).values({ key: API_KEY_SETTING, value: newKey });
  }
  res.json({ apiKey: newKey });
});

router.delete("/settings/external-api", requireAdmin, async (_req, res): Promise<void> => {
  await db.delete(settingsTable).where(eq(settingsTable.key, API_KEY_SETTING));
  res.json({ disabled: true });
});

export { router as externalApiSettingsRouter };
