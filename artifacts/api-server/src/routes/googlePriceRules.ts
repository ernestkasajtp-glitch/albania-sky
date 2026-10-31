import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, googlePriceRulesTable, flightsTable } from "@workspace/db";
import type { GooglePriceRuleTier } from "@workspace/db";
import { applyGooglePriceRulesToFlights } from "./flights";

const router: IRouter = Router();

// Admin-only lightweight catalog. Include historical IDs so removing a flight
// type also removes its old selections; the rule's date bounds remain separate.
router.get("/google-price-rules/flight-options", async (_req, res) => {
  const flights = await db.select({
    id: flightsTable.id, fromCity: flightsTable.fromCity,
    toCity: flightsTable.toCity, airline: flightsTable.airline,
    flightNumber: flightsTable.flightNumber,
  }).from(flightsTable).orderBy(flightsTable.id);
  res.setHeader("Cache-Control", "no-store");
  res.json(flights);
});

// Normalise/validate the rule body coming from the admin UI.
function parseTiers(raw: any): GooglePriceRuleTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      minPrice: Number(t?.minPrice) || 0,
      maxPrice: t?.maxPrice == null || t?.maxPrice === "" ? null : Number(t.maxPrice),
      value: Number(t?.value) || 0,
      minSalePrice:
        t?.minSalePrice == null || t?.minSalePrice === "" || !Number.isFinite(Number(t.minSalePrice))
          ? null
          : Math.max(0, Number(t.minSalePrice)),
      maxSalePrice:
        t?.maxSalePrice == null || t?.maxSalePrice === "" || !Number.isFinite(Number(t.maxSalePrice))
          ? null
          : Math.max(0, Number(t.maxSalePrice)),
    }))
    .filter(
      (t) =>
        Number.isFinite(t.minPrice) &&
        Number.isFinite(t.value) &&
        (t.maxPrice === null || (Number.isFinite(t.maxPrice) && t.maxPrice >= t.minPrice)),
    )
    .sort((a, b) => a.minPrice - b.minPrice);
}

function parseIntArray(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n: any) => Number(n)).filter((n) => Number.isInteger(n));
}

function normalizeBody(body: any) {
  const discountType = body?.discountType === "fixed" ? "fixed" : "percent";
  const minRaw = body?.minPrice;
  const minPrice =
    minRaw == null || minRaw === "" || Number.isNaN(Number(minRaw)) ? null : Math.max(0, Number(minRaw)).toString();
  const offlineDiscountType = body?.offlineDiscountType === "fixed" ? "fixed" : "percent";
  return {
    name: String(body?.name ?? "").trim() || "Rregull",
    active: body?.active === undefined ? true : !!body.active,
    applyOffline: body?.applyOffline === undefined ? false : !!body.applyOffline,
    // Default true so existing internal rules keep driving the adult/child price.
    applyInternal: body?.applyInternal === undefined ? true : !!body.applyInternal,
    discountType,
    tiers: parseTiers(body?.tiers),
    // Offline (Citizen) discount config — INDEPENDENT from the internal tiers.
    offlineTiers: parseTiers(body?.offlineTiers),
    offlineDiscountType,
    offlineRoundToFive: body?.offlineRoundToFive === undefined ? true : !!body.offlineRoundToFive,
    minPrice,
    applyAllFlights: body?.applyAllFlights === undefined ? true : !!body.applyAllFlights,
    flightIds: parseIntArray(body?.flightIds),
    fromCity: body?.fromCity ? String(body.fromCity).trim().toUpperCase() : null,
    toCity: body?.toCity ? String(body.toCity).trim().toUpperCase() : null,
    airline: body?.airline ? String(body.airline).trim() : null,
    departureFrom: body?.departureFrom ? String(body.departureFrom).trim() : null,
    departureTo: body?.departureTo ? String(body.departureTo).trim() : null,
    roundToFive: body?.roundToFive === undefined ? true : !!body.roundToFive,
  };
}

function serialize(r: typeof googlePriceRulesTable.$inferSelect) {
  return {
    ...r,
    minPrice: r.minPrice != null ? Number(r.minPrice) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// Re-derive sale prices in the background after any rule change (non-blocking).
function triggerApply(req: any): void {
  void applyGooglePriceRulesToFlights().catch((err) => {
    req.log?.error?.({ err }, "[google-price-rules] apply after mutation failed");
  });
}

// List all rules.
router.get("/google-price-rules", async (_req, res): Promise<void> => {
  const rows = await db.select().from(googlePriceRulesTable).orderBy(googlePriceRulesTable.id);
  res.json(rows.map(serialize));
});

// Create a rule.
router.post("/google-price-rules", async (req, res): Promise<void> => {
  const data = normalizeBody(req.body);
  if (!data.name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(googlePriceRulesTable).values(data).returning();
  triggerApply(req);
  res.status(201).json(serialize(row));
});

// Update a rule.
router.put("/google-price-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const data = normalizeBody(req.body);
  const [row] = await db
    .update(googlePriceRulesTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(googlePriceRulesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  triggerApply(req);
  res.json(serialize(row));
});

// Toggle active (lightweight PATCH).
router.patch("/google-price-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const patch: Record<string, any> = { updatedAt: new Date() };
  if (req.body?.active !== undefined) patch.active = !!req.body.active;
  const [row] = await db.update(googlePriceRulesTable).set(patch).where(eq(googlePriceRulesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  triggerApply(req);
  res.json(serialize(row));
});

// Delete a rule.
router.delete("/google-price-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(googlePriceRulesTable).where(eq(googlePriceRulesTable.id, id));
  triggerApply(req);
  res.status(204).end();
});

export default router;
