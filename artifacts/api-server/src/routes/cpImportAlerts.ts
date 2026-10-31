import { Router, type IRouter } from "express";
import { db, cpImportAlertsTable, settingsTable, bookingsTable } from "@workspace/db";
import { and, lt, eq, isNull, desc, count, sql, inArray } from "drizzle-orm";
import { failedEmails, RetryEmailError } from "../lib/failedEmail.js";
import { deliverEmail } from "../lib/gmail.js";
import { getPriorityHistory, startPriorityHistory } from "../lib/priorityHistory.js";
import { priorityReference, priorityBookingLinks } from "../lib/priorityBookingLinks.js";

const router: IRouter = Router();
router.get("/cp-import-alerts/priority-history", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getPriorityHistory());
});
router.post("/cp-import-alerts/priority-history", async (req, res) => {
  try {
    res.status(202).json(await startPriorityHistory(req.body?.from, req.body?.to));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Kontrolli nuk mund të niset." });
  }
});

// "Luggage" imports (files named luggages_*.csv) are informational only —
// they are shown in their own tab on the frontend and are NOT counted in the sidebar badge.
const isNotLuggageAlert = sql`(${cpImportAlertsTable.fileName} IS NULL OR ${cpImportAlertsTable.fileName} NOT ILIKE 'luggages%')`;

// Sidebar badge: number of unresolved CitizenPlane import alerts (luggage files excluded).
router.get("/cp-import-alerts/count", async (_req, res): Promise<void> => {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(cpImportAlertsTable)
    .where(sql`${isNull(cpImportAlertsTable.resolvedAt)} AND ${isNotLuggageAlert}`);
  res.json({ count: Number(cnt) });
});

// List alerts (unresolved by default; ?resolved=1 includes resolved ones).
// rawCsv is intentionally NOT returned here (can be up to 300KB per row) —
// only a hasRawCsv flag; the full content is fetched via /:id/raw on demand.
router.get("/cp-import-alerts", async (req, res): Promise<void> => {
  const includeResolved = req.query.resolved === "1";
  const beforeId = req.query.beforeId === undefined ? undefined : Number(req.query.beforeId);
  if (beforeId !== undefined && (!Number.isSafeInteger(beforeId) || beforeId <= 0)) {
    res.status(400).json({ error: "Invalid pagination cursor" }); return;
  }
  const listColumns = {
    id: cpImportAlertsTable.id,
    kind: cpImportAlertsTable.kind,
    source: cpImportAlertsTable.source,
    cpCode: cpImportAlertsTable.cpCode,
    fileName: cpImportAlertsTable.fileName,
    reason: cpImportAlertsTable.reason,
    createdAt: cpImportAlertsTable.createdAt,
    resolvedAt: cpImportAlertsTable.resolvedAt,
    hasRawCsv: sql<boolean>`(${cpImportAlertsTable.rawCsv} IS NOT NULL)`,
  };
  const base = db.select(listColumns).from(cpImportAlertsTable);
  const rows = await base.where(and(
    includeResolved ? undefined : isNull(cpImportAlertsTable.resolvedAt),
    beforeId === undefined ? undefined : lt(cpImportAlertsTable.id, beforeId),
  )).orderBy(desc(cpImportAlertsTable.id)).limit(300);
  const emails = await failedEmails.details(rows.filter(r => r.source.startsWith("system:email:")).map(r => r.id));
  // One read for this alert page, not one request/query per card. Match the complete
  // imported CP marker, never the external numeric Booking ID against our primary key.
  const references = [...new Set(rows.map(priorityReference).filter((c): c is string => c !== null))];
  const cpReference = sql<string>`substring(upper(${bookingsTable.notes}) from ${"\\[CP:([^]]+)\\]"})`;
  const linkedBookings = references.length ? await db.select({
    id: bookingsTable.id, bookingRef: bookingsTable.bookingRef, cpCode: cpReference,
  }).from(bookingsTable).where(inArray(cpReference, references)).orderBy(bookingsTable.id) : [];
  res.setHeader("Cache-Control", "no-store");
  res.json(rows.map(r => ({
    ...r, email: emails.get(r.id) ?? null,
    bookings: priorityBookingLinks(r, linkedBookings),
  })));
});

// Mounted behind requireAdmin in routes/index.ts. No client-provided recipients or payloads.
router.post("/cp-import-alerts/:id/retry-email", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || Object.keys(req.body ?? {}).some(k => k !== "confirmUncertain") ||
    (req.body?.confirmUncertain !== undefined && typeof req.body.confirmUncertain !== "boolean")) {
    res.status(400).json({ error: "Kërkesë e pavlefshme." }); return;
  }
  try {
    await failedEmails.retry(id, req.body?.confirmUncertain === true, deliverEmail);
    res.json({ ok: true, message: "Email-i u pranua nga serveri i email-it." });
  } catch (err) {
    if (err instanceof RetryEmailError) { res.status(err.status).json({ error: err.message }); return; }
    res.status(502).json({ error: "Ridërgimi nuk u konfirmua. Njoftimi mbetet i hapur; rifreskoni për të parë gjendjen." });
  }
});

// Download the raw CSV of a failed import (recovery copy).
router.get("/cp-import-alerts/:id/raw", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({ fileName: cpImportAlertsTable.fileName, rawCsv: cpImportAlertsTable.rawCsv })
    .from(cpImportAlertsTable)
    .where(eq(cpImportAlertsTable.id, id))
    .limit(1);
  if (!row || !row.rawCsv) {
    res.status(404).json({ error: "Nuk ka CSV të ruajtur për këtë njoftim" });
    return;
  }
  const safeName = (row.fileName || `import_${id}.csv`).replace(/[^\w.\-]/g, "_");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.send(row.rawCsv);
});

// Mark an alert as resolved (dismiss).
router.post("/cp-import-alerts/:id/resolve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const resolved = await db.transaction(async tx => {
    // Same short lock as the resend claim; dismiss cannot hide an in-flight failure.
    const emailKey = `failedEmail.${id}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${emailKey}))`);
    const [row] = await tx.select().from(settingsTable).where(eq(settingsTable.key, emailKey));
    if (row?.value) {
      try { if (JSON.parse(row.value).status === "sending") return false; } catch { /* legacy metadata */ }
    }
    await tx.update(cpImportAlertsTable).set({ resolvedAt: new Date() }).where(eq(cpImportAlertsTable.id, id));
    return true;
  });
  if (!resolved) { res.status(409).json({ error: "Prisni përfundimin e ridërgimit para se ta mbyllni njoftimin." }); return; }
  res.json({ ok: true });
});

export default router;
