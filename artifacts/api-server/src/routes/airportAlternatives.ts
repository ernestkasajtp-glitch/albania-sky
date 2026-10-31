import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, asc } from "drizzle-orm";
import { db, airportAlternativesTable } from "@workspace/db";

const router: IRouter = Router();

function requireAdminOrManager(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;
  if (!session?.userId || !["admin", "manager"].includes(session.role ?? "")) {
    res.status(403).json({ error: "Akses i ndaluar." });
    return;
  }
  next();
}

router.get("/airport-alternatives", requireAdminOrManager, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(airportAlternativesTable)
      .orderBy(asc(airportAlternativesTable.mainAirport), asc(airportAlternativesTable.alternativeAirport));
    res.json(rows);
  } catch (err: any) {
    console.error("[airport-alternatives GET]", err?.message, err?.stack);
    res.status(500).json({ error: "Failed to fetch airport alternatives", detail: err?.message });
  }
});

router.post("/airport-alternatives", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const { mainAirport, alternativeAirport, notes } = req.body;
    if (!mainAirport?.trim() || !alternativeAirport?.trim()) {
      res.status(400).json({ error: "mainAirport dhe alternativeAirport janë të detyrueshme" });
      return;
    }
    const [row] = await db.insert(airportAlternativesTable).values({
      mainAirport: mainAirport.trim().toUpperCase(),
      alternativeAirport: alternativeAirport.trim().toUpperCase(),
      notes: notes?.trim() || null,
    }).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to create airport alternative" });
  }
});

router.put("/airport-alternatives/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { mainAirport, alternativeAirport, notes } = req.body;
    const [row] = await db.update(airportAlternativesTable).set({
      mainAirport: mainAirport?.trim().toUpperCase(),
      alternativeAirport: alternativeAirport?.trim().toUpperCase(),
      notes: notes?.trim() || null,
    }).where(eq(airportAlternativesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Failed to update airport alternative" });
  }
});

router.delete("/airport-alternatives/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select({ id: airportAlternativesTable.id })
      .from(airportAlternativesTable).where(eq(airportAlternativesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(airportAlternativesTable).where(eq(airportAlternativesTable.id, id));
    res.sendStatus(204);
  } catch {
    res.status(500).json({ error: "Failed to delete airport alternative" });
  }
});

export default router;
