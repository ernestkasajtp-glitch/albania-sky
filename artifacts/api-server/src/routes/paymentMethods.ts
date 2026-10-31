import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, paymentMethodsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/payment-methods", async (_req, res): Promise<void> => {
  const rows = await db.select().from(paymentMethodsTable)
    .orderBy(asc(paymentMethodsTable.sortOrder), asc(paymentMethodsTable.id));
  res.json(rows);
});

// Shtimi i metodave të pagesës është i çaktivizuar — asnjë përdorues nuk lejohet.
router.post("/payment-methods", (_req, res): void => {
  res.status(403).json({ error: "Shtimi i metodave të pagesës nuk lejohet" });
});

router.patch("/payment-methods/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID e pavlefshme" });
    return;
  }
  const update: Record<string, unknown> = {};
  if (typeof req.body?.name === "string") update.name = req.body.name.trim();
  if (typeof req.body?.color === "string") update.color = req.body.color;
  if (typeof req.body?.active === "boolean") update.active = req.body.active;
  if (typeof req.body?.sortOrder === "number") update.sortOrder = req.body.sortOrder;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "Asnjë fushë për të përditësuar" });
    return;
  }

  const [row] = await db.update(paymentMethodsTable).set(update)
    .where(eq(paymentMethodsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Metoda nuk u gjet" });
    return;
  }
  res.json(row);
});

// Fshirja e metodave të pagesës është e çaktivizuar — asnjë përdorues nuk lejohet.
router.delete("/payment-methods/:id", (_req, res): void => {
  res.status(403).json({ error: "Fshirja e metodave të pagesës nuk lejohet" });
});

export default router;
