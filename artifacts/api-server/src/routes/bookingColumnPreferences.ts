import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, bookingColumnPreferencesTable, bookingUsersTable } from "@workspace/db";
import { SaveBookingColumnPreferencesBody } from "@workspace/api-zod";
import { notifyDataChanged } from "../lib/liveEvents";

export const bookingColumnPreferencesRouter = Router();

bookingColumnPreferencesRouter.use("/me/booking-columns", async (req, res, next) => {
  const id = req.session?.userId;
  if (!id || !Number.isSafeInteger(id) || (req.session as any).source !== "fms") {
    res.status(401).json({ error: "Jo i autentikuar" }); return;
  }
  const [user] = await db.select({ role: bookingUsersTable.role }).from(bookingUsersTable)
    .where(eq(bookingUsersTable.id, id));
  if (!user || !["admin", "manager", "agent_staff"].includes(user.role)) {
    res.status(401).json({ error: "Jo i autentikuar" }); return;
  }
  next();
});
// Mounted behind requireFmsAuth. Ownership is exclusively the authenticated
// session, never a user ID supplied by the browser.
bookingColumnPreferencesRouter.get("/me/booking-columns", async (req, res) => {
  const [preference] = await db.select().from(bookingColumnPreferencesTable)
    .where(eq(bookingColumnPreferencesTable.userId, req.session.userId!));
  res.json({ visibleColumns: preference?.visibleColumns ?? null, columnWidths: preference?.columnWidths ?? {} });
});

bookingColumnPreferencesRouter.put("/me/booking-columns", async (req, res) => {
  const parsed = SaveBookingColumnPreferencesBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Zgjedhje e pavlefshme e kolonave." }); return;
  }
  const { visibleColumns, columnWidths } = parsed.data;
  const allowed = new Set(["date", "ref", "pnr", "klienti", "agjencia", "fluturimi", "flightDate", "flightTime", "pax", "financa", "neto", "commission", "paid", "due", "credit", "statusi"]);
  if (columnWidths && Object.entries(columnWidths).some(([key, width]) => !allowed.has(key) || !Number.isInteger(width))) {
    res.status(400).json({ error: "Kolonë e pavlefshme." }); return;
  }
  if (visibleColumns && new Set(visibleColumns).size !== visibleColumns.length) {
    res.status(400).json({ error: "Kolonat nuk mund të përsëriten." }); return;
  }
  const userId = req.session.userId!;
  if (visibleColumns === null) {
    await db.delete(bookingColumnPreferencesTable).where(eq(bookingColumnPreferencesTable.userId, userId));
  } else {
    await db.insert(bookingColumnPreferencesTable).values({ userId, visibleColumns, columnWidths: columnWidths ?? {} })
      .onConflictDoUpdate({
        target: bookingColumnPreferencesTable.userId,
        set: { visibleColumns, ...(columnWidths === undefined ? {} : { columnWidths }), updatedAt: new Date() },
      });
  }
  notifyDataChanged("booking_columns");
  const [saved] = await db.select().from(bookingColumnPreferencesTable).where(eq(bookingColumnPreferencesTable.userId, userId));
  res.json({ visibleColumns: saved?.visibleColumns ?? null, columnWidths: saved?.columnWidths ?? {} });
});