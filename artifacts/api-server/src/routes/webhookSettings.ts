import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, webhookLogsTable, settingsTable } from "@workspace/db";
import { scheduleNextAutoSoldOut } from "../lib/autoSoldOut.js";
import crypto from "crypto";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm admin" });
    return;
  }
  next();
}

router.get("/settings/webhook", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable)
    .where(eq(settingsTable.key, "webhook_secret"));
  const secret = rows[0]?.value ?? null;
  const enabled = !!secret;

  const logs = await db.select().from(webhookLogsTable)
    .orderBy(desc(webhookLogsTable.createdAt))
    .limit(50);

  res.json({ enabled, secret, logs });
});

router.post("/settings/webhook/regenerate", requireAdmin, async (req, res): Promise<void> => {
  const newSecret = crypto.randomBytes(24).toString("hex");
  const existing = await db.select().from(settingsTable)
    .where(eq(settingsTable.key, "webhook_secret"));

  if (existing.length > 0) {
    await db.update(settingsTable)
      .set({ value: newSecret, updatedAt: new Date() })
      .where(eq(settingsTable.key, "webhook_secret"));
  } else {
    await db.insert(settingsTable).values({ key: "webhook_secret", value: newSecret });
  }

  res.json({ secret: newSecret });
});

router.delete("/settings/webhook", requireAdmin, async (req, res): Promise<void> => {
  await db.delete(settingsTable).where(eq(settingsTable.key, "webhook_secret"));
  res.json({ disabled: true });
});

router.delete("/settings/webhook/logs", requireAdmin, async (_req, res): Promise<void> => {
  await db.delete(webhookLogsTable);
  res.json({ cleared: true });
});

// ── Sell Cutoff Hours ────────────────────────────────────────────────────────

// Lexim i hapur për çdo përdorues të loguar të sistemit (admin/menaxher/staf):
// vlera globale e mbylljes së shitjes duhet të shfaqet edhe te paneli i
// fluturimit për jo-adminët. Ndryshimi (PUT) mbetet vetëm për adminin.
function requireLoggedIn(req: any, res: any, next: any) {
  if (!req.session?.role) {
    res.status(401).json({ error: "Kërkohet hyrja" });
    return;
  }
  next();
}

router.get("/settings/sell-cutoff", requireLoggedIn, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "sell_cutoff_hours"));
  const val = rows[0]?.value ?? "3";
  res.json({ hours: parseFloat(val) || 3 });
});

// Vlera globale te Cilësimet ndryshohet VETËM nga admini; menaxheri e
// ndryshon orën vetëm për fluturim te paneli i fluturimit (PATCH /flights/:id).
router.put("/settings/sell-cutoff", requireAdmin, async (req, res): Promise<void> => {
  const hours = parseFloat(req.body?.hours ?? "3");
  if (isNaN(hours) || hours < 0) {
    res.status(400).json({ error: "Vlera e pavlefshme" });
    return;
  }
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, "sell_cutoff_hours"));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value: hours.toString(), updatedAt: new Date() }).where(eq(settingsTable.key, "sell_cutoff_hours"));
  } else {
    await db.insert(settingsTable).values({ key: "sell_cutoff_hours", value: hours.toString() });
  }
  // The cutoff changed — recompute the precise auto-soldout timer immediately.
  void scheduleNextAutoSoldOut();
  res.json({ hours });
});

// ── Kufiri i shitjes për fluturimet e KONFIRMUARA (⭐) ────────────────────────
router.get("/settings/confirmed-sell-cutoff", requireLoggedIn, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "confirmed_sell_cutoff_hours"));
  const val = rows[0]?.value ?? "4";
  res.json({ hours: parseFloat(val) || 4 });
});

router.put("/settings/confirmed-sell-cutoff", requireAdmin, async (req, res): Promise<void> => {
  const hours = parseFloat(req.body?.hours ?? "4");
  if (isNaN(hours) || hours < 0) {
    res.status(400).json({ error: "Vlera e pavlefshme" });
    return;
  }
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, "confirmed_sell_cutoff_hours"));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value: hours.toString(), updatedAt: new Date() }).where(eq(settingsTable.key, "confirmed_sell_cutoff_hours"));
  } else {
    await db.insert(settingsTable).values({ key: "confirmed_sell_cutoff_hours", value: hours.toString() });
  }
  // The cutoff changed — recompute the precise auto-soldout timer immediately.
  void scheduleNextAutoSoldOut();
  res.json({ hours });
});

export { router as webhookSettingsRouter };
