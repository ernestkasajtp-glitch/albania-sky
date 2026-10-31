import { db, bookingsTable as b, flightsTable as f, agentsTable as a, passengersTable as p,
  paymentsTable as pay, groupTicketSalesTable as gs, groupTicketsTable as gt, bookingEmailAlertsTable as alerts } from "@workspace/db";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { wholeEuroDue } from "./money.js";
import { getBookingReadRevision } from "./liveEvents.js";

// A short-lived *internal* search projection, not full booking responses.
// Never retain full flight/payment/extra documents or send this index to clients.
// One rebuild serves concurrent sessions; SSE writes immediately invalidate it.
const TTL_MS = 10_000;
let cached: { revision: number; expires: number; rows: any[] } | null = null;
let pending: { revision: number; promise: Promise<any[]> } | null = null;

export async function loadPremiumBookingIndex(): Promise<any[]> {
  return db.transaction(async tx => {
    const bookings = await tx.select({
      booking: {
        id: b.id, agentId: b.agentId, bookingRef: b.bookingRef, pnr: b.pnr,
        customerName: b.customerName, customerEmail: b.customerEmail, customerPhone: b.customerPhone,
        source: b.source, notes: b.notes, status: b.status, createdAt: b.createdAt,
        totalAmount: b.totalAmount, netPrice: b.netPrice,
        ticketSearchExcluded: b.ticketSearchExcluded, ticketSearchNote: b.ticketSearchNote,
        airlineTicketUrl: b.airlineTicketUrl, ticketEmailPending: b.ticketEmailPending,
      },
      flight: { airline: f.airline, flightNumber: f.flightNumber, fromCity: f.fromCity,
        toCity: f.toCity, departureDate: f.departureDate, departureTime: f.departureTime },
      agentName: a.name, showInReports: a.showInReports,
    }).from(b).leftJoin(f, eq(b.flightId, f.id)).leftJoin(a, eq(b.agentId, a.id))
      .orderBy(desc(b.createdAt));
    const passengers = await tx.select({
      id: p.id, bookingId: p.bookingId, firstName: p.firstName, lastName: p.lastName,
      type: p.type, cancelled: p.cancelled, passportNumber: p.passportNumber,
      pnr: p.pnr, seatNumber: p.seatNumber,
    }).from(p);
    const payments = await tx.select({ bookingId: pay.bookingId, amount: pay.amount, isRefund: pay.isRefund })
      .from(pay).where(eq(pay.status, "completed"));
    const groups = await tx.select({ passengerId: gs.bookingPassengerId, pnrNew: gs.pnrNew, pnrOriginal: gt.pnrOriginal })
      .from(gs).leftJoin(gt, eq(gs.groupTicketId, gt.id)).orderBy(desc(gs.createdAt));
    const alertCounts = await tx.select({ bookingId: alerts.bookingId, count: sql<number>`count(*)::int` })
      .from(alerts).where(isNull(alerts.readAt)).groupBy(alerts.bookingId);
    const groupMap = new Map<number, string>();
    for (const g of groups) {
      const pnr = (g.pnrNew ?? "").trim() || (g.pnrOriginal ?? "").trim();
      if (g.passengerId != null && pnr && !groupMap.has(g.passengerId)) groupMap.set(g.passengerId, pnr);
    }
    const paxMap = new Map<number, any[]>();
    for (const passenger of passengers) {
      const list = paxMap.get(passenger.bookingId) ?? [];
      list.push({ ...passenger, groupPnr: groupMap.get(passenger.id) ?? null });
      paxMap.set(passenger.bookingId, list);
    }
    const money = new Map<number, { paid: number; refunded: number }>();
    for (const payment of payments) {
      const sums = money.get(payment.bookingId) ?? { paid: 0, refunded: 0 };
      if (payment.isRefund) sums.refunded += Number(payment.amount);
      else sums.paid += Number(payment.amount);
      money.set(payment.bookingId, sums);
    }
    const alertMap = new Map(alertCounts.map(row => [row.bookingId, Number(row.count)]));
    return bookings.map(({ booking, flight, agentName, showInReports }) => {
      const sums = money.get(booking.id) ?? { paid: 0, refunded: 0 };
      // Keep getBatchFullBookings' read formulas verbatim; no stored amounts change.
      const rawPaid = Math.max(0, sums.paid - sums.refunded);
      const totalAmount = Number(booking.totalAmount);
      return {
        ...booking, createdAt: booking.createdAt.toISOString(), flight, agentName,
        hiddenFromReports: booking.agentId != null && showInReports === false,
        passengers: paxMap.get(booking.id) ?? [], emailAlertsCount: alertMap.get(booking.id) ?? 0,
        totalAmount, paidAmount: Math.min(rawPaid, totalAmount),
        dueAmount: wholeEuroDue(totalAmount, rawPaid), creditAmount: Math.max(0, rawPaid - totalAmount),
        netPrice: booking.netPrice != null ? Number(booking.netPrice) : null,
        commissionAmount: booking.netPrice != null
          ? (Number(booking.netPrice) <= 0 ? 0 : Math.round((totalAmount - Number(booking.netPrice)) * 100) / 100)
          : null,
      };
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function getPremiumBookingIndex(): Promise<any[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const revision = getBookingReadRevision();
    if (cached?.revision === revision && cached.expires > Date.now()) return cached.rows;
    // Even a write during rebuild must not start a parallel all-index rebuild.
    if (!pending) {
      const promise = loadPremiumBookingIndex();
      pending = { revision, promise };
    }
    const job = pending;
    let rows: any[];
    try { rows = await job.promise; }
    finally { if (pending === job) pending = null; }
    if (getBookingReadRevision() !== job.revision) continue;
    cached = { rows, revision: job.revision, expires: Date.now() + TTL_MS };
    return rows;
  }
  throw new Error("Rezervimet po përditësohen. Provo përsëri.");
}