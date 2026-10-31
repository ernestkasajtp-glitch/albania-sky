import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SETTING_KEY = "social_proof_enabled";

// Default ON to preserve the current behaviour (badges visible) until an admin
// explicitly turns them off. A missing row (or anything other than "false")
// means enabled.
export async function getSocialProofEnabled(): Promise<boolean> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTING_KEY));
  if (rows.length === 0) return true;
  return rows[0].value !== "false";
}

async function setSocialProofEnabled(enabled: boolean): Promise<void> {
  const value = enabled ? "true" : "false";
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTING_KEY));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, SETTING_KEY));
  } else {
    await db.insert(settingsTable).values({ key: SETTING_KEY, value });
  }
}

const router: IRouter = Router();

// NOTE: mounted with requireAdmin in routes/index.ts (admin-only). The public
// read lives in public.ts via getSocialProofEnabled().
router.get("/settings/social-proof", async (_req, res): Promise<void> => {
  res.json({ enabled: await getSocialProofEnabled() });
});

router.put("/settings/social-proof", async (req, res): Promise<void> => {
  const enabled = (req.body ?? {}).enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "Fusha 'enabled' duhet të jetë boolean." });
    return;
  }
  await setSocialProofEnabled(enabled);
  res.json({ enabled });
});

export { router as socialProofSettingsRouter };
