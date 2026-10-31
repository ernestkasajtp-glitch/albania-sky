import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, bookingsTable, pokAccountsTable, pokOrdersTable } from "@workspace/db";
import { ensurePokAccount, getPokAccountById, lockPokAccountConfig } from "../lib/pokAccounts.js";
import { pokGetOrder, recordPokPaymentFromOrder } from "./public.js";
import { pokPaymentEvidence, terminalPokFailureStatus } from "../lib/pokOrderPolicy.js";

const router: IRouter = Router();
const TERMINAL_FAILURES = new Set(["failed", "cancelled", "expired"]);

function terminalFailureStatus(order: any): string | null {
  return terminalPokFailureStatus(order?.status ?? order?.state ?? order?.orderStatus);
}

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admin" }); return; }
  next();
}

async function lockedOrder(id: number, action: (tx: any, order: any) => Promise<any>) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(pokOrdersTable).where(eq(pokOrdersTable.id, id)).limit(1);
    if (!order) return null;
    await lockPokAccountConfig(tx);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-booking-${order.bookingId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pok-account-${order.accountId}`}))`);
    const [fresh] = await tx.select().from(pokOrdersTable).where(eq(pokOrdersTable.id, id)).limit(1);
    return fresh ? action(tx, fresh) : null;
  });
}

router.get("/settings/pok-reconciliation", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: pokOrdersTable.id,
    bookingId: pokOrdersTable.bookingId,
    bookingRef: bookingsTable.bookingRef,
    accountLabel: pokAccountsTable.label,
    amount: pokOrdersTable.amount,
    status: pokOrdersTable.status,
    providerOrderId: pokOrdersTable.providerOrderId,
    createdAt: pokOrdersTable.createdAt,
    updatedAt: pokOrdersTable.updatedAt,
    expiresAt: pokOrdersTable.expiresAt,
    notificationClosedAt: pokOrdersTable.notificationClosedAt,
  }).from(pokOrdersTable)
    .innerJoin(bookingsTable, eq(bookingsTable.id, pokOrdersTable.bookingId))
    .innerJoin(pokAccountsTable, eq(pokAccountsTable.id, pokOrdersTable.accountId))
    .where(or(
      inArray(pokOrdersTable.status, ["creating", "unknown", "superseded", "review_required"]),
      isNotNull(pokOrdersTable.notificationClosedAt),
    ))
    .orderBy(asc(pokOrdersTable.createdAt));
  res.json({ intents: rows.map(row => ({
    ...row,
    providerOrderId: row.providerOrderId,
    confirmUrl: undefined,
    amount: Number(row.amount),
  })) });
});

// Archive only the notification. Never alter the provider/payment lifecycle.
router.post("/settings/pok-reconciliation/:id/close", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID e pavlefshme" }); return;
  }
  const [row] = await db.update(pokOrdersTable).set({
    notificationClosedAt: sql`COALESCE(${pokOrdersTable.notificationClosedAt}, now())`,
  }).where(eq(pokOrdersTable.id, id)).returning({ id: pokOrdersTable.id });
  if (!row) { res.status(404).json({ error: "Njoftimi nuk u gjet" }); return; }
  res.json({ ok: true });
});

router.post("/settings/pok-reconciliation/:id/recheck", requireAdmin, async (req, res): Promise<void> => {
  await ensurePokAccount();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  const [row] = await db.select().from(pokOrdersTable).where(eq(pokOrdersTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Intenti nuk u gjet" }); return; }
  if (row.status === "review_required") {
    res.status(409).json({ error: "Pagesa e dytë kërkon shqyrtim manual; nuk regjistrohet automatikisht në rezervim.", code: "POK_REVIEW_REQUIRED" });
    return;
  }
  const requestedProviderOrderId = typeof req.body?.providerOrderId === "string"
    ? req.body.providerOrderId.trim() : "";
  const providerOrderId = row.providerOrderId || requestedProviderOrderId;
  if (!providerOrderId) {
    res.status(400).json({ error: "Vendosni providerOrderId nga dashboard-i i POK; pa të nuk kryhet asnjë riprovim." });
    return;
  }
  if (row.providerOrderId && requestedProviderOrderId && row.providerOrderId !== requestedProviderOrderId) {
    res.status(409).json({ error: "providerOrderId nuk përputhet me intentin e ruajtur" });
    return;
  }
  const account = await getPokAccountById(row.accountId);
  if (!account) { res.status(503).json({ error: "Llogaria e lidhur nuk është e disponueshme" }); return; }
  let providerOrder: any | null;
  try {
    providerOrder = await pokGetOrder(providerOrderId, account);
  } catch {
    res.status(503).json({ error: "POK nuk u verifikua; provoni përsëri më vonë." });
    return;
  }
  if (!providerOrder) {
    res.json({ status: row.status, reason: "order_not_found", requiresExplicitFailure: true });
    return;
  }
  const [booking] = await db.select({ bookingRef: bookingsTable.bookingRef })
    .from(bookingsTable).where(eq(bookingsTable.id, row.bookingId)).limit(1);
  if (!booking || providerOrder.merchantCustomReference !== booking.bookingRef) {
    res.status(409).json({ error: "Provider order nuk përputhet me rezervimin e lidhur" });
    return;
  }
  const evidence = pokPaymentEvidence(providerOrder, providerOrderId, booking.bookingRef, row.amount);
  if (evidence.kind === "uncertain") {
    res.status(409).json({ error: `Prova e pagesës nuk është e plotë (${evidence.reason}); intenti nuk u ndryshua.` });
    return;
  }
  const bound = await lockedOrder(id, async (tx, fresh) => {
    if (!["creating", "unknown", "created", "pending", "superseded"].includes(fresh.status)) return null;
    if (fresh.providerOrderId && fresh.providerOrderId !== providerOrderId) return null;
    if (!["creating", "unknown"].includes(fresh.status) && fresh.providerOrderId !== providerOrderId) return null;
    const [saved] = await tx.update(pokOrdersTable).set({
      providerOrderId,
      confirmUrl: fresh.confirmUrl ?? providerOrder?._self?.confirmUrl ?? providerOrder?.__self?.confirmUrl ?? null,
      status: fresh.status === "creating" || fresh.status === "unknown" ? "created" : fresh.status,
      updatedAt: new Date(),
    }).where(and(eq(pokOrdersTable.id, id), eq(pokOrdersTable.bookingId, row.bookingId))).returning();
    return saved ?? null;
  });
  if (!bound) { res.status(409).json({ error: "Int enti u ndryshua; rifreskoni dhe rikontrolloni." }); return; }
  if (evidence.kind === "paid") {
    const result = await recordPokPaymentFromOrder(providerOrder, row.accountId);
    if (!result.ok) { res.status(503).json({ error: "Pagesa nuk u regjistrua; provoni përsëri.",
      ...(result.reason === "review_required" ? { code: "POK_REVIEW_REQUIRED" } : {}) }); return; }
    res.json({ status: "paid", result });
    return;
  }
  res.json({ status: bound.status, reason: "unpaid" });
});

router.post("/settings/pok-reconciliation/:id/fail", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  if (req.body?.confirm !== true || req.body?.dashboardChecked !== true) {
    res.status(400).json({ error: "Kërkohet konfirmim dhe kontrolli i dashboard-it të POK" });
    return;
  }
  const claimedTerminal = String(req.body?.terminalStatus ?? "").toLowerCase();
  if (!TERMINAL_FAILURES.has(claimedTerminal) && claimedTerminal !== "not-found") {
    res.status(400).json({ error: "Zgjidhni statusin terminal të konfirmuar nga POK: failed, cancelled, expired ose not-found." });
    return;
  }
  if (claimedTerminal === "not-found" && req.body?.dashboardRechecked !== true) {
    res.status(400).json({ error: "not-found kërkon rikontroll të dashboard-it të POK që porosia është anuluar ose skaduar." });
    return;
  }
  const [beforeFail] = await db.select().from(pokOrdersTable).where(eq(pokOrdersTable.id, id)).limit(1);
  if (!beforeFail) { res.status(404).json({ error: "Intenti nuk u gjet" }); return; }
  if (beforeFail.providerOrderId) {
    const account = await getPokAccountById(beforeFail.accountId);
    if (!account) { res.status(503).json({ error: "Llogaria e lidhur nuk është e disponueshme" }); return; }
    let providerOrder: any | null;
    try { providerOrder = await pokGetOrder(beforeFail.providerOrderId, account); } catch {
      res.status(503).json({ error: "Nuk u verifikua dot porosia e lidhur; nuk u shënua si e dështuar." });
      return;
    }
    if (providerOrder && (providerOrder.isCompleted === true || providerOrder.isCaptured === true || Number(providerOrder.capturedAmount ?? 0) > 0)) {
      res.status(409).json({ error: "Porosia e lidhur është paguar; nuk lejohet shënimi si e dështuar." });
      return;
    }
    const authoritativeStatus = providerOrder ? terminalFailureStatus(providerOrder) : null;
    if (providerOrder && !authoritativeStatus) {
      res.status(409).json({ error: "Porosia është ende e hapur ose e papërfunduar; nuk lejohet shënimi si e dështuar ndërsa mund të paguhet." });
      return;
    }
    if (authoritativeStatus && claimedTerminal !== authoritativeStatus) {
      res.status(409).json({ error: "Statusi terminal i konfirmimit nuk përputhet me përgjigjen e POK." });
      return;
    }
    if (!providerOrder && !["cancelled", "expired", "failed", "not-found"].includes(claimedTerminal)) {
      res.status(409).json({ error: "404 i POK nuk është mjaftueshëm përfundimtar; verifikoni cancellation/expiry në dashboard." });
      return;
    }
  }
  const result = await lockedOrder(id, async (tx, fresh) => {
    if (!["creating", "unknown"].includes(fresh.status)) return { status: fresh.status };
    const updated = await tx.update(pokOrdersTable).set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(pokOrdersTable.id, id), eq(pokOrdersTable.status, fresh.status)))
      .returning({ id: pokOrdersTable.id });
    return { status: updated.length ? "failed" : fresh.status };
  });
  if (!result) { res.status(404).json({ error: "Intenti nuk u gjet" }); return; }
  res.json(result);
});

export default router;
