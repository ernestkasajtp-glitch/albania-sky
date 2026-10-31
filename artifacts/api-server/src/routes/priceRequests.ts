import { Router, type IRouter } from "express";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import {
  db, priceChangeRequestsTable, bookingsTable,
  bookingUsersTable, priceRequestMessagesTable, bookingChangeLogsTable,
} from "@workspace/db";
import { getEffectivePermissions } from "./permissions";
import { roundWholeEuro, formatWholeEuro } from "../lib/money.js";

const router: IRouter = Router();
const FMS_ROLES = ["admin", "manager", "agent_staff"];

function requireFMS(req: any, res: any, next: any) {
  if (!req.session?.userId || !FMS_ROLES.includes(req.session.role || "")) {
    res.status(401).json({ error: "Jo i autentikuar" }); return;
  }
  next();
}
function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm admin" }); return; }
  next();
}

function serializeRequest(r: any) {
  return {
    ...r,
    currentAmount: Number(r.currentAmount),
    suggestedAmount: Number(r.suggestedAmount),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

router.post("/price-requests", requireFMS, async (req, res): Promise<void> => {
  const role = req.session.role!;
  if (role !== "admin") {
    const perms = await getEffectivePermissions(role);
    if (!perms.can_suggest_price) { res.status(403).json({ error: "Nuk keni leje për të sugjeruar çmim" }); return; }
  }

  const { bookingId, suggestedAmount: rawSuggestedAmount, note, requestType } = req.body;
  const suggestedAmount = roundWholeEuro(Number(rawSuggestedAmount));
  if (!bookingId || suggestedAmount == null) {
    res.status(400).json({ error: "bookingId dhe suggestedAmount nevojiten" }); return;
  }

  const reqType = requestType === "net" ? "net" : "sell";

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) { res.status(404).json({ error: "Rezervimi nuk u gjet" }); return; }
  if (booking.status === "cancelled") {
    res.status(409).json({ error: "Nuk mund të krijohet kërkesë për ndryshim çmimi për një rezervim të anuluar" }); return;
  }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
  if (!user) { res.status(401).json({ error: "Përdoruesi nuk u gjet" }); return; }

  const pendingConditions = [
    eq(priceChangeRequestsTable.bookingId, bookingId),
    eq(priceChangeRequestsTable.status, "pending"),
    eq(priceChangeRequestsTable.requestType, reqType),
  ];
  const pending = await db.select().from(priceChangeRequestsTable)
    .where(and(...pendingConditions));
  if (pending.length > 0) { res.status(409).json({ error: "Ekziston tashmë një kërkesë e papërgjigjur" }); return; }

  const currentAmount = reqType === "net"
    ? (booking.netPrice ?? booking.totalAmount)
    : booking.totalAmount;

  const [created] = await db.insert(priceChangeRequestsTable).values({
    bookingId,
    bookingRef: booking.bookingRef,
    requestedBy: req.session.userId!,
    requestedByName: user.name,
    currentAmount: String(roundWholeEuro(Number(currentAmount))),
    suggestedAmount: String(suggestedAmount),
    note: note || null,
    status: "pending",
    requestType: reqType,
    unreadByManager: false,
  }).returning();

  if (note) {
    await db.insert(priceRequestMessagesTable).values({
      requestId: created.id,
      authorId: req.session.userId!,
      authorName: user.name,
      authorRole: role,
      message: note,
    });
  }

  res.status(201).json(serializeRequest(created));
});

router.get("/price-requests", requireFMS, async (req, res): Promise<void> => {
  const rows = await db.select({
    pr: priceChangeRequestsTable,
    pnr: bookingsTable.pnr,
  }).from(priceChangeRequestsTable)
    .leftJoin(bookingsTable, eq(bookingsTable.id, priceChangeRequestsTable.bookingId))
    .orderBy(priceChangeRequestsTable.createdAt);

  const role = req.session.role!;
  const userId = req.session.userId!;

  const filtered = role === "admin"
    ? rows
    : rows.filter(r => r.pr.requestedBy === userId);

  res.json(filtered.map(r => ({ ...serializeRequest(r.pr), pnr: r.pnr })));
});

router.get("/price-requests/mine", requireFMS, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rows = await db.select().from(priceChangeRequestsTable)
    .where(eq(priceChangeRequestsTable.requestedBy, userId))
    .orderBy(priceChangeRequestsTable.createdAt);
  res.json(rows.map(serializeRequest));
});

router.get("/price-requests/for-booking/:bookingId", requireFMS, async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId);
  if (isNaN(bookingId)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }

  const rows = await db.select().from(priceChangeRequestsTable)
    .where(eq(priceChangeRequestsTable.bookingId, bookingId))
    .orderBy(priceChangeRequestsTable.createdAt);

  res.json(rows.map(serializeRequest));
});

router.get("/price-requests/pending-count", requireFMS, async (req, res): Promise<void> => {
  const role = req.session.role!;
  const userId = req.session.userId!;

  if (role === "admin") {
    const rows = await db.select().from(priceChangeRequestsTable)
      .where(eq(priceChangeRequestsTable.status, "pending"));
    res.json({ count: rows.length, isManagerUnread: false });
    return;
  }

  const myRows = await db.select().from(priceChangeRequestsTable)
    .where(eq(priceChangeRequestsTable.requestedBy, userId));
  const unread = myRows.filter(r => r.unreadByManager).length;
  res.json({ count: unread, isManagerUnread: true });
});

router.get("/price-requests/:id/messages", requireFMS, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }

  const [pr] = await db.select().from(priceChangeRequestsTable).where(eq(priceChangeRequestsTable.id, id));
  if (!pr) { res.status(404).json({ error: "Kërkesa nuk u gjet" }); return; }

  const role = req.session.role!;
  const userId = req.session.userId!;
  if (role !== "admin" && pr.requestedBy !== userId) {
    res.status(403).json({ error: "Nuk keni akses" }); return;
  }

  const messages = await db.select().from(priceRequestMessagesTable)
    .where(eq(priceRequestMessagesTable.requestId, id))
    .orderBy(priceRequestMessagesTable.createdAt);

  res.json({ request: serializeRequest(pr), messages: messages.map(m => ({
    ...m,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  })) });
});

router.post("/price-requests/:id/messages", requireFMS, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }

  const [pr] = await db.select().from(priceChangeRequestsTable).where(eq(priceChangeRequestsTable.id, id));
  if (!pr) { res.status(404).json({ error: "Kërkesa nuk u gjet" }); return; }

  const role = req.session.role!;
  const userId = req.session.userId!;
  if (role !== "admin" && pr.requestedBy !== userId) {
    res.status(403).json({ error: "Nuk keni akses" }); return;
  }

  const { message } = req.body;
  if (!message?.trim()) { res.status(400).json({ error: "Mesazhi nuk mund të jetë bosh" }); return; }

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, userId));
  if (!user) { res.status(401).json({ error: "Përdoruesi nuk u gjet" }); return; }

  const [msg] = await db.insert(priceRequestMessagesTable).values({
    requestId: id,
    authorId: userId,
    authorName: user.name,
    authorRole: role,
    message: message.trim(),
  }).returning();

  if (role === "admin") {
    await db.update(priceChangeRequestsTable)
      .set({ unreadByManager: true })
      .where(eq(priceChangeRequestsTable.id, id));
  }

  res.status(201).json({ ...msg, createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt });
});

router.post("/price-requests/:id/mark-read", requireFMS, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  const role = req.session.role!;
  const userId = req.session.userId!;
  if (role !== "admin") {
    // Scope te pronari — një jo-admin s'mund të prekë kërkesat e të tjerëve (IDOR).
    await db.update(priceChangeRequestsTable)
      .set({ unreadByManager: false })
      .where(and(eq(priceChangeRequestsTable.id, id), eq(priceChangeRequestsTable.requestedBy, userId)));
  }
  res.json({ success: true });
});

// Bulk shëno të lexuar / të palexuar — vetëm kërkesat e vetë përdoruesit.
// `all: true` → të gjitha kërkesat e mia; përndryshe kërkohet listë jo-bosh `ids`.
router.post("/price-requests/mark-read-bulk", requireFMS, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { ids, read, all } = req.body as { ids?: number[]; read?: boolean; all?: boolean };
  const wantRead = read !== false; // default: shëno të lexuar
  const idList = Array.isArray(ids) ? ids.filter(n => typeof n === "number" && !isNaN(n)) : [];

  if (all !== true && idList.length === 0) {
    res.status(400).json({ error: "Asnjë njoftim i zgjedhur" });
    return;
  }

  const cond = all === true
    ? eq(priceChangeRequestsTable.requestedBy, userId)
    : and(eq(priceChangeRequestsTable.requestedBy, userId), inArray(priceChangeRequestsTable.id, idList));

  await db.update(priceChangeRequestsTable)
    .set({ unreadByManager: !wantRead })
    .where(cond);

  res.json({ success: true });
});

router.post("/price-requests/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  const [pr] = await db.select().from(priceChangeRequestsTable).where(eq(priceChangeRequestsTable.id, id));
  if (!pr || pr.status !== "pending") {
    res.status(404).json({ error: "Kërkesa nuk u gjet ose është trajtuar" }); return;
  }

  let updated: any;
  let cancelledBooking = false;
  let unavailableRequest = false;

  await db.transaction(async tx => {
    // The cancellation flow updates this same row. Lock it before deciding so
    // a cancellation that wins the race cannot have its price changed later.
    const [booking] = await tx.select().from(bookingsTable)
      .where(eq(bookingsTable.id, pr.bookingId))
      .for("update");

    if (!booking) {
      unavailableRequest = true;
      return;
    }
    if (booking.status === "cancelled") {
      cancelledBooking = true;
      return;
    }

    // Re-check while holding the booking lock, since another reviewer may have
    // acted after the pre-transaction check above.
    const [pendingRequest] = await tx.select().from(priceChangeRequestsTable)
      .where(eq(priceChangeRequestsTable.id, id))
      .for("update");
    if (!pendingRequest || pendingRequest.status !== "pending") {
      unavailableRequest = true;
      return;
    }

    if (pendingRequest.requestType === "net") {
      await tx.update(bookingsTable).set({ netPrice: pendingRequest.suggestedAmount })
        .where(eq(bookingsTable.id, pendingRequest.bookingId));
    } else {
      await tx.update(bookingsTable).set({ totalAmount: pendingRequest.suggestedAmount })
        .where(eq(bookingsTable.id, pendingRequest.bookingId));
    }

    [updated] = await tx.update(priceChangeRequestsTable)
      .set({
        status: "approved",
        reviewedBy: req.session.userId!,
        reviewNote: req.body.reviewNote || null,
        unreadByManager: true,
      })
      .where(eq(priceChangeRequestsTable.id, id)).returning();
  });

  if (cancelledBooking) {
    res.status(409).json({ error: "Nuk mund të aprovohet kërkesa për ndryshim çmimi për një rezervim të anuluar" }); return;
  }
  if (unavailableRequest || !updated) {
    res.status(404).json({ error: "Kërkesa nuk u gjet ose është trajtuar" }); return;
  }

  const isNetPrice = pr.requestType === "net";

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
  const approveMsg = req.body.reviewNote
    ? `✅ Aprovuar: ${req.body.reviewNote}`
    : `✅ Kërkesa u aprovua. ${isNetPrice ? "Çmimi neto" : "Çmimi"} u ndryshua në €${formatWholeEuro(pr.suggestedAmount)}.`;

  await db.insert(priceRequestMessagesTable).values({
    requestId: id,
    authorId: req.session.userId!,
    authorName: user?.name || "Admin",
    authorRole: "admin",
    message: approveMsg,
  });

  const fieldLabel = isNetPrice ? "Çmimi neto" : "Çmimi total";
  db.insert(bookingChangeLogsTable).values({
    bookingId: pr.bookingId,
    userId: req.session.userId!,
    userName: user?.name || "Admin",
    userRole: "admin",
    action: "price_request_approved",
    fieldName: fieldLabel,
    oldValue: `€${formatWholeEuro(pr.currentAmount)}`,
    newValue: `€${formatWholeEuro(pr.suggestedAmount)}`,
    note: `Aprovim kërkese #${id}${req.body.reviewNote ? `: ${req.body.reviewNote}` : ""}`,
  }).catch(() => {});

  res.json(serializeRequest(updated));
});

router.post("/price-requests/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID e pavlefshme" }); return; }
  const [pr] = await db.select().from(priceChangeRequestsTable).where(eq(priceChangeRequestsTable.id, id));
  if (!pr || pr.status !== "pending") {
    res.status(404).json({ error: "Kërkesa nuk u gjet ose është trajtuar" }); return;
  }

  const [updated] = await db.update(priceChangeRequestsTable)
    .set({
      status: "rejected",
      reviewedBy: req.session.userId!,
      reviewNote: req.body.reviewNote || null,
      unreadByManager: true,
    })
    .where(eq(priceChangeRequestsTable.id, id)).returning();

  const [user] = await db.select().from(bookingUsersTable).where(eq(bookingUsersTable.id, req.session.userId!));
  await db.insert(priceRequestMessagesTable).values({
    requestId: id,
    authorId: req.session.userId!,
    authorName: user?.name || "Admin",
    authorRole: "admin",
    message: req.body.reviewNote
      ? `❌ Refuzuar: ${req.body.reviewNote}`
      : `❌ Kërkesa u refuzua.`,
  });

  res.json(serializeRequest(updated));
});

export default router;
