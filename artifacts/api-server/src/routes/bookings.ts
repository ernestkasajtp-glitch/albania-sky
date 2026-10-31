import { Router, type IRouter } from "express";
import { readFlightDiscount, applyFlightDiscount, discountForChannel } from "../lib/flightDiscounts";
import { bookingSaveVersion } from "../lib/bookingSaveVersion.js";
import { eq, sql, and, gte, lte, or, ilike, isNull, desc } from "drizzle-orm";
import { db, bookingsTable, flightsTable, passengersTable, paymentsTable, agentsTable, bookingExtrasTable, agentCreditTransactionsTable, bookingChangeLogsTable, priceChangeRequestsTable, groupTicketSalesTable, groupTicketsTable, bookingUsersTable, bookingCommentsTable, bookingEmailAlertsTable, paymentChangeLogsTable } from "@workspace/db";
import { validateManualPaymentMethod } from "../lib/manualPaymentMethod.js";
import { normalizeFirstName, normalizeLastName } from "../lib/nameFormat";
import { inArray } from "drizzle-orm";
import {
  ListBookingsQueryParams,
  QueryPremiumBookingsBody,
  CreateBookingBody,
  GetBookingParams,
  UpdateBookingParams,
  UpdateBookingBody,
  DeleteBookingParams,
  ConfirmBookingParams,
  CancelBookingParams,
  TicketBookingParams,
  UpdateBookingStatusParams,
  UpdateBookingStatusBody,
  UpdateBookingStatusResponse,
} from "@workspace/api-zod";
import { sendEmail, sendEmailStrict, bookingCreatedEmail, bookingUpdatedEmail, extraChangedEmail, agentBookingEmail, bookingSubject, cpRefOf } from "../lib/gmail.js";
import { generateBookingConfirmationPdf } from "../lib/invoicePdf.js";
import { sendPaymentInvoice } from "../lib/invoice.js";
import { scheduleExcelSync } from "../lib/excelSync.js";
import { checkDuplicatePassengerTask } from "../lib/dupPassengerCheck.js";
import { scheduleGSheetsSync } from "../lib/googleSheets.js";
import { verifyCancelPassword } from "./cancelPassword.js";
import { flipSoldOutIfFull } from "../lib/autoSoldOut.js";
import { recordSeatEvent } from "../lib/seatHistory.js";
import { triggerCpExportSoon } from "../lib/cpExport.js";
import { fetchWizzTicketForBooking, clearSavedWizzTicket } from "../lib/wizzTicket.js";
import { revertTicketedToConfirmed } from "../lib/ticketedRevert.js";
import { ticketStatusEmailSubject, ticketStatusRecipientSubject, type TicketedBookingChange } from "../lib/ticketUpdateEmail.js";
import { notifyDataChanged } from "../lib/liveEvents.js";
import { finalAgentDeliveryOutcome, persistEmailOutcomeWithRetry, statusEmailOutcomeNote, type StatusEmailOutcome as AgentEmailOutcome } from "../lib/statusEmailOutcome.js";
import { acquireTicketEmailSend, shouldKeepTicketEmailPending } from "../lib/ticketEmailDelivery.js";
import { logger } from "../lib/logger.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { roundWholeEuro, formatWholeEuro, wholeEuroDue, wholeEuroOverpay } from "../lib/money.js";
import { getPremiumBookingIndex } from "../lib/premiumBookingIndex.js";
import { premiumListResult } from "../lib/premiumBookingListLogic.js";
import { getBookingReadRevision } from "../lib/liveEvents.js";
import { getEffectivePermissions } from "./permissions.js";

const alertsUploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "alerts");

const router: IRouter = Router();

function generateRef(): string {
  const chars = "0123456789";
  let ref = "KTF";
  for (let i = 0; i < 4; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

const STATUS_LABELS: Record<string, string> = {
  draft:     "Draft",
  pending:   "Në Pritje",
  confirmed: "Konfirmuar",
  ticketed:  "Ticketed",
  cancelled: "Anulluar",
};

const BOOKING_FIELD_LABELS: Record<string, string> = {
  totalAmount:      "Çmimi total",
  netPrice:         "Çmimi neto",
  pnr:              "PNR",
  customerName:     "Emri i klientit",
  customerEmail:    "Email",
  customerPhone:    "Telefon",
  status:           "Statusi",
  notes:            "Shënime",
  markup:           "Markup",
  commission:       "Komision",
  commissionAmount: "Komisioni (€)",
  discount:         "Zbritja",
  agentId:          "Agjenti",
  flightId:         "Fluturimi",
  paidAmount:       "Shuma e Paguar",
};

function fmtMoney(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `€${formatWholeEuro(n)}`;
}

function fmtBookingFieldValue(field: string, v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Po" : "Jo";
  if (field === "status") return STATUS_LABELS[String(v)] ?? String(v);
  if (["totalAmount","netPrice","markup","commission","commissionAmount","discount","paidAmount"].includes(field)) {
    return fmtMoney(v);
  }
  return String(v);
}

async function logBookingChange(opts: {
  bookingId: number;
  userId?: number | null;
  userName?: string;
  userRole?: string | null;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}) {
  const [created] = await db.insert(bookingChangeLogsTable).values({
    bookingId: opts.bookingId,
    userId: opts.userId ?? null,
    userName: opts.userName ?? "System",
    userRole: opts.userRole ?? null,
    action: opts.action,
    fieldName: opts.fieldName ?? null,
    oldValue: opts.oldValue ?? null,
    newValue: opts.newValue ?? null,
    note: opts.note ?? null,
  }).returning({ id: bookingChangeLogsTable.id });
  return created.id;
}

export async function getFullBooking(id: number) {
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) return null;

  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId));
  const passengers = await db.select().from(passengersTable).where(eq(passengersTable.bookingId, id));
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
  const paxIds = passengers.map(p => p.id);
  const groupSales = paxIds.length > 0
    ? await db.select({
        bookingPassengerId: groupTicketSalesTable.bookingPassengerId,
        pnrNew: groupTicketSalesTable.pnrNew,
        pnrOriginal: groupTicketsTable.pnrOriginal,
        groupTicketId: groupTicketSalesTable.groupTicketId,
      })
      .from(groupTicketSalesTable)
      .leftJoin(groupTicketsTable, eq(groupTicketSalesTable.groupTicketId, groupTicketsTable.id))
      .where(inArray(groupTicketSalesTable.bookingPassengerId, paxIds))
      .orderBy(desc(groupTicketSalesTable.createdAt))
    : [];
  const groupPnrByPax = new Map<number, { pnr: string; groupTicketId: number | null }>();
  for (const s of groupSales) {
    if (s.bookingPassengerId == null) continue;
    const pnr = (s.pnrNew ?? "").trim() || (s.pnrOriginal ?? "").trim();
    if (!pnr) continue;
    if (!groupPnrByPax.has(s.bookingPassengerId)) {
      groupPnrByPax.set(s.bookingPassengerId, { pnr, groupTicketId: s.groupTicketId ?? null });
    }
  }
  const extras = await db.select().from(bookingExtrasTable).where(eq(bookingExtrasTable.bookingId, id));
  let agentName: string | null = null;
  if (booking.agentId) {
    const [agent] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.id, booking.agentId));
    agentName = agent?.name ?? null;
  }

  const formattedFlight = flight ? {
    ...flight,
    netPrice: undefined, // çmimi neto informativ i fluturimit — vetëm te lista e fluturimeve (admin)
    adultPrice: Number(flight.adultPrice),
    childPrice: Number(flight.childPrice),
    infantPrice: Number(flight.infantPrice),
    tax: Number(flight.tax),
    cabinBaggageKg: flight.cabinBaggageKg != null ? Number(flight.cabinBaggageKg) : null,
    checkedBaggageKg: flight.checkedBaggageKg != null ? Number(flight.checkedBaggageKg) : null,
    checkedBaggagePrice: flight.checkedBaggagePrice != null ? Number(flight.checkedBaggagePrice) : null,
    seatSelectionPrice: flight.seatSelectionPrice != null ? Number(flight.seatSelectionPrice) : null,
    priorityBoardingPrice: flight.priorityBoardingPrice != null ? Number(flight.priorityBoardingPrice) : null,
    insurancePrice: flight.insurancePrice != null ? Number(flight.insurancePrice) : null,
    availableSeats: flight.totalSeats - flight.soldSeats,
    createdAt: flight.createdAt.toISOString(),
    updatedAt: flight.updatedAt.toISOString(),
  } : null;

  const totalPaid = payments
    .filter(p => p.status === "completed" && !p.isRefund)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const totalRefunded = payments
    .filter(p => p.status === "completed" && p.isRefund)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const rawPaid = Math.max(0, totalPaid - totalRefunded);
  const totalAmount = Number(booking.totalAmount);
  const paidAmount = Math.min(rawPaid, totalAmount);
  const dueAmount = wholeEuroDue(totalAmount, rawPaid);
  const creditAmount = Math.max(0, rawPaid - totalAmount);

  return {
    ...booking,
    saveVersion: bookingSaveVersion(booking, passengers, payments, extras),
    totalAmount,
    paidAmount,
    dueAmount,
    creditAmount,
    markup: Number(booking.markup),
    commission: Number(booking.commission),
    discount: Number((booking as any).discount ?? 0),
    pnr: booking.pnr ?? null,
    netPrice: booking.netPrice != null ? Number(booking.netPrice) : null,
    totalNetPrice: booking.netPrice != null ? Number(booking.netPrice) : null,
    commissionAmount: booking.netPrice != null
      ? (Number(booking.netPrice) <= 0 ? 0 : Math.round((totalAmount - Number(booking.netPrice)) * 100) / 100)
      : null,
    agentName,
    flight: formattedFlight,
    passengers: passengers.map(p => ({
      ...p,
      extraCost: Number(p.extraCost),
      ticketPrice: p.ticketPrice != null ? Number(p.ticketPrice) : null,
      createdAt: p.createdAt.toISOString(),
      groupPnr: groupPnrByPax.get(p.id)?.pnr ?? null,
      groupTicketId: groupPnrByPax.get(p.id)?.groupTicketId ?? null,
    })),
    payments: payments.map(p => ({
      ...p,
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString(),
    })),
    extras: extras.map(e => ({
      ...e,
      amount: Number(e.amount),
      createdAt: e.createdAt.toISOString(),
    })),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

// Fetches full booking data for multiple bookings in ~7 queries instead of N×6.
// Returns the same shape as the single getFullBooking above.
export async function getBatchFullBookings(bookings: (typeof bookingsTable.$inferSelect)[]) {
  if (bookings.length === 0) return [];

  const bookingIds = bookings.map(b => b.id);
  const flightIds  = [...new Set(bookings.map(b => b.flightId))];
  const agentIds   = [...new Set(bookings.flatMap(b => b.agentId != null ? [b.agentId] : []))];

  const [flights, allPassengers, allPayments, allExtras, agents] = await Promise.all([
    db.select().from(flightsTable).where(inArray(flightsTable.id, flightIds)),
    db.select().from(passengersTable).where(inArray(passengersTable.bookingId, bookingIds)),
    db.select().from(paymentsTable).where(inArray(paymentsTable.bookingId, bookingIds)),
    db.select().from(bookingExtrasTable).where(inArray(bookingExtrasTable.bookingId, bookingIds)),
    agentIds.length > 0
      ? db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable).where(inArray(agentsTable.id, agentIds))
      : ([] as { id: number; name: string }[]),
  ]);

  const flightMap = new Map(flights.map(f => [f.id, f]));
  const agentMap  = new Map(agents.map(a => [a.id, a.name]));

  const passByBooking = new Map<number, typeof allPassengers>();
  const payByBooking  = new Map<number, typeof allPayments>();
  const extByBooking  = new Map<number, typeof allExtras>();
  for (const p of allPassengers) { const a = passByBooking.get(p.bookingId) ?? []; a.push(p); passByBooking.set(p.bookingId, a); }
  for (const p of allPayments)   { const a = payByBooking.get(p.bookingId)  ?? []; a.push(p); payByBooking.set(p.bookingId, a); }
  for (const e of allExtras)     { const a = extByBooking.get(e.bookingId)  ?? []; a.push(e); extByBooking.set(e.bookingId, a); }

  // Group ticket PNRs — one batch query for all passengers across all bookings
  const allPaxIds = allPassengers.map(p => p.id);
  const groupSales = allPaxIds.length > 0
    ? await db.select({
        bookingPassengerId: groupTicketSalesTable.bookingPassengerId,
        pnrNew:             groupTicketSalesTable.pnrNew,
        pnrOriginal:        groupTicketsTable.pnrOriginal,
        groupTicketId:      groupTicketSalesTable.groupTicketId,
      })
      .from(groupTicketSalesTable)
      .leftJoin(groupTicketsTable, eq(groupTicketSalesTable.groupTicketId, groupTicketsTable.id))
      .where(inArray(groupTicketSalesTable.bookingPassengerId, allPaxIds))
      .orderBy(desc(groupTicketSalesTable.createdAt))
    : ([] as { bookingPassengerId: number | null; pnrNew: string | null; pnrOriginal: string | null; groupTicketId: number | null }[]);

  const groupPnrByPax = new Map<number, { pnr: string; groupTicketId: number | null }>();
  for (const s of groupSales) {
    if (s.bookingPassengerId == null) continue;
    const pnr = (s.pnrNew ?? "").trim() || (s.pnrOriginal ?? "").trim();
    if (!pnr || groupPnrByPax.has(s.bookingPassengerId)) continue;
    groupPnrByPax.set(s.bookingPassengerId, { pnr, groupTicketId: s.groupTicketId ?? null });
  }

  return bookings.map(booking => {
    const flight     = flightMap.get(booking.flightId) ?? null;
    const passengers = passByBooking.get(booking.id) ?? [];
    const payments   = payByBooking.get(booking.id)  ?? [];
    const extras     = extByBooking.get(booking.id)  ?? [];
    const agentName  = booking.agentId != null ? (agentMap.get(booking.agentId) ?? null) : null;

    const formattedFlight = flight ? {
      ...flight,
      netPrice:              undefined, // çmimi neto informativ — vetëm te lista e fluturimeve (admin)
      adultPrice:            Number(flight.adultPrice),
      childPrice:            Number(flight.childPrice),
      infantPrice:           Number(flight.infantPrice),
      tax:                   Number(flight.tax),
      cabinBaggageKg:        flight.cabinBaggageKg        != null ? Number(flight.cabinBaggageKg)        : null,
      checkedBaggageKg:      flight.checkedBaggageKg      != null ? Number(flight.checkedBaggageKg)      : null,
      checkedBaggagePrice:   flight.checkedBaggagePrice   != null ? Number(flight.checkedBaggagePrice)   : null,
      seatSelectionPrice:    flight.seatSelectionPrice    != null ? Number(flight.seatSelectionPrice)    : null,
      priorityBoardingPrice: flight.priorityBoardingPrice != null ? Number(flight.priorityBoardingPrice) : null,
      insurancePrice:        flight.insurancePrice        != null ? Number(flight.insurancePrice)        : null,
      availableSeats:        flight.totalSeats - flight.soldSeats,
      createdAt:             flight.createdAt.toISOString(),
      updatedAt:             flight.updatedAt.toISOString(),
    } : null;

    const totalPaid     = payments.filter(p => p.status === "completed" && !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
    const totalRefunded = payments.filter(p => p.status === "completed" &&  p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
    const rawPaid       = Math.max(0, totalPaid - totalRefunded);
    const totalAmount   = Number(booking.totalAmount);
    const paidAmount    = Math.min(rawPaid, totalAmount);
    const dueAmount     = wholeEuroDue(totalAmount, rawPaid);
    const creditAmount  = Math.max(0, rawPaid - totalAmount);

    return {
      ...booking,
      totalAmount,
      paidAmount,
      dueAmount,
      creditAmount,
      markup:           Number(booking.markup),
      commission:       Number(booking.commission),
      discount:         Number((booking as any).discount ?? 0),
      pnr:              booking.pnr ?? null,
      netPrice:         booking.netPrice != null ? Number(booking.netPrice) : null,
      totalNetPrice:    booking.netPrice != null ? Number(booking.netPrice) : null,
      commissionAmount: booking.netPrice != null
        ? (Number(booking.netPrice) <= 0 ? 0 : Math.round((totalAmount - Number(booking.netPrice)) * 100) / 100)
        : null,
      agentName,
      flight: formattedFlight,
      passengers: passengers.map(p => ({
        ...p,
        extraCost:     Number(p.extraCost),
        ticketPrice:   p.ticketPrice != null ? Number(p.ticketPrice) : null,
        createdAt:     p.createdAt.toISOString(),
        groupPnr:      groupPnrByPax.get(p.id)?.pnr ?? null,
        groupTicketId: groupPnrByPax.get(p.id)?.groupTicketId ?? null,
      })),
      payments: payments.map(p => ({
        ...p,
        amount:    Number(p.amount),
        createdAt: p.createdAt.toISOString(),
      })),
      extras: extras.map(e => ({
        ...e,
        amount:    Number(e.amount),
        createdAt: e.createdAt.toISOString(),
      })),
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  });
}

// Read-only POST avoids long search URLs. It deliberately does not match the
// /bookings write-notification middleware. Mounted behind the existing FMS gate.
router.post("/booking-list/query", async (req, res): Promise<void> => {
  const parsed = QueryPremiumBookingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Filtra të pavlefshëm." }); return; }
  const q = parsed.data;
  try {
    new Intl.DateTimeFormat(q.locale, { timeZone: q.timeZone });
    for (const date of [q.dateFrom, q.dateTo, q.flightDateFrom, q.flightDateTo]) {
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date");
    }
  } catch { res.status(400).json({ error: "Datë ose zonë kohore e pavlefshme." }); return; }
  const session = (req as any).session;
  const isAdmin = session?.role === "admin";
  if (q.exportAll && !isAdmin) {
    const permissions = await getEffectivePermissions(session.role, session.userId);
    if (!permissions.can_export_bookings) {
      res.status(403).json({ error: "Nuk ke leje për eksportimin e rezervimeve." }); return;
    }
  }
  res.setHeader("Cache-Control", "private, no-store");
  for (let attempt = 0; attempt < 2; attempt++) {
    const revision = getBookingReadRevision();
    const index = await getPremiumBookingIndex();
    const { ids, ...summary } = premiumListResult(index, q, isAdmin);
    // Hydrate only the requested page. Export uses the same filter/order, on demand.
    const records = ids.length ? await db.select().from(bookingsTable).where(inArray(bookingsTable.id, ids)) : [];
    const byId = new Map(records.map(record => [record.id, record]));
    const ordered = ids.flatMap(id => { const record = byId.get(id); return record ? [record] : []; });
    const items = await getBatchFullBookings(ordered);
    await attachBookingListMetadata(items);
    if (getBookingReadRevision() !== revision || records.length !== ids.length) continue;
    res.json({ ...summary, items });
    return;
  }
  res.status(503).json({ error: "Rezervimet po përditësohen. Provo përsëri." });
});

// Same FMS authentication and visibility as GET /bookings?status=draft.
// Keep this static route ahead of /bookings/:id. No related records are loaded.
router.get("/bookings/draft-count", async (_req, res): Promise<void> => {
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "draft"));
  res.json({ count: row.count });
});

router.get("/bookings", async (req, res): Promise<void> => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let query = db.select().from(bookingsTable).$dynamic();

  const conditions: any[] = [];
  if (parsed.data.status) conditions.push(eq(bookingsTable.status, parsed.data.status));
  if (parsed.data.flightId) conditions.push(eq(bookingsTable.flightId, parsed.data.flightId));
  if (parsed.data.agentId) conditions.push(eq(bookingsTable.agentId, parsed.data.agentId));

  // Extra: noAgent=1 → only direct-client bookings (agentId IS NULL)
  if (req.query.noAgent === "1") conditions.push(isNull(bookingsTable.agentId));

  // Extra: createdFrom=YYYY-MM-DD → vetëm rezervimet e krijuara nga kjo datë
  // (ditë kalendarike Europe/Tirane). Përdoret nga lista e adminit për të
  // ngarkuar fillimisht vetëm rezervimet e sotme (ngarkim i shpejtë).
  const createdFromRaw = String(req.query.createdFrom ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(createdFromRaw)) {
    // Sargable: krahasim direkt me kufirin e mesnatës Tirane (përdor indeksin idx_bookings_created_at)
    conditions.push(sql`${bookingsTable.createdAt} >= (${createdFromRaw}::timestamp AT TIME ZONE 'Europe/Tirane')`);
  }

  // Extra: search by customer name or booking ref
  const searchTerm = String(req.query.search ?? "").trim();
  if (searchTerm) {
    conditions.push(or(
      ilike(bookingsTable.customerName, `%${searchTerm}%`),
      ilike(bookingsTable.bookingRef, `%${searchTerm}%`),
      ilike(bookingsTable.customerEmail, `%${searchTerm}%`),
    ));
  }

  if (conditions.length > 0) query = query.where(and(...conditions));

  // Extra: limit=N → kthen vetëm N rezervimet më të fundit (për ngarkim të shpejtë
  // të listës në admin). Pa parametër sillet ekzaktësisht si më parë (të gjitha).
  const limitRaw = Number(req.query.limit ?? 0);
  const limitN = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 0;
  if (limitN > 0) query = query.limit(limitN);

  const bookings = await query.orderBy(desc(bookingsTable.createdAt));

  const validBookings = (await getBatchFullBookings(bookings)) as any[];
  await attachBookingListMetadata(validBookings);
  res.json(validBookings);
});

export async function attachBookingListMetadata(validBookings: any[]): Promise<void> {
  // Attach pending price requests count for each booking
  if (validBookings.length > 0) {
    // Kufizo pyetjet anësore vetëm te ID-të e listuara (shpejtësi — mos skano gjithë tabelat)
    const listedIds = validBookings.map((b: any) => b.id);
    const pendingReqs = await db.select().from(priceChangeRequestsTable)
      .where(and(eq(priceChangeRequestsTable.status, "pending"), inArray(priceChangeRequestsTable.bookingId, listedIds)));
    const pendingByBooking = new Map<number, number>();
    for (const r of pendingReqs) pendingByBooking.set(r.bookingId, (pendingByBooking.get(r.bookingId) ?? 0) + 1);
    for (const b of validBookings) b.pendingPriceRequests = pendingByBooking.get(b.id) ?? 0;

    // Attach comments (Shënime) count for each booking — extra additive field
    const commentCounts = await db.select({
      bookingId: bookingCommentsTable.bookingId,
      cnt: sql<number>`count(*)::int`,
    }).from(bookingCommentsTable)
      .where(inArray(bookingCommentsTable.bookingId, listedIds))
      .groupBy(bookingCommentsTable.bookingId);
    const commentsByBooking = new Map<number, number>();
    for (const r of commentCounts) commentsByBooking.set(r.bookingId, Number(r.cnt));
    for (const b of validBookings) b.commentsCount = commentsByBooking.get(b.id) ?? 0;

    // Njoftimet e ndryshimit të fluturimit nga email-i (alarmi i kuq në listë)
    // Numërohen VETËM të palexuarat — pas "Shëno si të lexuar" alarmi hiqet
    // derisa të vijë një email i ri (rresht i ri i palexuar).
    const alertCounts = await db.select({
      bookingId: bookingEmailAlertsTable.bookingId,
      cnt: sql<number>`count(*)::int`,
    }).from(bookingEmailAlertsTable)
      .where(and(isNull(bookingEmailAlertsTable.readAt), inArray(bookingEmailAlertsTable.bookingId, listedIds)))
      .groupBy(bookingEmailAlertsTable.bookingId);
    const alertsByBooking = new Map<number, number>();
    for (const r of alertCounts) alertsByBooking.set(r.bookingId, Number(r.cnt));
    for (const b of validBookings) b.emailAlertsCount = alertsByBooking.get(b.id) ?? 0;
  }

}

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { passengers: passengerData, ...bookingData } = parsed.data;

  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, bookingData.flightId));
  if (!flight) {
    res.status(404).json({ error: "Flight not found" });
    return;
  }

  // Block booking if no seats available (infants don't occupy seats)
  const nonInfantPassengers = passengerData.filter(p => p.type !== "infant").length;
  const availableSeats = flight.totalSeats - flight.soldSeats;
  if (nonInfantPassengers > availableSeats) {
    res.status(400).json({ error: `Nuk ka vende të mjaftueshme. Disponueshme: ${availableSeats}, kërkuar: ${nonInfantPassengers}` });
    return;
  }

  const passengerCount = { adult: 0, child: 0, infant: 0 };
  let extraCostTotal = 0;

  for (const p of passengerData) {
    const type = (p.type ?? "adult") as "adult" | "child" | "infant";
    passengerCount[type] = (passengerCount[type] ?? 0) + 1;

    let extraCost = 0;
    if (p.baggageOption === "checked" && flight.checkedBaggagePrice) extraCost += Number(flight.checkedBaggagePrice);
    if (p.hasSeatSelection && flight.seatSelectionPrice) extraCost += Number(flight.seatSelectionPrice);
    if (p.hasPriorityBoarding && flight.priorityBoardingPrice) extraCost += Number(flight.priorityBoardingPrice);
    if (p.hasInsurance && flight.insurancePrice) extraCost += Number(flight.insurancePrice);
    extraCostTotal += extraCost;
  }

  const tax = Number(flight.tax);
  const commission = Number(bookingData.commission ?? 0);
  const manualDiscount = Math.max(0, Number(bookingData.discount ?? 0));
  // Per-person markup (seeded from the agent profile on the form, editable by admin).
  const perPersonMarkup = Math.max(0, Number(bookingData.markup ?? 0));

  // Agent flat discount + percentage markup, applied PER PERSON and folded into each price.
  let agentDiscountType = "percent";
  let agentDiscountPct = 0;
  let agentDiscountFixed = 0;
  let agentMarkupPct = 0;
  if (bookingData.agentId) {
    const [agentRec] = await db.select({
      discountPercent: agentsTable.discountPercent,
      discountType:    agentsTable.discountType,
      discountFixed:   agentsTable.discountFixed,
      markupPercent:   agentsTable.markupPercent,
    }).from(agentsTable).where(eq(agentsTable.id, bookingData.agentId));
    if (agentRec) {
      agentDiscountType = agentRec.discountType ?? "percent";
      agentDiscountPct = Number(agentRec.discountPercent ?? 0);
      agentDiscountFixed = Number(agentRec.discountFixed ?? 0);
      agentMarkupPct = Number(agentRec.markupPercent ?? 0);
    }
  }

  // Per-passenger markup amount = flat € markup (from the form) + percentage margin of base.
  const paxMarkupAmount = (base: number): number =>
    perPersonMarkup + (agentMarkupPct > 0 ? base * (agentMarkupPct / 100) : 0);

  // Effective per-passenger price: discount + markup (flat € + %) folded in. An admin
  // per-pax override is FINAL — no discount/markup is applied to a typed price.
  const effPaxPrice = (base: number): number => {
    let p = base;
    if (agentDiscountType === "fixed" && agentDiscountFixed > 0) p = Math.max(0, base - agentDiscountFixed);
    else if (agentDiscountPct > 0) p = base * (1 - agentDiscountPct / 100);
    return roundWholeEuro(Math.max(0, p + paxMarkupAmount(base)));
  };

  const flightDiscount = discountForChannel(await readFlightDiscount(flight.id), bookingData.agentId ? "agents" : "public");
  let ticketTotal = 0;
  let nonOverrideCount = 0;
  let markupAccum = 0;
  for (const p of passengerData) {
    const t = (p.type ?? "adult") as "adult" | "child" | "infant";
    const base = t === "child" ? Number(flight.childPrice)
      : t === "infant" ? Number(flight.infantPrice)
      : Number(flight.adultPrice);
    const ov = (p as any).ticketPrice;
    const hasOverride = ov != null && ov !== "" && !Number.isNaN(Number(ov));
    if (hasOverride) {
      ticketTotal += applyFlightDiscount(roundWholeEuro(Number(ov)), flightDiscount);
    } else {
      ticketTotal += applyFlightDiscount(effPaxPrice(base), flightDiscount);
      markupAccum += paxMarkupAmount(base);
      nonOverrideCount++;
    }
  }

  // booking.markup kept ONLY for reporting (commission fallback); equals the markup already
  // folded into the per-passenger prices (flat € + %), so it is NEVER re-added to the total.
  const bookingMarkup = roundWholeEuro(markupAccum);
  const totalAmount = roundWholeEuro(ticketTotal - manualDiscount + tax + extraCostTotal);

  let bookingRef = generateRef();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.bookingRef, bookingRef));
    if (existing.length === 0) break;
    bookingRef = generateRef();
    attempts++;
  }

  const [booking] = await db.insert(bookingsTable).values({
    bookingRef,
    flightId: bookingData.flightId,
    agentId: bookingData.agentId ?? null,
    customerName: bookingData.customerName,
    customerEmail: bookingData.customerEmail ?? null,
    customerPhone: bookingData.customerPhone ?? null,
    status: "draft",
    totalAmount: String(totalAmount),
    paidAmount: "0",
    markup: String(bookingMarkup),
    commission: String(commission),
    discount: String(manualDiscount),
    notes: bookingData.notes ?? null,
  }).returning();

  for (const p of passengerData) {
    const paxType = (p.type ?? "adult") as "adult" | "child" | "infant";
    const basePrice = paxType === "child"
      ? Number(flight.childPrice)
      : paxType === "infant"
        ? Number(flight.infantPrice)
        : Number(flight.adultPrice);
    const overrideRaw = (p as any).ticketPrice;
    const paxTicketPrice = (overrideRaw != null && overrideRaw !== "" && !Number.isNaN(Number(overrideRaw)))
      ? Number(overrideRaw)
      : effPaxPrice(basePrice);

    let extraCost = 0;
    if (p.baggageOption === "checked" && flight.checkedBaggagePrice) extraCost += Number(flight.checkedBaggagePrice);
    if (p.hasSeatSelection && flight.seatSelectionPrice) extraCost += Number(flight.seatSelectionPrice);
    if (p.hasPriorityBoarding && flight.priorityBoardingPrice) extraCost += Number(flight.priorityBoardingPrice);
    if (p.hasInsurance && flight.insurancePrice) extraCost += Number(flight.insurancePrice);

    await db.insert(passengersTable).values({
      bookingId: booking.id,
      type: paxType,
      firstName: normalizeFirstName(p.firstName),
      lastName: normalizeLastName(p.lastName),
      dateOfBirth: p.dateOfBirth ?? null,
      nationality: p.nationality ?? null,
      passportNumber: p.passportNumber ?? null,
      passportExpiry: p.passportExpiry ?? null,
      seatNumber: p.seatNumber ?? null,
      baggageOption: p.baggageOption ?? null,
      hasSeatSelection: p.hasSeatSelection ?? false,
      hasPriorityBoarding: p.hasPriorityBoarding ?? false,
      hasInsurance: p.hasInsurance ?? false,
      extraCost: String(extraCost),
      ticketPrice: String(roundWholeEuro(applyFlightDiscount(roundWholeEuro(paxTicketPrice), flightDiscount))),
    });
  }

  const totalPassengers = passengerData.filter(p => p.type !== "infant").length;
  await db.update(flightsTable)
    .set({ soldSeats: sql`${flightsTable.soldSeats} + ${totalPassengers}` })
    .where(eq(flightsTable.id, bookingData.flightId));
  await flipSoldOutIfFull(bookingData.flightId);
  if (totalPassengers > 0) {
    void recordSeatEvent({ flightId: bookingData.flightId, type: "sold", seats: totalPassengers, req, note: `Rezervim ${bookingRef}` });
  }
  // A sale lowers available seats — push the updated flight list to CitizenPlane
  // immediately (debounced) instead of waiting for the 30-min cron.
  triggerCpExportSoon();

  const full = await getFullBooking(booking.id);
  res.status(201).json(full);

  // Kontroll automatik: pasagjer i dyfishtë në fluturim identik → task automatik.
  void checkDuplicatePassengerTask(booking.id);

  (async () => {
    const u = {
      userId: (req as any).session?.userId ?? null,
      userName: (req as any).session?.userName ?? "Staff",
      userRole: (req as any).session?.role ?? null,
    };
    const flightLabel = full?.flight
      ? `${full.flight.airline} ${full.flight.fromCity}→${full.flight.toCity} (${String(full.flight.departureDate).slice(0,10)})`
      : `#${bookingData.flightId}`;
    let agentLabel = "—";
    if (bookingData.agentId) {
      const [a] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.id, bookingData.agentId));
      agentLabel = a?.name ?? `#${bookingData.agentId}`;
    }
    const statusEventId = await logBookingChange({
      bookingId: booking.id, ...u,
      action: "created",
      newValue: String(booking.status),
      note: `Rezervim i krijuar: ${bookingRef} — ${bookingData.customerName} | Fluturim: ${flightLabel} | Agjent: ${agentLabel} | Pasagjerë: ${passengerData.length} | Total: €${Math.round(Number(booking.totalAmount))}`,
    });
    if (full) void sendAgentStatusEmail(full, "draft", statusEventId);
    for (const p of passengerData) {
      await logBookingChange({
        bookingId: booking.id, ...u,
        action: "passenger_added",
        fieldName: `Pasagjer ${p.type === "child" ? "Fëmijë" : p.type === "infant" ? "Foshnjë" : "I rritur"}`,
        newValue: `${p.firstName} ${p.lastName}${p.passportNumber ? " — Pasaportë " + p.passportNumber : ""}`,
      });
    }
  })().catch(() => {});

  // Send notification email (non-blocking)
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo && full) {
    // Subjekti: "NEW BOOKING <N> PAX <FROM> <TO> <DD> <Month>"
    const subject = bookingSubject("NEW BOOKING", full, "en");
    sendEmail(notifyTo, subject, bookingCreatedEmail(full));
  }
  scheduleExcelSync();
  scheduleGSheetsSync();
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const full = await getFullBooking(params.data.id);
  if (!full) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(full);
});

// ─── Lookup booking by reference (e.g. KFTLP8G3A) → returns { id } ─────────
router.get("/bookings/by-ref/:ref", async (req, res): Promise<void> => {
  const ref = String(req.params.ref || "").trim();
  if (!ref) { res.status(400).json({ error: "Missing ref" }); return; }
  const rows = await db.select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(eq(bookingsTable.bookingRef, ref))
    .limit(1);
  if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: rows[0].id });
});

router.patch("/bookings/:id", async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { pnr, netPrice, totalAmount: tA, discount: discountInput, ...rest } = parsed.data;
  const normalizedNetPrice = netPrice == null ? netPrice : roundWholeEuro(Number(netPrice));
  const normalizedTotalAmount = tA == null ? tA : roundWholeEuro(Number(tA));
  const normalizedDiscount = discountInput == null ? discountInput : roundWholeEuro(Number(discountInput));
  const normalizedMarkup = (rest as any).markup == null ? (rest as any).markup : roundWholeEuro(Number((rest as any).markup));
  if (normalizedMarkup !== undefined) (rest as any).markup = normalizedMarkup;
  const skipBalanceAdjustment = req.body.skipBalanceAdjustment === true;

  // Cancellation must always pass through PATCH /bookings/:id/cancel. That
  // dedicated transaction releases only active adult/child seats (never
  // infants), records seat history, and handles any cancellation credit.
  // Allowing a plain status PATCH here silently skipped all of those invariants.
  if ((rest as any).status === "cancelled") {
    res.status(409).json({
      error: "Përdor veprimin “Anulo Rezervimin” që vendet të rikthehen saktë.",
    });
    return;
  }

  // Always fetch current booking first (needed for old values + refund logic)
  let [currentBooking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!currentBooking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (currentBooking.status === "cancelled" && (rest as any).status !== undefined && (rest as any).status !== "cancelled") {
    res.status(409).json({ error: "Rezervimi i anuluar mund të rikthehet vetëm me veprimin “Rikthe”." });
    return;
  }

  // Rezervimi i anuluar është financiarisht i ngrirë: korrigjimet e totalit,
  // çmimit neto ose uljes mund të prodhojnë kredit të dytë pas rimbursimit të anulimit.
  if (currentBooking.status === "cancelled" && (
    tA !== undefined ||
    netPrice !== undefined ||
    discountInput !== undefined ||
    "markup" in rest
  )) {
    res.status(409).json({
      error: "Rezervimi është i anuluar. Vlerat e shitjes dhe çmimit nuk mund të ndryshohen.",
    });
    return;
  }

  // --- Bllokim: ndryshimi i agjencisë kur rezervimi ka pagesa të kryera ---
  // Nëse për këtë rezervim ka pagesa neto > 0 (pagesa të kompletuara minus
  // rimbursimet), nuk lejohet të ndryshohet agjencia (agentId). Fillimisht
  // duhet të rregullohen pagesat (fshirje ose rimbursim), pastaj rezervimi
  // mund t'i kalojë një agjencie tjetër.
  if ((rest as any).agentId !== undefined) {
    const newAgentId = (rest as any).agentId ?? null;
    const oldAgentId = currentBooking.agentId ?? null;
    if (newAgentId !== oldAgentId) {
      const bookingPayments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, params.data.id));
      const netPaid = bookingPayments
        .filter(p => p.status === "completed")
        .reduce((s, p) => s + (p.isRefund ? -1 : 1) * Number(p.amount), 0);
      if (netPaid > 0) {
        res.status(400).json({
          error: `Ky rezervim ka pagesa të kryera (€${formatWholeEuro(netPaid)}). Nuk mund të ndryshohet agjencia pa u rregulluar fillimisht pagesat — fshini ose rimbursoni pagesat ekzistuese, pastaj kalojeni rezervimin te agjencia tjetër.`,
        });
        return;
      }
    }
  }

  // Net price (çmim neto) direct edit gate: only admin OR a user explicitly
  // granted `can_edit_booking_net_price` may change it directly. Everyone else
  // must go through the price-request/approval flow.
  if (normalizedNetPrice !== undefined) {
    const oldNet = currentBooking.netPrice != null ? Number(currentBooking.netPrice) : null;
    const newNet = normalizedNetPrice != null ? Number(normalizedNetPrice) : null;
    if (oldNet !== newNet) {
      const role = (req as any).session?.role;
      if (role !== "admin") {
        const { getEffectivePermissions } = await import("./permissions");
        const perms = await getEffectivePermissions(role, (req as any).session?.userId);
        if (!perms["can_edit_booking_net_price"]) {
          res.status(403).json({ error: "Nuk keni leje për të korrigjuar çmimin neto. Krijoni një kërkesë për aprovim." });
          return;
        }
      }
    }
  }

  const hasFinancialChange =
    tA !== undefined ||
    netPrice !== undefined ||
    discountInput !== undefined ||
    "markup" in rest;

  // If discount changes and totalAmount is NOT explicitly provided, the
  // transaction below recomputes totalAmount from the locked booking row.
  let derivedTotalFromDiscount: number | undefined;
  let effectiveTA: number | undefined = normalizedTotalAmount;
  const bookingUpdate = () => ({
    ...rest,
    ...((rest as any).status !== undefined && (rest as any).status !== "ticketed"
      ? { ticketEmailPending: false, ticketEmailSentAt: null }
      : {}),
    ...(pnr !== undefined ? { pnr: pnr ?? null } : {}),
    ...(normalizedNetPrice !== undefined ? { netPrice: normalizedNetPrice != null ? String(normalizedNetPrice) : null } : {}),
    ...(normalizedDiscount !== undefined ? { discount: String(Math.max(0, Number(normalizedDiscount))) } : {}),
    ...(effectiveTA !== undefined ? { totalAmount: String(effectiveTA) } : {}),
  } as any);

  if (hasFinancialChange) {
    const financialResult = await db.transaction(async tx => {
      const [lockedBooking] = await tx.select().from(bookingsTable)
        .where(eq(bookingsTable.id, params.data.id))
        .for("update");
      if (!lockedBooking) return "not_found" as const;
      if (lockedBooking.status === "cancelled") return "cancelled" as const;

      currentBooking = lockedBooking;
      if (discountInput !== undefined && tA === undefined) {
        const oldDiscount = Number((lockedBooking as any).discount ?? 0);
        const newDiscount = Math.max(0, Number(discountInput));
        const delta = newDiscount - oldDiscount;
        if (delta !== 0) {
          derivedTotalFromDiscount = Math.max(0, Math.round((Number(lockedBooking.totalAmount) - delta) * 100) / 100);
        }
      }
      effectiveTA = tA !== undefined ? tA : derivedTotalFromDiscount;

      // Price reduction and every resulting ledger effect are committed with
      // the new total while cancellation is excluded by the booking row lock.
      if (effectiveTA !== undefined && !skipBalanceAdjustment) {
        const oldTotal = Number(lockedBooking.totalAmount);
        const newTotal = Number(effectiveTA);
        if (newTotal < oldTotal && lockedBooking.agentId) {
          const payments = await tx.select().from(paymentsTable).where(eq(paymentsTable.bookingId, params.data.id));
          const paidAmount = payments
            .filter(p => p.status === "completed")
            .reduce((s, p) => s + (p.isRefund ? -1 : 1) * Number(p.amount), 0);
          if (paidAmount > newTotal) {
            const refundAmt = Math.round((paidAmount - newTotal) * 100) / 100;
            const refundNote = `Ulje çmimi: €${formatWholeEuro(oldTotal)} → €${formatWholeEuro(newTotal)} (paguar €${formatWholeEuro(paidAmount)})`;
            const [priceDropRefund] = await tx.insert(paymentsTable).values({
              bookingId: params.data.id,
              amount: String(refundAmt),
              method: "credit",
              reference: null,
              notes: refundNote,
              status: "completed",
              isRefund: true,
            }).returning();
            await tx.insert(paymentChangeLogsTable).values({
              paymentId: priceDropRefund.id,
              userId: (req as any).session?.userId ?? null,
              userName: (req as any).session?.userName ?? "System",
              userRole: (req as any).session?.role ?? null,
              action: "created",
              newValue: `Rimbursim automatik €${formatWholeEuro(refundAmt)} (ulje çmimi)`,
              note: refundNote,
            });

            const [agent] = await tx.select({ id: agentsTable.id }).from(agentsTable)
              .where(eq(agentsTable.id, lockedBooking.agentId));
            if (agent) {
              await tx.update(agentsTable)
                .set({ walletBalance: sql`${agentsTable.walletBalance} + ${refundAmt}` })
                .where(eq(agentsTable.id, lockedBooking.agentId));
              await tx.insert(agentCreditTransactionsTable).values({
                agentId: lockedBooking.agentId,
                type: "refund",
                amount: String(refundAmt),
                bookingId: params.data.id,
                bookingRef: lockedBooking.bookingRef,
                reference: null,
                notes: refundNote,
              });
            }
          }
        }
      }

      await tx.update(bookingsTable).set(bookingUpdate()).where(eq(bookingsTable.id, params.data.id));
      return "ok" as const;
    });
    if (financialResult === "not_found") {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (financialResult === "cancelled") {
      res.status(409).json({
        error: "Rezervimi është i anuluar. Vlerat e shitjes dhe çmimit nuk mund të ndryshohen.",
      });
      return;
    }
  } else {
    const statusLeavingCancelled = (rest as any).status !== undefined && (rest as any).status !== "cancelled";
    const updated = await db.update(bookingsTable)
      .set(bookingUpdate())
      .where(statusLeavingCancelled
        ? and(eq(bookingsTable.id, params.data.id), sql`${bookingsTable.status} != 'cancelled'`)
        : eq(bookingsTable.id, params.data.id))
      .returning({ id: bookingsTable.id });
    if (statusLeavingCancelled && updated.length === 0) {
      res.status(409).json({ error: "Rezervimi i anuluar mund të rikthehet vetëm me veprimin “Rikthe”." });
      return;
    }
  }

  // Build old values map for email descriptions from the row used for the
  // update (the locked row for financial changes).
  const oldValues: Record<string, any> = {};
  if (tA !== undefined) oldValues.totalAmount = Number(currentBooking.totalAmount);
  if (netPrice !== undefined) oldValues.netPrice = currentBooking.netPrice != null ? Number(currentBooking.netPrice) : null;
  if (pnr !== undefined) oldValues.pnr = currentBooking.pnr ?? "";
  for (const key of Object.keys(rest)) {
    if ((currentBooking as any)[key] !== undefined) oldValues[key] = (currentBooking as any)[key];
  }

  const full = await getFullBooking(params.data.id);
  if (!full) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(full);

  // Change log entries (non-blocking)
  const logUserId = (req as any).session?.userId ?? null;
  const logUserName = (req as any).session?.userName ?? "Staff";
  const logUserRole = (req as any).session?.role ?? null;

  // Resolve agentId / flightId to readable names if they changed
  const resolveAgent = async (id: any): Promise<string | null> => {
    if (id == null) return "—";
    const [a] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.id, Number(id)));
    return a?.name ?? `#${id}`;
  };
  const resolveFlight = async (id: any): Promise<string | null> => {
    if (id == null) return "—";
    const [f] = await db.select({ airline: flightsTable.airline, from: flightsTable.fromCity, to: flightsTable.toCity, dep: flightsTable.departureDate }).from(flightsTable).where(eq(flightsTable.id, Number(id)));
    if (!f) return `#${id}`;
    const d = (f.dep as any) instanceof Date ? (f.dep as any).toISOString().slice(0, 10) : String(f.dep);
    return `${f.airline} ${f.from}→${f.to} (${d})`;
  };

  const changes: Array<{ field: string; old: string | null; newV: string | null }> = [];
  if (effectiveTA !== undefined && Number(currentBooking.totalAmount) !== Number(effectiveTA))
    changes.push({ field: "totalAmount", old: fmtMoney(currentBooking.totalAmount), newV: fmtMoney(effectiveTA) });
  if (netPrice !== undefined && Number(oldValues.netPrice ?? NaN) !== Number(netPrice ?? NaN) && !(oldValues.netPrice == null && netPrice == null))
    changes.push({ field: "netPrice", old: fmtMoney(oldValues.netPrice), newV: fmtMoney(netPrice) });
  if (pnr !== undefined && (oldValues.pnr ?? "") !== (pnr ?? ""))
    changes.push({ field: "pnr", old: oldValues.pnr || null, newV: pnr || null });
  if (discountInput !== undefined) {
    const oldD = Number((currentBooking as any).discount ?? 0);
    const newD = Math.max(0, Number(discountInput));
    if (oldD !== newD) changes.push({ field: "discount", old: fmtMoney(oldD), newV: fmtMoney(newD) });
  }
  for (const key of Object.keys(rest)) {
    const newV = (rest as any)[key];
    const oldV = (currentBooking as any)[key];
    if (newV === undefined) continue;
    if (String(oldV ?? "") === String(newV ?? "")) continue;
    if (key === "agentId") {
      changes.push({ field: key, old: await resolveAgent(oldV), newV: await resolveAgent(newV) });
    } else if (key === "flightId") {
      changes.push({ field: key, old: await resolveFlight(oldV), newV: await resolveFlight(newV) });
    } else {
      changes.push({ field: key, old: fmtBookingFieldValue(key, oldV), newV: fmtBookingFieldValue(key, newV) });
    }
  }
  let statusLogPromise: Promise<number> | null = null;
  for (const ch of changes) {
    const logPromise = logBookingChange({
      bookingId: params.data.id,
      userId: logUserId,
      userName: logUserName,
      userRole: logUserRole,
      action: ch.field === "status" ? "status_changed" : "updated",
      fieldName: BOOKING_FIELD_LABELS[ch.field] ?? ch.field,
      oldValue: ch.old,
      newValue: ch.newV,
    });
    if (ch.field === "status") statusLogPromise = logPromise;
    else logPromise.catch(() => {});
  }

  // Email notification for booking update
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo && full) {
    // Only include fields that were explicitly provided in the body AND whose value actually changed
    const changed: string[] = [];
    if (tA !== undefined && oldValues.totalAmount !== Number(tA)) changed.push("totalAmount");
    if (netPrice !== undefined && oldValues.netPrice !== netPrice) changed.push("netPrice");
    if (pnr !== undefined && (oldValues.pnr ?? "") !== (pnr ?? "")) changed.push("pnr");
    for (const key of Object.keys(rest)) {
      if (rest[key as keyof typeof rest] !== undefined && (currentBooking as any)[key] !== rest[key as keyof typeof rest]) {
        changed.push(key);
      }
    }
    if (changed.length > 0) {
      sendEmail(notifyTo, `Ndryshim Rezervimi: ${full.bookingRef} — ${full.customerName}`, bookingUpdatedEmail(full, changed, oldValues));
    }
  }
  // Email te agjenti sa herë ndryshon statusi (p.sh. draft→pending ose kthim mbrapsht).
  if (full && rest.status !== undefined && rest.status !== currentBooking.status) {
    void statusLogPromise
      ?.then(statusEventId => sendAgentStatusEmail(full, String(rest.status), statusEventId))
      .catch(() => {});
  }
  // Largimi nga "ticketed" (jo drejt anulimit) heq biletën e ruajtur.
  // Hyrja në "ticketed" nuk kërkon inbox-in: fetch automatik lejohet vetëm
  // pasi watcher-i të marrë një email të ri me PNR përkatës.
  if (rest.status !== undefined && rest.status !== currentBooking.status) {
    if (currentBooking.status === "ticketed" && rest.status !== "cancelled") {
      void clearSavedWizzTicket(params.data.id, `Bileta e ruajtur u hoq — statusi u kthye nga Ticketed në ${STATUS_LABELS[String(rest.status)] ?? String(rest.status)}`);
    }
  }

  // RREGULL (31.07.2026): ndryshim PËRMBAJTJEJE (çmim shitjeje, emër klienti)
  // në një rezervim të BILETUAR ⇒ kthehet automatikisht në KONFIRMUAR —
  // bileta duhet lëshuar e dërguar përsëri. Nuk aplikohet kur vetë statusi po
  // ndryshohet në të njëjtën kërkesë (p.sh. po biletohet tani).
  const statusActuallyChanging = rest.status !== undefined && rest.status !== currentBooking.status;
  if (!statusActuallyChanging && currentBooking.status === "ticketed") {
    const reasons: string[] = [];
    const ticketChanges: TicketedBookingChange[] = [];
    if (effectiveTA !== undefined && Number(effectiveTA) !== Number(currentBooking.totalAmount)) {
      reasons.push(`çmimi i shitjes (€${formatWholeEuro(currentBooking.totalAmount)} → €${formatWholeEuro(effectiveTA)})`);
      ticketChanges.push({
        kind: "ticket_price",
        label: "Ticket Price",
        oldValue: `€${formatWholeEuro(currentBooking.totalAmount)}`,
        newValue: `€${formatWholeEuro(effectiveTA)}`,
      });
    }
    if ((rest as any).customerName !== undefined && String((rest as any).customerName ?? "").trim() !== String(currentBooking.customerName ?? "").trim()) {
      reasons.push("emri i klientit");
      ticketChanges.push({
        kind: "passenger_name",
        label: "Passenger Name",
        oldValue: String(currentBooking.customerName ?? "—").trim() || "—",
        newValue: String((rest as any).customerName ?? "—").trim() || "—",
      });
    }
    if (pnr !== undefined && String(pnr ?? "").trim() !== String(currentBooking.pnr ?? "").trim()) {
      reasons.push("PNR");
      ticketChanges.push({
        kind: "pnr",
        label: "PNR",
        oldValue: String(currentBooking.pnr ?? "—").trim() || "—",
        newValue: String(pnr ?? "—").trim() || "—",
      });
    }
    if (reasons.length > 0) {
      void revertTicketedToConfirmed(
        params.data.id,
        req,
        `U ndryshua ${reasons.join(" + ")} pas lëshimit`,
        ticketChanges,
      );
    }
  }
  scheduleExcelSync();
  scheduleGSheetsSync();
});

router.delete("/bookings/:id", async (req, res): Promise<void> => {
  const params = DeleteBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (booking) {
    const passengers = await db.select().from(passengersTable).where(eq(passengersTable.bookingId, booking.id));
    // Vendet e pasagjerëve të anuluar tashmë janë liruar — mos i lësho dy herë.
    const nonInfants = passengers.filter(p => p.type !== "infant" && !(p as any).cancelled).length;
    if (nonInfants > 0) {
      await db.update(flightsTable)
        .set({ soldSeats: sql`GREATEST(0, ${flightsTable.soldSeats} - ${nonInfants})` })
        .where(eq(flightsTable.id, booking.flightId));
      void recordSeatEvent({ flightId: booking.flightId, type: "cancelled", seats: nonInfants, req, note: `Fshirje rezervimi ${booking.bookingRef}` });
    }
  }

  await db.delete(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  res.sendStatus(204);
});

type BookingStatus = "draft" | "pending" | "confirmed" | "ticketed" | "cancelled";

// Dërgon email te agjenti (booking_user) sa herë ndryshon statusi, me PDF në anglisht
// që pasqyron statusin aktual të rezervimit. Best-effort: nuk hedh kurrë gabim te thirrësi.
// Per-status → per-agent toggle column. The agent receives the status email only
// when the master notifyByEmail is ON *and* the matching per-status toggle is ON.
const STATUS_TOGGLE_COL: Record<BookingStatus, "notifyCreated" | "notifyProcessing" | "notifyConfirmed" | "notifyTicketed" | "notifyCancelled"> = {
  draft:     "notifyCreated",
  pending:   "notifyProcessing",
  confirmed: "notifyConfirmed",
  ticketed:  "notifyTicketed",
  cancelled: "notifyCancelled",
};

async function persistAgentEmailOutcome(
  full: any,
  statusEventId: number,
  status: BookingStatus,
  outcome: AgentEmailOutcome,
  reason: string,
  email: string | null,
): Promise<void> {
  await db.insert(bookingChangeLogsTable).values({
    bookingId: Number(full.id),
    userId: null,
    userName: "System",
    userRole: null,
    action: "status_email",
    fieldName: "Emaili i agjentit",
    oldValue: null,
    newValue: outcome,
    note: statusEmailOutcomeNote({
      statusEventId,
      outcome,
      reason,
      email,
      status,
    }),
  });
  // Mutacioni HTTP mund të ketë përfunduar para dërgimit; ky event i dytë
  // rifreskon rezultatin asinkron në sidebar.
  notifyDataChanged("bookings");
}

function safeEmailFailureReason(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) return "Dërgimi i emailit dështoi";
  return `Dërgimi i emailit dështoi: ${error.message.trim().slice(0, 240)}`;
}

export async function sendAgentStatusEmail(
  full: any,
  status: string,
  statusEventId: number,
  ticketChanges: TicketedBookingChange[] = [],
): Promise<AgentEmailOutcome> {
  const KNOWN = ["draft", "pending", "confirmed", "ticketed", "cancelled"] as const;
  const st: BookingStatus = (KNOWN as readonly string[]).includes(status) ? (status as BookingStatus) : "confirmed";
  let outcomeWritten = false;
  let outcomeAttempted = false;
  let deliveryOutcome: AgentEmailOutcome = "failed";
  let resolvedAgentRecipient: string | null = null;
  const writeOutcome = async (outcome: AgentEmailOutcome, reason: string, email: string | null) => {
    if (outcomeAttempted) return;
    outcomeAttempted = true;
    deliveryOutcome = outcome;
    outcomeWritten = await persistEmailOutcomeWithRetry(
      () => persistAgentEmailOutcome(full, statusEventId, st, outcome, reason, email),
      () => logger.error(
        { bookingId: Number(full.id), statusEventId, status: st, outcome },
        "Status email outcome could not be persisted after 3 attempts; delivery was not retried",
      ),
    );
  };
  try {
    // Mblidh marrësit GJITHMONË sipas logjikës së agjentit (jo llogarisë së përdoruesit):
    // agjenti i lidhur (nëse ka aktivizuar notifyByEmail + toggle-in e këtij statusi)
    // + kopja qendrore; te booking_user biem vetëm kur rezervimi s'ka fare agjent.
    let skipReason: string | null = null;
    if (full?.agentId) {
      const [ag] = await db.select().from(agentsTable).where(eq(agentsTable.id, full.agentId));
      const statusEnabled = ag ? (ag as any)[STATUS_TOGGLE_COL[st]] !== false : true;
      if (!ag) skipReason = "Agjenti i lidhur nuk u gjet";
      else if (!ag.email?.trim()) skipReason = "Agjenti nuk ka adresë emaili";
      else if (ag.notifyByEmail === false) skipReason = "Njoftimet me email janë çaktivizuar për agjentin";
      else if (!statusEnabled) skipReason = `Njoftimi për statusin ${STATUS_LABELS[st]} është çaktivizuar për agjentin`;
      else resolvedAgentRecipient = ag.email.trim().toLowerCase();
    } else if (full?.bookingUserId) {
      const [bu] = await db.select({ email: bookingUsersTable.email }).from(bookingUsersTable).where(eq(bookingUsersTable.id, full.bookingUserId));
      if (bu?.email?.trim()) resolvedAgentRecipient = bu.email.trim().toLowerCase();
      else skipReason = "Llogaria e rezervimit nuk ka adresë emaili";
    } else {
      skipReason = "Rezervimi nuk ka agjent ose llogari marrësi";
    }
    // Kopje gjithmonë te adresa qendrore e rezervimeve.
    // E mbivendosshme via env STATUS_EMAIL_ADMIN; Set-i dedup-on nëse përkon.
    const adminCopy = (process.env.STATUS_EMAIL_ADMIN || "booking@albaniasky.com").trim().toLowerCase();
    const recipients = new Set<string>();
    if (resolvedAgentRecipient) recipients.add(resolvedAgentRecipient);
    if (adminCopy) recipients.add(adminCopy);
    if (!resolvedAgentRecipient) await writeOutcome("skipped", skipReason ?? "Nuk ka marrës emaili për agjentin", null);
    if (recipients.size === 0) return deliveryOutcome;
    const SUBJECTS: Record<BookingStatus, string> = {
      draft:     `NEW BOOKING: ${full.bookingRef}`,
      pending:   `Booking is Processing: ${full.bookingRef}`,
      confirmed: `Confirmed: ${full.bookingRef}`,
      ticketed:  `Ticketed: ${full.bookingRef}`,
      cancelled: `Canceled: ${full.bookingRef}`,
    };
    const FILES: Record<BookingStatus, string> = {
      draft:     `${full.bookingRef}-booking.pdf`,
      pending:   `${full.bookingRef}-booking.pdf`,
      confirmed: `${full.bookingRef}-confirmation.pdf`,
      ticketed:  `${full.bookingRef}-ticket.pdf`,
      cancelled: `${full.bookingRef}-cancellation.pdf`,
    };
    // CP bookings (ONLINE TRAVEL): shtojmë referencën CitizenPlane te subjekti
    // (vlen edhe për klientin edhe për kopjen admin, që e ndërton mbi `subject`).
    const changeSubject = ticketStatusEmailSubject(full, SUBJECTS[st], ticketChanges);
    const cpRef = cpRefOf(full);
    const subject = ticketStatusRecipientSubject(changeSubject, cpRef, ticketChanges);
    // Subjekti për kopjen tonë qendrore (admin) përfshin emrin e agjensisë, itinerarin
    // dhe numrin e pasagjerëve, që ta dallojmë menjëherë rezervimin nga inbox-i.
    // ONLINE TRAVEL është kanal white-label: emrin e agjensisë NUK e vendosim as te subjekti i kopjes admin.
    const rawAgency = (full.agentName ?? "").toString().trim();
    const agencyLabel = rawAgency.toUpperCase().includes("ONLINE TRAVEL") ? "" : rawAgency;
    const itin = full.flight
      ? [full.flight.fromCity, full.flight.toCity].filter(Boolean).join("→")
      : "";
    const paxCount = Array.isArray(full.passengers) ? full.passengers.length : 0;
    const paxLabel = paxCount > 0 ? `${paxCount} PAX` : "";
    // Data e fluturimit te subjekti: "2026-07-17" -> "17.07.2026".
    const depRaw = full.flight?.departureDate ? String(full.flight.departureDate) : "";
    const depDate = /^\d{4}-\d{2}-\d{2}$/.test(depRaw) ? depRaw.split("-").reverse().join(".") : depRaw;
    const adminExtras = [agencyLabel, itin, depDate, paxLabel].filter(Boolean).join(" — ");
    const adminSubject = ticketChanges.length > 0
      ? subject
      : adminExtras ? `${subject} — ${adminExtras}` : subject;
    const filename = FILES[st];
    let pdf: Buffer | null = null;
    try {
      pdf = await generateBookingConfirmationPdf(full, st);
    } catch {
      pdf = null;
    }
    const html = agentBookingEmail(full, st, ticketChanges, !!pdf);
    for (const to of recipients) {
      const subj = to === adminCopy ? adminSubject : subject;
      try {
        if (pdf) {
          await sendEmailStrict(to, subj, html, [{ filename, content: pdf, mimeType: "application/pdf" }]);
        } else {
          await sendEmailStrict(to, subj, html);
        }
        if (to === resolvedAgentRecipient && !outcomeWritten) {
          const final = finalAgentDeliveryOutcome({ pdfAvailable: !!pdf });
          await writeOutcome(final.outcome, final.reason, resolvedAgentRecipient);
        }
      } catch (error) {
        if (to === resolvedAgentRecipient && !outcomeWritten) {
          const deliveryReason = error instanceof Error && error.message.trim()
            ? error.message.trim().slice(0, 240)
            : "Gabim i panjohur";
          const final = finalAgentDeliveryOutcome({ pdfAvailable: !!pdf, deliveryError: deliveryReason });
          await writeOutcome(final.outcome, final.reason, resolvedAgentRecipient);
        }
        /* mos e ndal dërgimin për marrësit e tjerë nëse një dështon */
      }
    }
  } catch (error) {
    if (!outcomeWritten) {
      await writeOutcome("failed", safeEmailFailureReason(error), resolvedAgentRecipient).catch(() => {});
    }
    /* best-effort njoftim; mos e rrëzo kurrë kërkesën */
  }
  return deliveryOutcome;
}

router.patch("/bookings/:id/status", async (req, res): Promise<void> => {
  const params = UpdateBookingStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBookingStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const bookingId = params.data.id;
  const nextStatus = parsed.data.status;
  const aiExpectedStatus =
    req.headers["x-ai-action"] && typeof req.headers["x-ai-expected-status"] === "string"
      ? req.headers["x-ai-expected-status"]
      : null;
  const [previous] = await db.select({
    id: bookingsTable.id,
    status: bookingsTable.status,
  }).from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!previous) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (previous.status === "cancelled") {
    res.status(409).json({ error: "Rezervimi i anuluar mund të rikthehet vetëm me veprimin “Rikthe”." });
    return;
  }

  const [saved] = await db.update(bookingsTable)
    .set({
      status: nextStatus,
      ticketEmailPending: false,
      ticketEmailSentAt: null,
    })
    .where(and(
      eq(bookingsTable.id, bookingId),
      sql`${bookingsTable.status} != 'cancelled'`,
      ...(aiExpectedStatus ? [eq(bookingsTable.status, aiExpectedStatus)] : []),
    ))
    .returning({ id: bookingsTable.id, status: bookingsTable.status });
  if (!saved) {
    res.status(409).json({
      error: aiExpectedStatus
        ? "Rezervimi ndryshoi pas krijimit të propozimit."
        : "Rezervimi i anuluar mund të rikthehet vetëm me veprimin “Rikthe”.",
    });
    return;
  }

  const result = UpdateBookingStatusResponse.parse({
    id: saved.id,
    status: saved.status,
  });
  res.json(result);
  notifyDataChanged("bookings");

  if (previous.status === nextStatus) return;

  const session = {
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
  };
  void (async () => {
    try {
      const full = await getFullBooking(bookingId);
      if (!full) return;
      const statusEventId = await logBookingChange({
        bookingId,
        ...session,
        action: "status_changed",
        fieldName: "Statusi",
        oldValue: STATUS_LABELS[previous.status] ?? previous.status,
        newValue: STATUS_LABELS[nextStatus],
        note: nextStatus === "confirmed" ? "Rezervimi u konfirmua" : undefined,
      });
      const notifyTo = process.env.NOTIFY_EMAIL;
      if (notifyTo) {
        const subject = nextStatus === "confirmed"
          ? `Rezervim Konfirmuar: ${full.bookingRef} — ${full.customerName}`
          : `Ndryshim Rezervimi: ${full.bookingRef} — ${full.customerName}`;
        sendEmail(notifyTo, subject, bookingUpdatedEmail(full, ["status"]));
      }
      void sendAgentStatusEmail(full, nextStatus, statusEventId).catch(() => {});
      if (previous.status === "ticketed") {
        void clearSavedWizzTicket(
          bookingId,
          `Bileta e ruajtur u hoq — statusi u kthye nga Ticketed në ${STATUS_LABELS[nextStatus]}`,
        );
      }
      scheduleExcelSync();
      scheduleGSheetsSync();
    } catch (error) {
      logger.error({ error, bookingId, nextStatus }, "Status post-save processing failed");
    }
  })();
});

router.patch("/bookings/:id/confirm", async (req, res): Promise<void> => {
  const params = ConfirmBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [prevBooking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!prevBooking) { res.status(404).json({ error: "Booking not found" }); return; }
  const confirmed = await db.update(bookingsTable)
    .set({ status: "confirmed", ticketEmailPending: false, ticketEmailSentAt: null })
    .where(and(eq(bookingsTable.id, params.data.id), sql`${bookingsTable.status} != 'cancelled'`))
    .returning({ id: bookingsTable.id });
  if (confirmed.length === 0) {
    res.status(409).json({ error: "Rezervimi i anuluar mund të rikthehet vetëm me veprimin “Rikthe”." });
    return;
  }
  const full = await getFullBooking(params.data.id);
  if (!full) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(full);

  const statusLogPromise = logBookingChange({
    bookingId: params.data.id,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "status_changed",
    fieldName: "Statusi",
    oldValue: STATUS_LABELS[prevBooking?.status ?? "draft"] ?? (prevBooking?.status ?? "draft"),
    newValue: STATUS_LABELS["confirmed"],
    note: "Rezervimi u konfirmua",
  });

  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo && full) {
    sendEmail(notifyTo, `Rezervim Konfirmuar: ${full.bookingRef} — ${full.customerName}`, bookingUpdatedEmail(full, ["status"]));
  }
  void statusLogPromise.then(statusEventId => sendAgentStatusEmail(full, "confirmed", statusEventId)).catch(() => {});
  scheduleExcelSync();
  scheduleGSheetsSync();

  // Nëse rezervimi po kthehet nga "ticketed" → "confirmed", bileta e ruajtur
  // hiqet — kur të bëhet përsëri "ticketed", kërkimi rifillon me të dhënat aktuale.
  if (prevBooking?.status === "ticketed") {
    void clearSavedWizzTicket(params.data.id, "Bileta e ruajtur u hoq — statusi u kthye nga Ticketed në Konfirmuar");
  }
});

router.patch("/bookings/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Password gate (mandator nëse është vendosur)
  const pwd = (req.headers["x-cancel-password"] as string | undefined) ?? req.body?.password;
  const pwdCheck = await verifyCancelPassword(pwd);
  if (pwdCheck.notSet) {
    res.status(403).json({ error: "Fjalëkalimi i anulimit nuk është vendosur. Kontakto adminin për ta vendosur te Settings." });
    return;
  }
  if (!pwdCheck.ok) {
    res.status(401).json({ error: "Fjalëkalim i pasaktë" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.status === "cancelled") {
    res.status(409).json({ error: "Rezervimi është tashmë i anuluar" });
    return;
  }

  // Computed only after the booking row is locked below, so passenger mutations
  // cannot race cancellation and release too many/few seats.
  let nonInfantCount = 0;
  let cancellationCredit = 0;
  await db.transaction(async tx => {
    // Claim cancellation inside the same transaction. A concurrent second click
    // waits for this row and then matches zero rows, so all of its writes roll back.
    const [claimed] = await tx.update(bookingsTable)
      .set({ status: "cancelled", ticketEmailPending: false, ticketEmailSentAt: null })
      .where(and(eq(bookingsTable.id, params.data.id), sql`${bookingsTable.status} != 'cancelled'`))
      .returning({ id: bookingsTable.id });
    if (!claimed) throw new Error("Rezervimi është tashmë i anuluar");

    const passengers = await tx.select().from(passengersTable)
      .where(eq(passengersTable.bookingId, booking.id));
    nonInfantCount = passengers.filter(p => p.type !== "infant" && !(p as any).cancelled).length;
    if (nonInfantCount > 0) {
      await tx.update(flightsTable)
        .set({ soldSeats: sql`GREATEST(0, ${flightsTable.soldSeats} - ${nonInfantCount})` })
        .where(eq(flightsTable.id, booking.flightId));
    }

    if (booking.agentId) {
      const payments = await tx.select().from(paymentsTable).where(eq(paymentsTable.bookingId, booking.id));
      const paidAmount = Math.round(
        payments.filter(p => p.status === "completed").reduce((s, p) => s + (p.isRefund ? -1 : 1) * Number(p.amount), 0) * 100
      ) / 100;
      if (paidAmount > 0) {
        cancellationCredit = paidAmount;
        const refundNote = `Anulim rezervimi: pagesa neto €${formatWholeEuro(paidAmount)} u kreditua në kuletën e agjentit`;
        const [refundPayment] = await tx.insert(paymentsTable).values({
          bookingId: booking.id,
          amount: String(paidAmount),
          method: "credit",
          reference: null,
          notes: refundNote,
          status: "completed",
          isRefund: true,
        }).returning();
        await tx.insert(paymentChangeLogsTable).values({
          paymentId: refundPayment.id,
          userId: (req as any).session?.userId ?? null,
          userName: (req as any).session?.userName ?? "System",
          userRole: (req as any).session?.role ?? null,
          action: "created",
          newValue: `Rimbursim automatik €${formatWholeEuro(paidAmount)} (anulim rezervimi)`,
          note: refundNote,
        });
        await tx.update(agentsTable)
          .set({ walletBalance: sql`${agentsTable.walletBalance} + ${paidAmount}` })
          .where(eq(agentsTable.id, booking.agentId));
        await tx.insert(agentCreditTransactionsTable).values({
          agentId: booking.agentId,
          type: "refund",
          amount: String(paidAmount),
          bookingId: booking.id,
          bookingRef: booking.bookingRef,
          reference: null,
          notes: refundNote,
        });
      }
    }

  });
  if (nonInfantCount > 0) {
    void recordSeatEvent({ flightId: booking.flightId, type: "cancelled", seats: nonInfantCount, req, note: `Anulim rezervimi ${booking.bookingRef}` });
  }
  const full = await getFullBooking(params.data.id);
  if (!full) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(full);

  const statusLogPromise = logBookingChange({
    bookingId: params.data.id,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "status_changed",
    fieldName: "Statusi",
    oldValue: STATUS_LABELS[booking.status] ?? booking.status,
    newValue: STATUS_LABELS["cancelled"],
    note: cancellationCredit > 0
      ? `Rezervimi u anullua — €${formatWholeEuro(cancellationCredit)} u kreditua në kuletën e agjentit`
      : "Rezervimi u anullua",
  });

  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo && full) {
    sendEmail(notifyTo, `Rezervim i Anulluar: ${full.bookingRef} — ${full.customerName}`, bookingUpdatedEmail(full, ["status"]));
  }
  void statusLogPromise.then(statusEventId => sendAgentStatusEmail(full, "cancelled", statusEventId)).catch(() => {});
  scheduleExcelSync();
  scheduleGSheetsSync();
});

// Rikthe (restore) rezervimin e anulluar
router.patch("/bookings/:id/restore", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const pwd = (req.headers["x-cancel-password"] as string | undefined) ?? req.body?.password;
  const pwdCheck = await verifyCancelPassword(pwd);
  if (pwdCheck.notSet) {
    res.status(403).json({ error: "Fjalëkalimi i anulimit nuk është vendosur. Kontakto adminin." });
    return;
  }
  if (!pwdCheck.ok) {
    res.status(401).json({ error: "Fjalëkalim i pasaktë" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.status !== "cancelled") {
    res.status(400).json({ error: "Vetëm rezervimet e anulluara mund të rikthehen" });
    return;
  }

  let restoredSeatCount = 0;
  try {
    await db.transaction(async tx => {
      const [lockedBooking] = await tx.select().from(bookingsTable)
        .where(eq(bookingsTable.id, id))
        .for("update");
      if (!lockedBooking || lockedBooking.status !== "cancelled") {
        throw new Error("NOT_CANCELLED");
      }

      const [flight] = await tx.select().from(flightsTable)
        .where(eq(flightsTable.id, lockedBooking.flightId))
        .for("update");
      const passengers = await tx.select().from(passengersTable)
        .where(eq(passengersTable.bookingId, lockedBooking.id));
      restoredSeatCount = passengers.filter(p => p.type !== "infant" && !(p as any).cancelled).length;
      if (flight && restoredSeatCount > 0) {
        const available = Number(flight.totalSeats) - Number(flight.soldSeats);
        if (available < restoredSeatCount) {
          throw new Error(`NO_SEATS:${available}:${restoredSeatCount}`);
        }
        await tx.update(flightsTable)
          .set({ soldSeats: sql`${flightsTable.soldSeats} + ${restoredSeatCount}` })
          .where(eq(flightsTable.id, lockedBooking.flightId));
      }

      if (lockedBooking.agentId) {
        const [refund] = await tx.select().from(paymentsTable)
          .where(and(
            eq(paymentsTable.bookingId, lockedBooking.id),
            eq(paymentsTable.isRefund, true),
            eq(paymentsTable.method, "credit"),
            eq(paymentsTable.status, "completed"),
            sql`${paymentsTable.notes} LIKE 'Anulim rezervimi:%'`,
          ))
          .orderBy(desc(paymentsTable.createdAt))
          .limit(1)
          .for("update");
        if (refund) {
          const amt = Number(refund.amount);
          const reversalNote = `Rikthim rezervimi: u kthye krediti i anulimit €${formatWholeEuro(amt)}`;
          const [agent] = await tx.select({ walletBalance: agentsTable.walletBalance })
            .from(agentsTable)
            .where(eq(agentsTable.id, lockedBooking.agentId))
            .for("update");
          const availableCredit = Number(agent?.walletBalance ?? 0);
          if (!agent || availableCredit + 0.001 < amt) {
            throw new Error(`NO_WALLET:${availableCredit}:${amt}`);
          }
          await tx.update(paymentsTable)
            .set({ status: "cancelled", notes: `${refund.notes ?? ""}\n${reversalNote}`.trim() })
            .where(eq(paymentsTable.id, refund.id));
          await tx.insert(paymentChangeLogsTable).values({
            paymentId: refund.id,
            userId: (req as any).session?.userId ?? null,
            userName: (req as any).session?.userName ?? "System",
            userRole: (req as any).session?.role ?? null,
            action: "updated",
            oldValue: `Rimbursim automatik €${formatWholeEuro(amt)} (aktiv)`,
            newValue: `Rimbursim automatik €${formatWholeEuro(amt)} (anuluar nga rikthimi)`,
            note: reversalNote,
          });
          await tx.update(agentsTable)
            .set({ walletBalance: sql`${agentsTable.walletBalance} - ${amt}` })
            .where(eq(agentsTable.id, lockedBooking.agentId));
          await tx.insert(agentCreditTransactionsTable).values({
            agentId: lockedBooking.agentId,
            type: "payment",
            amount: String(amt),
            bookingId: lockedBooking.id,
            bookingRef: lockedBooking.bookingRef,
            reference: null,
            notes: reversalNote,
          });
        }
      }

      // The cancellation refund has just been voided. Reconcile the stored
      // total in the same locked transaction so agency debt matches the ledger.
      const [paid] = await tx.select({
        amount: sql<string>`coalesce(sum(case when ${paymentsTable.isRefund} then -${paymentsTable.amount}::numeric else ${paymentsTable.amount}::numeric end), 0)::text`,
      }).from(paymentsTable).where(and(
        eq(paymentsTable.bookingId, id),
        eq(paymentsTable.status, "completed"),
      ));
      await tx.update(bookingsTable)
        .set({ status: "confirmed", paidAmount: String(Math.max(0, Number(paid?.amount ?? 0))), ticketEmailPending: false, ticketEmailSentAt: null })
        .where(eq(bookingsTable.id, id));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_CANCELLED") {
      res.status(409).json({ error: "Rezervimi nuk është më i anuluar" });
      return;
    }
    if (message.startsWith("NO_SEATS:")) {
      const [, available, needed] = message.split(":");
      res.status(400).json({ error: `Fluturimi nuk ka sa duhet vende: ${available} të disponueshme, duhen ${needed}` });
      return;
    }
    if (message.startsWith("NO_WALLET:")) {
      const [, available, needed] = message.split(":");
      res.status(409).json({
        error: `Rezervimi nuk mund të rikthehet: nga krediti i anulimit duhen €${formatWholeEuro(needed)}, por në wallet janë vetëm €${formatWholeEuro(available)}.`,
      });
      return;
    }
    throw error;
  }
  if (restoredSeatCount > 0) {
    await flipSoldOutIfFull(booking.flightId);
    triggerCpExportSoon();
    void recordSeatEvent({ flightId: booking.flightId, type: "restored", seats: restoredSeatCount, req, note: `Rikthim rezervimi ${booking.bookingRef}` });
  }
  const full = await getFullBooking(id);
  if (!full) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  res.json(full);

  const statusLogPromise = logBookingChange({
    bookingId: id,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "status_changed",
    fieldName: "Statusi",
    oldValue: STATUS_LABELS["cancelled"],
    newValue: STATUS_LABELS["confirmed"],
    note: "Rezervimi u rikthye nga anulimi",
  });

  void statusLogPromise.then(statusEventId => sendAgentStatusEmail(full, "confirmed", statusEventId)).catch(() => {});
  scheduleExcelSync();
  scheduleGSheetsSync();

  // Rikthimi nga anulimi vjen te "confirmed" — nëse dikur ka qenë "ticketed"
  // me biletë të ruajtur, hiqe që kërkimi të rifillojë me të dhënat aktuale.
  void clearSavedWizzTicket(id, "Bileta e ruajtur u hoq — rezervimi u rikthye nga anulimi në Konfirmuar");
});

router.patch("/bookings/:id/ticket", async (req, res): Promise<void> => {
  // Opt-in for FMS: persist status/history first, then release the HTTP response.
  // Existing callers retain the synchronous delivery contract.
  const respondAsync = req.get("Prefer") === "respond-async";
  const params = TicketBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [prevTicketBooking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!prevTicketBooking) { res.status(404).json({ error: "Booking not found" }); return; }

  // Rezervimi është biletuar më parë me "Lësho pa Dërguar":
  // ky klik dërgon vetëm emailin dhe nuk krijon një ndryshim të dytë statusi.
  if (prevTicketBooking.status === "ticketed" && prevTicketBooking.ticketEmailPending) {
    const releaseEmailSend = acquireTicketEmailSend(params.data.id);
    if (!releaseEmailSend) {
      res.status(409).json({ error: "Dërgimi i emailit është tashmë në proces." });
      return;
    }
    try {
      const fullPending = await getFullBooking(params.data.id);
      if (!fullPending) { res.status(404).json({ error: "Booking not found" }); return; }
      const emailEventId = await logBookingChange({
        bookingId: params.data.id,
        userId: (req as any).session?.userId ?? null,
        userName: (req as any).session?.userName ?? "Staff",
        userRole: (req as any).session?.role ?? null,
        action: "status_email",
        fieldName: "Emaili i agjentit",
        oldValue: "Pa dërguar",
        newValue: "Dërguar",
        note: "U kërkua dërgimi i emailit të biletës",
      });
      if (respondAsync) res.status(202).json({ ...fullPending, ticketEmailSending: true });
      const outcome = await sendAgentStatusEmail(fullPending, "ticketed", emailEventId);
      if (shouldKeepTicketEmailPending(outcome)) {
        notifyDataChanged("bookings");
        if (!res.headersSent) res.status(502).json({ error: outcome === "skipped"
          ? "Emaili nuk u dërgua. Kontrollo adresën dhe njoftimet e agjentit."
          : "Dërgimi i emailit dështoi. Provo përsëri." });
        return;
      }
      await db.update(bookingsTable)
        .set({ ticketEmailPending: false, ticketEmailSentAt: new Date() })
        .where(and(
          eq(bookingsTable.id, params.data.id),
          eq(bookingsTable.status, "ticketed"),
          eq(bookingsTable.ticketEmailPending, true),
          eq(bookingsTable.updatedAt, new Date(fullPending.updatedAt)),
        ));
      notifyDataChanged("bookings");
      if (!res.headersSent) res.json(await getFullBooking(params.data.id));
      return;
    } catch (error) {
      if (!res.headersSent) throw error;
      req.log.error({ err: error, bookingId: params.data.id }, "Ticket email background send failed; delivery remains unconfirmed");
      return;
    } finally {
      releaseEmailSend();
      notifyDataChanged("bookings");
    }
  }
  if (prevTicketBooking.status === "ticketed") {
    const current = await getFullBooking(params.data.id);
    res.json(current);
    return;
  }

  const releaseEmailSend = acquireTicketEmailSend(params.data.id);
  if (!releaseEmailSend) {
    res.status(409).json({ error: "Lëshimi dhe dërgimi i biletës është tashmë në proces." });
    return;
  }
  try {
    const ticketed = await db.update(bookingsTable)
      .set({ status: "ticketed", ticketEmailPending: true, ticketEmailSentAt: null })
      .where(and(eq(bookingsTable.id, params.data.id), sql`${bookingsTable.status} NOT IN ('cancelled', 'ticketed')`))
      .returning({ id: bookingsTable.id });
    if (ticketed.length === 0) {
      res.status(409).json({ error: "Rezervimi nuk mund të biletohet përsëri." });
      return;
    }
    const full = await getFullBooking(params.data.id);
    if (!full) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const statusEventId = await logBookingChange({
      bookingId: params.data.id,
      userId: (req as any).session?.userId ?? null,
      userName: (req as any).session?.userName ?? "Staff",
      userRole: (req as any).session?.role ?? null,
      action: "status_changed",
      fieldName: "Statusi",
      oldValue: STATUS_LABELS[prevTicketBooking?.status ?? "confirmed"] ?? (prevTicketBooking?.status ?? "confirmed"),
      newValue: STATUS_LABELS["ticketed"],
      note: "Bileta u lëshua",
    });

    const notifyTo = process.env.NOTIFY_EMAIL;
    if (notifyTo) {
      sendEmail(notifyTo, `Biletë e Lëshuar: ${full.bookingRef} — ${full.customerName}`, bookingUpdatedEmail(full, ["status"]));
    }
    if (respondAsync) res.status(202).json({ ...full, ticketEmailSending: true });
    const outcome = await sendAgentStatusEmail(full, "ticketed", statusEventId);
    if (!shouldKeepTicketEmailPending(outcome)) {
      await db.update(bookingsTable)
        .set({ ticketEmailPending: false, ticketEmailSentAt: new Date() })
        .where(and(eq(bookingsTable.id, params.data.id), eq(bookingsTable.status, "ticketed"),
          eq(bookingsTable.updatedAt, new Date(full.updatedAt))));
    }
    scheduleExcelSync();
    scheduleGSheetsSync();
    notifyDataChanged("bookings");
    if (!res.headersSent) res.json(await getFullBooking(params.data.id));
  } catch (error) {
    if (!res.headersSent) throw error;
    req.log.error({ err: error, bookingId: params.data.id }, "Ticket email background send failed; delivery remains unconfirmed");
  } finally {
    releaseEmailSend();
    notifyDataChanged("bookings");
  }
});

router.patch("/bookings/:id/ticket-without-email", async (req, res): Promise<void> => {
  const params = TicketBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [previous] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!previous) { res.status(404).json({ error: "Booking not found" }); return; }
  if (previous.status === "ticketed") {
    if (previous.ticketEmailPending) {
      res.json(await getFullBooking(params.data.id));
    } else {
      res.status(409).json({ error: "Bileta është lëshuar dhe emaili është dërguar tashmë." });
    }
    return;
  }
  const ticketed = await db.update(bookingsTable)
    .set({ status: "ticketed", ticketEmailPending: true, ticketEmailSentAt: null })
    .where(and(eq(bookingsTable.id, params.data.id), sql`${bookingsTable.status} NOT IN ('cancelled', 'ticketed')`))
    .returning({ id: bookingsTable.id });
  if (ticketed.length === 0) {
    res.status(409).json({ error: "Rezervimi i anuluar mund të rikthehet vetëm me veprimin “Rikthe”." });
    return;
  }
  const full = await getFullBooking(params.data.id);
  if (!full) { res.status(404).json({ error: "Booking not found" }); return; }
  res.json(full);

  void logBookingChange({
    bookingId: params.data.id,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "status_changed",
    fieldName: "Statusi",
    oldValue: STATUS_LABELS[previous.status] ?? previous.status,
    newValue: STATUS_LABELS.ticketed,
    note: "Bileta u lëshua pa i dërguar email agjentit",
  });
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo) {
    sendEmail(notifyTo, `Biletë e Lëshuar pa Email Agjentit: ${full.bookingRef} — ${full.customerName}`, bookingUpdatedEmail(full, ["status"]));
  }
  notifyDataChanged("bookings");
  scheduleExcelSync();
  scheduleGSheetsSync();
});

// Kërkim manual i biletës Wizz në email (butoni te detajet e rezervimit)
router.post("/bookings/:id/fetch-ticket-email", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await fetchWizzTicketForBooking(id);
  res.json(result);
});

// Përjashto/rikthe rezervimin nga kërkimi i biletës në email (skaner + manual + badge)
router.post("/bookings/:id/ticket-search-exclude", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const excluded = req.body?.excluded === true;
  const [existing] = await db.select({ id: bookingsTable.id, ticketSearchExcluded: bookingsTable.ticketSearchExcluded })
    .from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Rezervimi nuk u gjet" }); return; }
  await db.update(bookingsTable).set({ ticketSearchExcluded: excluded }).where(eq(bookingsTable.id, id));
  if (existing.ticketSearchExcluded !== excluded) {
    void logBookingChange({
      bookingId: id,
      userId: (req as any).session?.userId ?? null,
      userName: (req as any).session?.userName ?? "Staff",
      userRole: (req as any).session?.role ?? null,
      action: "updated",
      fieldName: "ticketSearchExcluded",
      oldValue: excluded ? "Jo" : "Po",
      newValue: excluded ? "Po" : "Jo",
      note: excluded
        ? "U përjashtua nga kërkimi i biletës në email"
        : "U rikthye kërkimi i biletës në email",
    }).catch(() => {});
  }
  res.json({ ok: true, excluded });
});

// ── Shënime brenda rezervimit (të pandryshueshme, me reply) ────────────────
router.get("/bookings/:id/comments", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(bookingCommentsTable)
    .where(eq(bookingCommentsTable.bookingId, id))
    .orderBy(bookingCommentsTable.createdAt);
  res.json(rows.map(c => ({
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  })));
});

// Njoftimet e ndryshimit të fluturimit nga email-i për një rezervim
router.get("/bookings/:id/email-alerts", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(bookingEmailAlertsTable)
    .where(eq(bookingEmailAlertsTable.bookingId, id))
    .orderBy(desc(bookingEmailAlertsTable.createdAt));
  res.json(rows.map(a => ({
    ...a,
    emailDate: a.emailDate instanceof Date ? a.emailDate.toISOString() : a.emailDate,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    readAt: a.readAt instanceof Date ? a.readAt.toISOString() : a.readAt,
  })));
});

// Shëno të gjitha njoftimet e email-it të këtij rezervimi si të lexuara —
// alarmi hiqet nga lista derisa të vijë një email i ri.
router.post("/bookings/:id/email-alerts/read", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(bookingEmailAlertsTable)
    .set({ readAt: new Date() })
    .where(and(eq(bookingEmailAlertsTable.bookingId, id), isNull(bookingEmailAlertsTable.readAt)));
  res.json({ ok: true });
});

// PDF-të e njoftimeve të email-it — VETËM me auth (static /uploads i anashkalon /alerts).
router.get("/uploads/alerts/:file", async (req, res): Promise<void> => {
  const file = path.basename(String(req.params.file || ""));
  if (!file.endsWith(".pdf")) { res.status(400).json({ error: "Skedar i pavlefshëm" }); return; }
  // Lejohet vetëm nëse ekziston një njoftim me këtë PDF
  const [alertRow] = await db.select({ id: bookingEmailAlertsTable.id })
    .from(bookingEmailAlertsTable)
    .where(eq(bookingEmailAlertsTable.pdfUrl, `/api/uploads/alerts/${file}`))
    .limit(1);
  if (!alertRow) { res.status(404).json({ error: "Nuk u gjet" }); return; }
  const filePath = path.join(alertsUploadDir, file);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Skedari nuk ekziston" }); return; }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/pdf");
  res.sendFile(filePath);
});

router.post("/bookings/:id/comments", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) { res.status(400).json({ error: "Shënimi është bosh" }); return; }
  if (message.length > 2000) { res.status(400).json({ error: "Shënimi është shumë i gjatë (max 2000)" }); return; }
  const [booking] = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Rezervimi nuk u gjet" }); return; }
  let parentId: number | null = null;
  if (req.body?.parentId != null) {
    const pid = parseInt(String(req.body.parentId));
    if (isNaN(pid)) { res.status(400).json({ error: "parentId i pavlefshëm" }); return; }
    const [parent] = await db.select({ id: bookingCommentsTable.id, bookingId: bookingCommentsTable.bookingId, parentId: bookingCommentsTable.parentId })
      .from(bookingCommentsTable).where(eq(bookingCommentsTable.id, pid));
    if (!parent || parent.bookingId !== id) { res.status(400).json({ error: "Shënimi prind nuk u gjet" }); return; }
    // Reply-t mbeten një nivel: reply mbi një reply lidhet me shënimin kryesor.
    parentId = parent.parentId ?? parent.id;
  }
  const sess: any = (req as any).session;
  const [created] = await db.insert(bookingCommentsTable).values({
    bookingId: id,
    parentId,
    authorId: sess?.userId ?? null,
    authorName: sess?.userName ?? "Staff",
    authorRole: sess?.role ?? null,
    message,
  }).returning();
  res.json({
    ...created,
    createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : created.createdAt,
  });
});

router.get("/bookings/:id/change-log", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const logs = await db.select().from(bookingChangeLogsTable)
    .where(eq(bookingChangeLogsTable.bookingId, id))
    .orderBy(bookingChangeLogsTable.createdAt, bookingChangeLogsTable.id);
  res.json(logs.filter(l => l.action !== "atomic_save_receipt").map(l => ({
    ...l,
    createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
  })));
});

router.get("/bookings/:id/extras", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const extras = await db.select().from(bookingExtrasTable).where(eq(bookingExtrasTable.bookingId, id));
  res.json(extras.map(e => ({ ...e, amount: Number(e.amount), createdAt: e.createdAt.toISOString() })));
});

router.post("/bookings/:id/extras", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { description, amount } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description required" }); return;
  }
  const amt = roundWholeEuro(Number(amount));
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "amount must be positive number" }); return; }

  const descTrim = description.trim();

  // Special-case "Bagazh": sync baggageOption on passenger instead of creating
  // a duplicate extras row. This ensures the luggage icon + Excel "20 KG" pick it up.
  const isBagazh = /^bagazh\b/i.test(descTrim);
  const result = await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .for("update");
    if (!booking) return { kind: "not_found" as const };
    if (booking.status === "cancelled") return { kind: "cancelled" as const };

    const oldTotal = Number(booking.totalAmount);
    const newTotal = roundWholeEuro(oldTotal + amt);
    if (isBagazh) {
      const allPax = await tx.select().from(passengersTable).where(eq(passengersTable.bookingId, id));
      let targetPax: typeof allPax[number] | undefined;
      const m = descTrim.match(/—\s*(.+)$/);
      if (m) {
        const name = m[1].trim().toLowerCase();
        targetPax = allPax.find(p => `${p.firstName} ${p.lastName}`.trim().toLowerCase() === name);
      } else if (allPax.length === 1) {
        targetPax = allPax[0];
      }
      if (targetPax && targetPax.baggageOption !== "checked") {
        await tx.update(passengersTable)
          .set({ baggageOption: "checked", extraCost: String(amt) })
          .where(eq(passengersTable.id, targetPax.id));
        await tx.update(bookingsTable).set({ totalAmount: String(newTotal) }).where(eq(bookingsTable.id, id));
        return { kind: "baggage" as const, booking, targetPax, oldTotal, newTotal };
      }
    }

    await tx.insert(bookingExtrasTable).values({ bookingId: id, description: descTrim, amount: String(amt) });
    await tx.update(bookingsTable).set({ totalAmount: String(newTotal) }).where(eq(bookingsTable.id, id));
    return { kind: "extra" as const, booking, oldTotal, newTotal };
  });
  if (result.kind === "not_found") { res.status(404).json({ error: "Booking not found" }); return; }
  if (result.kind === "cancelled") {
    res.status(409).json({ error: "Rezervimi është i anuluar. Shtesat dhe vlerat e shitjes nuk mund të ndryshohen." });
    return;
  }

  const { oldTotal, newTotal } = result;
  if (result.kind === "baggage") {
    const targetPax = result.targetPax;
      const full = await getFullBooking(id);
      res.json(full);
      logBookingChange({
        bookingId: id,
        userId: (req as any).session?.userId ?? null,
        userName: (req as any).session?.userName ?? "Staff",
        userRole: (req as any).session?.role ?? null,
        action: "extra_added",
        fieldName: "Bagazh 20 KG",
        newValue: `${targetPax.firstName} ${targetPax.lastName} — €${formatWholeEuro(amt)}`,
        note: `Totali: €${formatWholeEuro(oldTotal)} → €${formatWholeEuro(newTotal)}`,
      }).catch(() => {});
      // Rezervim i BILETUAR + bagazh i shtuar ⇒ kthehet në KONFIRMUAR.
      void revertTicketedToConfirmed(id, req, `U shtua bagazh (${targetPax.firstName} ${targetPax.lastName}) pas lëshimit`);
      return;
  }

  const full = await getFullBooking(id);
  res.json(full);

  logBookingChange({
    bookingId: id,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "extra_added",
    fieldName: "Shtojcë",
    newValue: `${description.trim()} — €${formatWholeEuro(amt)}`,
    note: `Totali: €${formatWholeEuro(oldTotal)} → €${formatWholeEuro(newTotal)}`,
  }).catch(() => {});

  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo && full) {
    sendEmail(
      notifyTo,
      `Shtojce e Re: ${full.bookingRef} — ${description.trim()} €${formatWholeEuro(amt)}`,
      extraChangedEmail(full, { description: description.trim(), amount: amt }, "added", oldTotal, newTotal)
    );
  }

  // Rezervim i BILETUAR + shtesë e re ⇒ kthehet në KONFIRMUAR (bileta rilëshohet).
  void revertTicketedToConfirmed(id, req, `U shtua shtesa "${descTrim}" pas lëshimit`);
});

router.patch("/bookings/:bookingId/extras/:extraId", async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId);
  const extraId = parseInt(req.params.extraId);
  if (isNaN(bookingId) || isNaN(extraId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { description, amount } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "description required" }); return;
  }
  const amt = roundWholeEuro(Number(amount));
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "amount must be positive number" }); return; }

  const result = await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .for("update");
    if (!booking) return { kind: "booking_not_found" as const };
    if (booking.status === "cancelled") return { kind: "cancelled" as const };

    // Shtesa duhet t'i përkasë PIKËRISHT këtij rezervimi (mbrojtje cross-booking).
    const [extra] = await tx.select().from(bookingExtrasTable)
      .where(and(eq(bookingExtrasTable.id, extraId), eq(bookingExtrasTable.bookingId, bookingId)));
    if (!extra) return { kind: "extra_not_found" as const };

    const oldTotal = Number(booking.totalAmount);
    const oldAmt = Number(extra.amount);
    const newTotal = roundWholeEuro(oldTotal - oldAmt + amt);
    if (extra.description === description.trim() && oldAmt === amt) {
      return { kind: "same" as const };
    }

    await tx.update(bookingExtrasTable)
      .set({ description: description.trim(), amount: String(amt) })
      .where(eq(bookingExtrasTable.id, extraId));
    await tx.update(bookingsTable).set({ totalAmount: String(newTotal) }).where(eq(bookingsTable.id, bookingId));
    return { kind: "updated" as const, extra, oldTotal, oldAmt, newTotal };
  });
  if (result.kind === "booking_not_found") { res.status(404).json({ error: "Booking not found" }); return; }
  if (result.kind === "cancelled") {
    res.status(409).json({ error: "Rezervimi është i anuluar. Shtesat dhe vlerat e shitjes nuk mund të ndryshohen." });
    return;
  }
  if (result.kind === "extra_not_found") { res.status(404).json({ error: "Extra not found" }); return; }

  // Ruajtje idempotente (asgjë s'ndryshoi) — mos prek DB, mos kthe statusin.
  if (result.kind === "same") {
    const fullSame = await getFullBooking(bookingId);
    res.json(fullSame);
    return;
  }
  const { extra, oldTotal, oldAmt, newTotal } = result;

  const full = await getFullBooking(bookingId);
  res.json(full);

  logBookingChange({
    bookingId,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "extra_updated",
    fieldName: "Shtojcë e Ndryshuar",
    oldValue: `${extra.description} — €${formatWholeEuro(oldAmt)}`,
    newValue: `${description.trim()} — €${formatWholeEuro(amt)}`,
    note: `Totali: €${formatWholeEuro(oldTotal)} → €${formatWholeEuro(newTotal)}`,
  }).catch(() => {});

  // Rezervim i BILETUAR + shtesë e ndryshuar ⇒ kthehet në KONFIRMUAR.
  void revertTicketedToConfirmed(bookingId, req, `U ndryshua shtesa "${extra.description}" pas lëshimit`);
});

router.delete("/bookings/:bookingId/extras/:extraId", async (req, res): Promise<void> => {
  const bookingId = parseInt(req.params.bookingId);
  const extraId = parseInt(req.params.extraId);
  if (isNaN(bookingId) || isNaN(extraId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const result = await db.transaction(async tx => {
    const [booking] = await tx.select().from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .for("update");
    if (!booking) return { kind: "booking_not_found" as const };
    if (booking.status === "cancelled") return { kind: "cancelled" as const };

    // Shtesa duhet t'i përkasë PIKËRISHT këtij rezervimi (mbrojtje cross-booking).
    const [extra] = await tx.select().from(bookingExtrasTable)
      .where(and(eq(bookingExtrasTable.id, extraId), eq(bookingExtrasTable.bookingId, bookingId)));
    if (!extra) return { kind: "extra_not_found" as const };

    const oldTotal = Number(booking.totalAmount);
    const newTotal = Math.max(0, oldTotal - Number(extra.amount));
    await tx.delete(bookingExtrasTable).where(eq(bookingExtrasTable.id, extraId));
    await tx.update(bookingsTable).set({ totalAmount: String(newTotal) }).where(eq(bookingsTable.id, bookingId));
    return { kind: "deleted" as const, extra, oldTotal, newTotal };
  });
  if (result.kind === "booking_not_found") { res.status(404).json({ error: "Booking not found" }); return; }
  if (result.kind === "cancelled") {
    res.status(409).json({ error: "Rezervimi është i anuluar. Shtesat dhe vlerat e shitjes nuk mund të ndryshohen." });
    return;
  }
  if (result.kind === "extra_not_found") { res.status(404).json({ error: "Extra not found" }); return; }
  const { extra, oldTotal, newTotal } = result;

  const full = await getFullBooking(bookingId);
  res.json(full);

  logBookingChange({
    bookingId: bookingId,
    userId: (req as any).session?.userId ?? null,
    userName: (req as any).session?.userName ?? "Staff",
    userRole: (req as any).session?.role ?? null,
    action: "extra_removed",
    fieldName: "Shtojcë e Fshirë",
    oldValue: `${extra.description} — €${formatWholeEuro(extra.amount)}`,
    note: `Totali: €${formatWholeEuro(oldTotal)} → €${formatWholeEuro(newTotal)}`,
  }).catch(() => {});

  const notifyTo = process.env.NOTIFY_EMAIL;
  if (notifyTo && full) {
    sendEmail(
      notifyTo,
      `Shtojce e Fshire: ${full.bookingRef} — ${extra.description}`,
      extraChangedEmail(full, { description: extra.description, amount: Number(extra.amount) }, "removed", oldTotal, newTotal)
    );
  }

  // Rezervim i BILETUAR + shtesë e fshirë ⇒ kthehet në KONFIRMUAR.
  void revertTicketedToConfirmed(bookingId, req, `U fshi shtesa "${extra.description}" pas lëshimit`);
});

router.post("/bookings/:id/payments", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { amount, reference, notes } = req.body ?? {};
  const selected = await validateManualPaymentMethod(req.body?.method);
  if ("error" in selected) {
    res.status(400).json({ error: selected.error });
    return;
  }
  const payMethod = selected.method;
  const amt = roundWholeEuro(Number(amount));
  // Lejohen edhe pagesa me MINUS (korrigjim/zbritje) — vetëm 0 nuk lejohet.
  if (isNaN(amt) || amt === 0) { res.status(400).json({ error: "Shuma nuk mund të jetë 0" }); return; }
  if (amt < 0 && payMethod === "credit") { res.status(400).json({ error: "Pagesa me kredit nuk mund të jetë me minus" }); return; }

  const result = await db.transaction(async tx => {
    // Serialize payments with cancellation/restore before performing any other DB work.
    const [booking] = await tx.select().from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .for("update");
    if (!booking) return { errorStatus: 404, error: "Booking not found" } as const;
    if (booking.status === "cancelled") {
      return { errorStatus: 409, error: "Rezervimi është i anuluar. Pagesat nuk mund të shtohen." } as const;
    }

    // Calculate current paid amount BEFORE this new payment.
    const existingPayments = await tx.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
    const currentPaid = existingPayments
      .filter(p => p.status === "completed")
      .reduce((s, p) => s + (p.isRefund ? -1 : 1) * Number(p.amount), 0);
    const totalAmount = Number(booking.totalAmount);

    // Prevent overpayment.
    const remaining = wholeEuroDue(totalAmount, currentPaid);
    if (amt > remaining + 0.001) {
      return {
        errorStatus: 400,
        error: `Shuma e paguar (€${formatWholeEuro(amt)}) kalon shumën e mbetur (€${formatWholeEuro(remaining)}). Pagesa maksimale e lejuar është €${formatWholeEuro(remaining)}.`,
      } as const;
    }

    if (payMethod === "credit") {
      if (!booking.agentId) {
        return { errorStatus: 400, error: "Ky rezervim nuk ka agjent — nuk mund të përdoret kredit" } as const;
      }

      // The conditional arithmetic update prevents two bookings from spending the
      // same wallet balance concurrently.
      const [debitedAgent] = await tx.update(agentsTable)
        .set({ walletBalance: sql`${agentsTable.walletBalance} - ${amt}` })
        .where(and(
          eq(agentsTable.id, booking.agentId),
          sql`${agentsTable.walletBalance} >= ${amt}`,
        ))
        .returning({ id: agentsTable.id });
      if (!debitedAgent) {
        const [agent] = await tx.select().from(agentsTable).where(eq(agentsTable.id, booking.agentId));
        if (!agent) return { errorStatus: 404, error: "Agent not found" } as const;
        return {
          errorStatus: 400,
          error: `Balanca e krediteve (€${formatWholeEuro(agent.walletBalance)}) është e pamjaftueshme`,
        } as const;
      }
      await tx.insert(agentCreditTransactionsTable).values({
        agentId: booking.agentId,
        type: "payment",
        amount: String(amt),
        bookingId: id,
        bookingRef: booking.bookingRef,
        reference: reference || null,
        notes: notes || null,
      });
    }

    // Insert the main payment record.
    const [mainPayment] = await tx.insert(paymentsTable).values({
      bookingId: id,
      amount: String(amt),
      method: payMethod,
      reference: reference || null,
      notes: notes || null,
      status: "completed",
      isRefund: false,
    }).returning();

    // Historiku i pagesës: krijim.
    await tx.insert(paymentChangeLogsTable).values({
      paymentId: mainPayment.id,
      userId: (req as any).session?.userId ?? null,
      userName: (req as any).session?.userName ?? "System",
      userRole: (req as any).session?.role ?? null,
      action: "created",
      newValue: `€${formatWholeEuro(amt)} · ${payMethod}${reference ? ` · Ref: ${reference}` : ""} (${booking.bookingRef})`,
      note: notes || null,
    });

    // For non-credit payments to agent bookings: record in credit history for tracking (does NOT affect walletBalance).
    if (payMethod !== "credit" && booking.agentId) {
      const methodLabel: Record<string, string> = {
        cash: "Cash", bank_transfer: "Bankë", card: "Kartë", online: "Online",
      };
      await tx.insert(agentCreditTransactionsTable).values({
        agentId: booking.agentId,
        type: "payment",
        amount: String(amt),
        bookingId: id,
        bookingRef: booking.bookingRef,
        reference: reference || null,
        notes: `Pagesë ${methodLabel[payMethod] ?? payMethod}${notes ? ": " + notes : ""}`,
      });
    }

    // Auto-refund if payment causes overpayment (newPaid > totalAmount).
    const newPaid = Math.max(0, currentPaid) + amt;
    const excessAmt = wholeEuroOverpay(newPaid, totalAmount);

    if (excessAmt > 0) {
      const overNote = `Mbipagesë: paguar €${formatWholeEuro(newPaid)} mbi totalin €${formatWholeEuro(totalAmount)} — teprica €${formatWholeEuro(excessAmt)} u kreditua`;

      // Refund payment record so paidAmount stays at totalAmount.
      const [overRefund] = await tx.insert(paymentsTable).values({
        bookingId: id,
        amount: String(excessAmt),
        method: payMethod,
        reference: null,
        notes: overNote,
        status: "completed",
        isRefund: true,
      }).returning();
      if (overRefund) {
        await tx.insert(paymentChangeLogsTable).values({
          paymentId: overRefund.id,
          userId: (req as any).session?.userId ?? null,
          userName: (req as any).session?.userName ?? "System",
          userRole: (req as any).session?.role ?? null,
          action: "created",
          newValue: `Rimbursim automatik €${formatWholeEuro(excessAmt)} (tepricë mbipagese)`,
          note: overNote,
        });
      }

      // Credit the agent's wallet if this booking has an agent.
      if (booking.agentId) {
        const [creditedAgent] = await tx.update(agentsTable)
          .set({ walletBalance: sql`${agentsTable.walletBalance} + ${excessAmt}` })
          .where(eq(agentsTable.id, booking.agentId))
          .returning({ id: agentsTable.id });
        if (creditedAgent) {
          await tx.insert(agentCreditTransactionsTable).values({
            agentId: booking.agentId,
            type: "refund",
            amount: String(excessAmt),
            bookingId: id,
            bookingRef: booking.bookingRef,
            reference: null,
            notes: overNote,
          });
        }
      }
    }

    // Recalculate and update paid_amount on the booking.
    const allPayments = await tx.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
    const recalcPaid = allPayments
      .filter(p => p.status === "completed")
      .reduce((s, p) => s + (p.isRefund ? -1 : 1) * Number(p.amount), 0);
    await tx.update(bookingsTable)
      .set({ paidAmount: String(Math.max(0, recalcPaid)) })
      .where(eq(bookingsTable.id, id));

    // Keep both booking and payment audit rows in the payment transaction.
    await tx.insert(bookingChangeLogsTable).values({
      bookingId: id,
      userId: (req as any).session?.userId ?? null,
      userName: (req as any).session?.userName ?? "Staff",
      userRole: (req as any).session?.role ?? null,
      action: "payment_added",
      fieldName: "Pagesa",
      oldValue: null,
      newValue: `€${formatWholeEuro(amt)} (${payMethod})${mainPayment?.invoiceCode ? ` · ${mainPayment.invoiceCode}` : ""}`,
      note: notes || null,
    });

    return { mainPayment } as const;
  });

  if (result.errorStatus !== undefined) {
    res.status(result.errorStatus).json({ error: result.error });
    return;
  }

  const full = await getFullBooking(id);
  res.json(full);

  // Generate + email the invoice (PDF) to agent + admin. Fire-and-forget.
  if (result.mainPayment) {
    sendPaymentInvoice(result.mainPayment.id).catch(() => {});
  }
  scheduleExcelSync();
  scheduleGSheetsSync();
});

export default router;
