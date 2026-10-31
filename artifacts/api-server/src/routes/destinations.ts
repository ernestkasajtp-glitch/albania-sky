import { Router, type IRouter, type Request } from "express";
import { eq, asc, and, gte, lte, sql } from "drizzle-orm";
import { db, destinationsTable, flightsTable } from "@workspace/db";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(process.cwd(), "uploads", "destinations");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uploadReq = req as Request & { destinationUploadBase?: string };
    const base = uploadReq.destinationUploadBase ?? `dest-${Date.now()}`;
    uploadReq.destinationUploadBase = base;
    if (file.fieldname === "photoCard") {
      cb(null, `${base}.card.v1.webp`);
      return;
    }
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${base}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const destinationPhotos = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "photoCard", maxCount: 1 },
]);

export const publicDestRouter: IRouter = Router();
export const adminDestRouter: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveDestinationPrice(dest: typeof destinationsTable.$inferSelect): Promise<{ date: string | null; price: number | null }> {
  const parts = dest.itinerary.split("-");
  const origin = parts[0]?.trim().toUpperCase();
  const destination = parts[1]?.trim().toUpperCase();
  if (!origin || !destination) return { date: null, price: null };

  const today = new Date().toISOString().split("T")[0];

  if (dest.priceMode === "manual" && dest.manualDate) {
    const [flight] = await db
      .select()
      .from(flightsTable)
      .where(
        and(
          eq(flightsTable.fromCity, origin),
          eq(flightsTable.toCity, destination),
          eq(flightsTable.departureDate, dest.manualDate),
          eq(flightsTable.status, "open"),
        )
      )
      .limit(1);
    return {
      date: dest.manualDate,
      price: flight ? Number(flight.adultPrice) : null,
    };
  }

  // Auto: earliest upcoming open flight
  const [flight] = await db
    .select()
    .from(flightsTable)
    .where(
      and(
        eq(flightsTable.fromCity, origin),
        eq(flightsTable.toCity, destination),
        gte(flightsTable.departureDate, today),
        eq(flightsTable.status, "open"),
      )
    )
    .orderBy(asc(flightsTable.departureDate))
    .limit(1);

  return {
    date: flight?.departureDate ?? null,
    price: flight ? Number(flight.adultPrice) : null,
  };
}

async function formatDest(dest: typeof destinationsTable.$inferSelect) {
  const { date, price } = await resolveDestinationPrice(dest);
  let photoCardUrl: string | null = null;
  if (dest.photoUrl?.startsWith("/uploads/destinations/")) {
    const originalName = path.basename(dest.photoUrl);
    const cardName = originalName.replace(/\.[^.]+$/, ".card.v1.webp");
    const cardPath = path.join(uploadDir, cardName);
    if (fs.existsSync(cardPath)) photoCardUrl = `/uploads/destinations/${cardName}`;
  }
  return {
    id: dest.id,
    itinerary: dest.itinerary,
    displayName: dest.displayName,
    priceMode: dest.priceMode,
    manualDate: dest.manualDate,
    photoUrl: dest.photoUrl,
    photoCardUrl,
    sortOrder: dest.sortOrder,
    active: dest.active,
    resolvedDate: date,
    resolvedPrice: price,
  };
}

function uploadedOriginal(req: Request): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.photo?.[0];
}

// ── Public: GET /destinations ─────────────────────────────────────────────────
publicDestRouter.get("/destinations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(destinationsTable)
    .where(eq(destinationsTable.active, true))
    .orderBy(asc(destinationsTable.sortOrder), asc(destinationsTable.id));

  const result = await Promise.all(rows.map(formatDest));
  res.json(result);
});

// ── Admin: GET /admin/destinations ────────────────────────────────────────────
adminDestRouter.get("/admin/destinations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(destinationsTable)
    .orderBy(asc(destinationsTable.sortOrder), asc(destinationsTable.id));
  const result = await Promise.all(rows.map(formatDest));
  res.json(result);
});

// ── Admin: POST /admin/destinations ───────────────────────────────────────────
adminDestRouter.post("/admin/destinations", destinationPhotos, async (req, res): Promise<void> => {
  const { itinerary, displayName, priceMode, manualDate, sortOrder, active } = req.body;
  if (!itinerary || !displayName) {
    res.status(400).json({ error: "itinerary dhe displayName janë të detyrueshme" });
    return;
  }
  const photo = uploadedOriginal(req);
  const photoUrl = photo ? `/uploads/destinations/${photo.filename}` : null;
  const [dest] = await db.insert(destinationsTable).values({
    itinerary: itinerary.toUpperCase(),
    displayName,
    priceMode: priceMode || "auto",
    manualDate: (priceMode === "manual" && manualDate) ? manualDate : null,
    photoUrl,
    sortOrder: sortOrder ? Number(sortOrder) : 0,
    active: active !== "false",
  }).returning();
  res.status(201).json(await formatDest(dest));
});

// ── Admin: PATCH /admin/destinations/:id ──────────────────────────────────────
adminDestRouter.patch("/admin/destinations/:id", destinationPhotos, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Destinacion nuk u gjet" }); return; }

  const { itinerary, displayName, priceMode, manualDate, sortOrder, active } = req.body;
  const photo = uploadedOriginal(req);
  const photoUrl = photo
    ? `/uploads/destinations/${photo.filename}`
    : existing.photoUrl;

  const [updated] = await db.update(destinationsTable).set({
    itinerary: itinerary ? itinerary.toUpperCase() : existing.itinerary,
    displayName: displayName || existing.displayName,
    priceMode: priceMode || existing.priceMode,
    manualDate: priceMode === "manual" && manualDate ? manualDate : (priceMode === "manual" ? existing.manualDate : null),
    photoUrl,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder,
    active: active !== undefined ? active !== "false" : existing.active,
    updatedAt: new Date(),
  }).where(eq(destinationsTable.id, id)).returning();

  res.json(await formatDest(updated));
});

// ── Admin: DELETE /admin/destinations/:id ─────────────────────────────────────
adminDestRouter.delete("/admin/destinations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(destinationsTable).where(eq(destinationsTable.id, id));
  res.json({ ok: true });
});
