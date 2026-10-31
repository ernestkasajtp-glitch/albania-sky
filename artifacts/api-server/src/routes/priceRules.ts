import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, priceRulesTable } from "@workspace/db";
import type { PriceRuleTier } from "@workspace/db";

const router: IRouter = Router();

// Normalise/validate the rule body coming from the admin UI.
function parseTiers(raw: any): PriceRuleTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      minPrice: Number(t?.minPrice) || 0,
      maxPrice: t?.maxPrice == null || t?.maxPrice === "" ? null : Number(t.maxPrice),
      value: Number(t?.value) || 0,
    }))
    .filter(
      (t) =>
        Number.isFinite(t.minPrice) &&
        Number.isFinite(t.value) &&
        // maxPrice must be either omitted (open-ended) or a finite number >= minPrice.
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
  return {
    name: String(body?.name ?? "").trim() || "Rregull",
    active: body?.active === undefined ? true : !!body.active,
    discountType,
    tiers: parseTiers(body?.tiers),
    applyAllFlights: body?.applyAllFlights === undefined ? true : !!body.applyAllFlights,
    flightIds: parseIntArray(body?.flightIds),
    fromCity: body?.fromCity ? String(body.fromCity).trim().toUpperCase() : null,
    toCity: body?.toCity ? String(body.toCity).trim().toUpperCase() : null,
    airline: body?.airline ? String(body.airline).trim() : null,
    departureFrom: body?.departureFrom ? String(body.departureFrom).trim() : null,
    departureTo: body?.departureTo ? String(body.departureTo).trim() : null,
    agentIds: parseIntArray(body?.agentIds),
  };
}

function serialize(r: typeof priceRulesTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// List all rules.
router.get("/price-rules", async (_req, res): Promise<void> => {
  const rows = await db.select().from(priceRulesTable).orderBy(priceRulesTable.id);
  res.json(rows.map(serialize));
});

// Create a rule.
router.post("/price-rules", async (req, res): Promise<void> => {
  const data = normalizeBody(req.body);
  if (!data.name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(priceRulesTable).values(data).returning();
  res.status(201).json(serialize(row));
});

// Update a rule.
router.put("/price-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const data = normalizeBody(req.body);
  const [row] = await db
    .update(priceRulesTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(priceRulesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(row));
});

// Toggle active (lightweight PATCH).
router.patch("/price-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const patch: Record<string, any> = { updatedAt: new Date() };
  if (req.body?.active !== undefined) patch.active = !!req.body.active;
  const [row] = await db.update(priceRulesTable).set(patch).where(eq(priceRulesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(row));
});

// Delete a rule.
router.delete("/price-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(priceRulesTable).where(eq(priceRulesTable.id, id));
  res.status(204).end();
});

export default router;
