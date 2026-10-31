import { Router } from "express";
import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import { brandingTable } from "@workspace/db/schema";

const router = Router();

type BrandingRow = typeof brandingTable.$inferSelect;
let brandingCache: { row: BrandingRow; at: number } | null = null;
const BRANDING_TTL_MS = 10 * 60 * 1000;

async function getBranding(): Promise<BrandingRow> {
  if (brandingCache && Date.now() - brandingCache.at < BRANDING_TTL_MS) {
    return brandingCache.row;
  }
  const rows = await db.select().from(brandingTable).limit(1);
  const row = rows[0] ?? (await db.insert(brandingTable).values({}).returning())[0];
  brandingCache = { row, at: Date.now() };
  return row;
}

function imageUrl(value: string | null, kind: "logo" | "background"): string | null {
  if (!value) return null;
  const hash = createHash("sha256").update(value).digest("hex");
  return `/api/branding/image/${kind}/${hash}`;
}

router.get("/branding", async (req, res): Promise<void> => {
  const row = await getBranding();
  // Revalidate the tiny metadata on every visit; images themselves have immutable URLs.
  res.set("Cache-Control", "public, no-cache");
  if (req.query.compact === "1") {
    res.json({
      siteName: row.siteName,
      tagline: row.tagline,
      primaryColor: row.primaryColor,
      logoUrl: imageUrl(row.logoBase64, "logo"),
      backgroundUrl: imageUrl(row.backgroundBase64, "background"),
    });
    return;
  }
  // Keep the existing full response for the editor and older consumers.
  res.json(row);
});

router.get("/branding/image/:kind/:hash", async (req, res): Promise<void> => {
  const kind = req.params.kind;
  const hash = req.params.hash;
  if ((kind !== "logo" && kind !== "background") || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
    res.sendStatus(404);
    return;
  }
  const row = await getBranding();
  const value = kind === "logo" ? row.logoBase64 : row.backgroundBase64;
  if (!value || imageUrl(value, kind) !== `/api/branding/image/${kind}/${hash}`) {
    res.sendStatus(404);
    return;
  }
  const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(value);
  if (!match) {
    res.sendStatus(415);
    return;
  }
  const bytes = Buffer.from(match[2], "base64");
  res.set({
    "Content-Type": match[1],
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.send(bytes);
});

router.put("/branding", async (req: any, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
  if (req.session?.role !== "admin") return res.status(403).json({ error: "Admin only" });

  const { siteName, tagline, logoBase64, backgroundBase64, primaryColor } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (siteName !== undefined) updates.siteName = siteName;
  if (tagline !== undefined) updates.tagline = tagline;
  if (logoBase64 !== undefined) updates.logoBase64 = logoBase64;
  if (backgroundBase64 !== undefined) updates.backgroundBase64 = backgroundBase64;
  if (primaryColor !== undefined) updates.primaryColor = primaryColor;

  try {
    const existing = await db.select().from(brandingTable).limit(1);
    if (existing.length === 0) {
      const [row] = await db.insert(brandingTable).values(updates).returning();
      brandingCache = { row, at: Date.now() };
      res.set("Cache-Control", "no-store");
      return res.json(row);
    }
    const [row] = await db.update(brandingTable)
      .set(updates)
      .returning();
    brandingCache = { row, at: Date.now() };
    res.set("Cache-Control", "no-store");
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
