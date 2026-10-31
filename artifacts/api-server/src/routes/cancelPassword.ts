import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import crypto from "crypto";

const router: IRouter = Router();

const KEY = "cancel_password_hash";

function hashPwd(pwd: string): string {
  return crypto.createHash("sha256").update(String(pwd)).digest("hex");
}

async function getStoredHash(): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY));
  return rows[0]?.value ?? null;
}

async function setStoredHash(hash: string | null): Promise<void> {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY));
  if (existing.length > 0) {
    if (hash === null) {
      await db.delete(settingsTable).where(eq(settingsTable.key, KEY));
    } else {
      await db.update(settingsTable)
        .set({ value: hash, updatedAt: new Date() })
        .where(eq(settingsTable.key, KEY));
    }
  } else if (hash !== null) {
    await db.insert(settingsTable).values({ key: KEY, value: hash });
  }
}

export async function verifyCancelPassword(pwd: string | undefined | null): Promise<{ ok: boolean; notSet: boolean }> {
  const stored = await getStoredHash();
  if (!stored) return { ok: false, notSet: true };
  if (!pwd) return { ok: false, notSet: false };
  return { ok: hashPwd(pwd) === stored, notSet: false };
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as any).session?.role !== "admin") {
    res.status(403).json({ error: "Vetëm admin" });
    return;
  }
  next();
}

// Admin: a është vendosur fjalëkalimi (nuk e kthen)
router.get("/settings/cancel-password", requireAdmin, async (_req, res): Promise<void> => {
  const stored = await getStoredHash();
  res.json({ isSet: !!stored });
});

// Admin: vendos/ndrysho fjalëkalimin
router.put("/settings/cancel-password", requireAdmin, async (req, res): Promise<void> => {
  const pwd = String(req.body?.password ?? "").trim();
  if (pwd.length < 3) {
    res.status(400).json({ error: "Fjalëkalimi duhet të jetë të paktën 3 karaktere" });
    return;
  }
  await setStoredHash(hashPwd(pwd));
  res.json({ isSet: true });
});

// Admin: hiq fjalëkalimin (anulim pa pyetur)
router.delete("/settings/cancel-password", requireAdmin, async (_req, res): Promise<void> => {
  await setStoredHash(null);
  res.json({ isSet: false });
});

// Kushdo (FMS auth): kontrollo a është vendosur (jo vlera!)
router.get("/cancel-password/status", async (_req, res): Promise<void> => {
  const stored = await getStoredHash();
  res.json({ isSet: !!stored });
});

// Kushdo (FMS auth): verifiko fjalëkalimin
router.post("/cancel-password/verify", async (req, res): Promise<void> => {
  const pwd = String(req.body?.password ?? "");
  const result = await verifyCancelPassword(pwd);
  res.json(result);
});

export { router as cancelPasswordRouter };
