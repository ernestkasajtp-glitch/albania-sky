import { Router, type IRouter } from "express";
import { eq, sql, gte, lte, and, desc, inArray, asc } from "drizzle-orm";
import { db, bookingsTable, flightsTable, passengersTable, paymentsTable, agentsTable } from "@workspace/db";
import { GetRecentBookingsQueryParams } from "@workspace/api-zod";
import { getSplitNetTotalsMap, calcCombinedNetAndCommission } from "../lib/getFullBooking.js";
import { buildPassengersReportData, generatePassengersPdf } from "../lib/passengersReport.js";
import type { InferSelectModel } from "drizzle-orm";
import { wholeEuroDue } from "../lib/money.js";

const router: IRouter = Router();

// SQL aggregation: net paid per booking (completed payments, refunds subtracted).
async function buildPaidMapSQL(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      bookingId: paymentsTable.bookingId,
      netPaid: sql<string>`SUM(CASE WHEN ${paymentsTable.isRefund} THEN -(${paymentsTable.amount}::numeric) ELSE ${paymentsTable.amount}::numeric END)`,
    })
    .from(paymentsTable)
    .where(eq(paymentsTable.status, "completed"))
    .groupBy(paymentsTable.bookingId);

  const map = new Map<number, number>();
  for (const r of rows) map.set(r.bookingId, Number(r.netPaid ?? 0));
  return map;
}

// Batch-fetches dashboard booking data for multiple IDs in ~4 queries instead of N×4.
async function getBatchFullBookingsDash(ids: number[]) {
  if (ids.length === 0) return [];

  const [bookings, allPassengers, allPayments] = await Promise.all([
    db.select().from(bookingsTable).where(inArray(bookingsTable.id, ids)),
    db.select().from(passengersTable).where(inArray(passengersTable.bookingId, ids)),
    db.select().from(paymentsTable).where(inArray(paymentsTable.bookingId, ids)),
  ]);

  const flightIds = [...new Set(bookings.map(b => b.flightId))];
  const agentIds  = [...new Set(bookings.flatMap(b => b.agentId != null ? [b.agentId] : []))];

  const [flights, agents] = await Promise.all([
    flightIds.length > 0
      ? db.select().from(flightsTable).where(inArray(flightsTable.id, flightIds))
      : ([] as InferSelectModel<typeof flightsTable>[]),
    agentIds.length > 0
      ? db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable).where(inArray(agentsTable.id, agentIds))
      : ([] as { id: number; name: string }[]),
  ]);

  const flightMap = new Map(flights.map(f => [f.id, f]));
  const agentMap  = new Map(agents.map(a => [a.id, a.name]));
  const passByBooking = new Map<number, typeof allPassengers>();
  const payByBooking  = new Map<number, typeof allPayments>();
  for (const p of allPassengers) { const a = passByBooking.get(p.bookingId) ?? []; a.push(p); passByBooking.set(p.bookingId, a); }
  for (const p of allPayments)   { const a = payByBooking.get(p.bookingId)  ?? []; a.push(p); payByBooking.set(p.bookingId, a); }

  return bookings.map(booking => {
    const flight     = flightMap.get(booking.flightId) ?? null;
    const passengers = passByBooking.get(booking.id) ?? [];
    const payments   = payByBooking.get(booking.id)  ?? [];
    const agentName  = booking.agentId != null ? (agentMap.get(booking.agentId) ?? null) : null;

    const formattedFlight = flight ? {
      ...flight,
      netPrice: undefined, // çmimi neto informativ — vetëm te lista e fluturimeve (admin)
      adultPrice: Number(flight.adultPrice), childPrice: Number(flight.childPrice),
      infantPrice: Number(flight.infantPrice), tax: Number(flight.tax),
      cabinBaggageKg:        flight.cabinBaggageKg        != null ? Number(flight.cabinBaggageKg)        : null,
      checkedBaggageKg:      flight.checkedBaggageKg      != null ? Number(flight.checkedBaggageKg)      : null,
      checkedBaggagePrice:   flight.checkedBaggagePrice   != null ? Number(flight.checkedBaggagePrice)   : null,
      seatSelectionPrice:    flight.seatSelectionPrice    != null ? Number(flight.seatSelectionPrice)    : null,
      priorityBoardingPrice: flight.priorityBoardingPrice != null ? Number(flight.priorityBoardingPrice) : null,
      insurancePrice:        flight.insurancePrice        != null ? Number(flight.insurancePrice)        : null,
      availableSeats: flight.totalSeats - flight.soldSeats,
      createdAt: flight.createdAt.toISOString(), updatedAt: flight.updatedAt.toISOString(),
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
      totalAmount, paidAmount, dueAmount, creditAmount,
      markup: Number(booking.markup), commission: Number(booking.commission),
      agentName, flight: formattedFlight,
      passengers: passengers.map(p => ({
        ...p,
        extraCost: Number(p.extraCost),
        ticketPrice: p.ticketPrice != null ? Number(p.ticketPrice) : null,
        createdAt: p.createdAt.toISOString(),
      })),
      payments: payments.map(p => ({ ...p, amount: Number(p.amount), createdAt: p.createdAt.toISOString() })),
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  });
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  // "Sot" = since midnight in Albania (Europe/Tirane), not the server's UTC
  // midnight (which is 01:00/02:00 local and dropped the night's first bookings).
  const today = sql`(date_trunc('day', now() AT TIME ZONE 'Europe/Tirane') AT TIME ZONE 'Europe/Tirane')`;

  const [todayBookings, paidMap, statusRows, [seatRow], minimalNonCancelled] = await Promise.all([
    db.select().from(bookingsTable).where(and(
      sql`${bookingsTable.createdAt} >= ${today}`,
      sql`${bookingsTable.status} != 'cancelled'`,
    )),
    buildPaidMapSQL(),
    db.select({
      status:  bookingsTable.status,
      cnt:     sql<string>`COUNT(*)::text`,
      revenue: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}::numeric), 0)::text`,
    }).from(bookingsTable).groupBy(bookingsTable.status),
    db.select({
      totalSeats: sql<string>`COALESCE(SUM(${flightsTable.totalSeats}), 0)::text`,
      soldSeats:  sql<string>`COALESCE(SUM(${flightsTable.soldSeats}),  0)::text`,
    }).from(flightsTable),
    db.select({ id: bookingsTable.id, totalAmount: bookingsTable.totalAmount })
      .from(bookingsTable)
      .where(sql`${bookingsTable.status} != 'cancelled'`),
  ]);

  const salesToday = todayBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0);
  const todaySplitNetMap = await getSplitNetTotalsMap(todayBookings.map(b => b.id));
  const profitToday = todayBookings.reduce((sum, b) => {
    const { commission } = calcCombinedNetAndCommission(Number(b.totalAmount), b.netPrice != null ? Number(b.netPrice) : null, todaySplitNetMap.get(b.id) ?? 0, Number(b.markup));
    return sum + commission;
  }, 0);

  const bookingsByStatus: Record<string, number> = {};
  let totalBookings = 0;
  let totalRevenue = 0;
  for (const r of statusRows) {
    bookingsByStatus[r.status] = Number(r.cnt);
    totalBookings += Number(r.cnt);
    if (r.status !== "cancelled") totalRevenue += Number(r.revenue);
  }

  const unpaidList = minimalNonCancelled.filter(b => wholeEuroDue(Number(b.totalAmount), paidMap.get(b.id) ?? 0) > 0);
  const unpaidAmount = unpaidList.reduce((sum, b) => sum + wholeEuroDue(Number(b.totalAmount), paidMap.get(b.id) ?? 0), 0);

  res.json({
    bookingsToday:       todayBookings.length,
    salesToday,
    profitToday,
    unpaidBookings:      unpaidList.length,
    unpaidAmount,
    totalSeatsAvailable: Number(seatRow?.totalSeats ?? 0) - Number(seatRow?.soldSeats ?? 0),
    totalSeatsSold:      Number(seatRow?.soldSeats ?? 0),
    totalBookings,
    totalRevenue,
    bookingsByStatus,
  });
});

// Numri i pasagjerëve (jo të anuluar, në rezervime jo të anuluara) që kanë
// biletë për fluturim me nisje në intervalin e dhënë (default: SOT, Europe/Tirane).
// Query opsionale: dateFrom / dateTo (YYYY-MM-DD).
router.get("/dashboard/passengers-today", async (req, res): Promise<void> => {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const todayTirane = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
  const rawFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : "";
  const rawTo   = typeof req.query.dateTo   === "string" ? req.query.dateTo   : "";
  const dateFrom = DATE_RE.test(rawFrom) ? rawFrom : todayTirane;
  const dateTo   = DATE_RE.test(rawTo)   ? rawTo   : dateFrom;

  const [row] = await db
    .select({ cnt: sql<string>`COUNT(*)::text` })
    .from(passengersTable)
    .innerJoin(bookingsTable, eq(passengersTable.bookingId, bookingsTable.id))
    .innerJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
    .where(and(
      gte(flightsTable.departureDate, dateFrom),
      lte(flightsTable.departureDate, dateTo),
      sql`${bookingsTable.status} != 'cancelled'`,
      sql`COALESCE(${passengersTable.cancelled}, false) = false`,
    ));
  res.json({ count: Number(row?.cnt ?? 0) });
});

// Numri i pasagjerëve për çdo ditë në intervalin e kërkuar. Pa query ruhet
// fallback-u historik: 30 ditët e ardhshme duke nisur nga sot (Europe/Tirane).
// Semantikë e njëjtë me passengers-today: rezervime jo të anuluara + pasagjerë
// jo të anuluar, sipas datës së nisjes së fluturimit.
router.get("/dashboard/passengers-upcoming", async (req, res): Promise<void> => {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const todayTirane = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" }); // YYYY-MM-DD
  const rawFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : "";
  const rawTo = typeof req.query.dateTo === "string" ? req.query.dateTo : "";
  const dateFrom = DATE_RE.test(rawFrom) ? rawFrom : todayTirane;
  const defaultEnd = new Date(`${dateFrom}T00:00:00Z`);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 29);
  const dateTo = DATE_RE.test(rawTo) ? rawTo : defaultEnd.toISOString().slice(0, 10);

  if (dateFrom > dateTo) {
    res.status(400).json({ error: "Data e fillimit s'mund të jetë pas asaj të mbarimit." });
    return;
  }

  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (dayCount > 3660) {
    res.status(400).json({ error: "Intervali i grafikës nuk mund të kalojë 10 vjet." });
    return;
  }

  const rows = await db
    .select({
      date: flightsTable.departureDate,
      cnt: sql<string>`COUNT(*)::text`,
    })
    .from(passengersTable)
    .innerJoin(bookingsTable, eq(passengersTable.bookingId, bookingsTable.id))
    .innerJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
    .where(and(
      gte(flightsTable.departureDate, dateFrom),
      lte(flightsTable.departureDate, dateTo),
      sql`${bookingsTable.status} != 'cancelled'`,
      sql`COALESCE(${passengersTable.cancelled}, false) = false`,
    ))
    .groupBy(flightsTable.departureDate);

  const countByDate = new Map(rows.map(r => [r.date, Number(r.cnt)]));
  const days: { date: string; label: string; count: number }[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      label: d.toLocaleDateString("sq-AL", { day: "2-digit", month: "short", timeZone: "UTC" }),
      count: countByDate.get(iso) ?? 0,
    });
  }
  res.json({ days });
});

// ── Kërkim pasagjerësh sipas fluturimit (VETËM ADMIN) ──
// Query: date (YYYY-MM-DD, e detyrueshme), from / to (opsionale, ILIKE pjesore).
// Rikthen grupet e fluturimeve me pasagjerë + komisionin — njësoj si raporti i email-it.
const PAX_SEARCH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function paxSearchParams(req: { query: Record<string, unknown> }): { date: string; from?: string; to?: string } | null {
  const date = typeof req.query.date === "string" ? req.query.date : "";
  if (!PAX_SEARCH_DATE_RE.test(date)) return null;
  const from = typeof req.query.from === "string" ? req.query.from.trim().slice(0, 60) : "";
  const to = typeof req.query.to === "string" ? req.query.to.trim().slice(0, 60) : "";
  return { date, from: from || undefined, to: to || undefined };
}

router.get("/dashboard/passengers-search", async (req, res): Promise<void> => {
  if ((req as any).session?.role !== "admin") { res.status(403).json({ error: "Vetëm administratori" }); return; }
  const p = paxSearchParams(req);
  if (!p) { res.status(400).json({ error: "Data e pavlefshme (YYYY-MM-DD)" }); return; }
  const { groups, totalPax, commissionTotal } = await buildPassengersReportData(p.date, { from: p.from, to: p.to });
  res.json({
    date: p.date,
    totalPax,
    totalCommission: commissionTotal,
    flights: groups.map(g => ({ title: g.title, pax: g.rows.length, commission: g.commission })),
  });
});

router.get("/dashboard/passengers-search/pdf", async (req, res): Promise<void> => {
  if ((req as any).session?.role !== "admin") { res.status(403).json({ error: "Vetëm administratori" }); return; }
  const p = paxSearchParams(req);
  if (!p) { res.status(400).json({ error: "Data e pavlefshme (YYYY-MM-DD)" }); return; }
  const { groups, totalPax, commissionTotal } = await buildPassengersReportData(p.date, { from: p.from, to: p.to });
  const [yy, mm, dd] = p.date.split("-");
  const pdf = await generatePassengersPdf(`${dd}.${mm}.${yy}`, groups, totalPax, commissionTotal);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="pasagjeret_${p.date}.pdf"`);
  res.send(pdf);
});

router.get("/dashboard/recent-bookings", async (req, res): Promise<void> => {
  const parsed = GetRecentBookingsQueryParams.safeParse(req.query);
  const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 10;

  const bookings = await db
    .select()
    .from(bookingsTable)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(limit);

  const full = await getBatchFullBookingsDash(bookings.map(b => b.id));
  res.json(full.filter(Boolean));
});

router.get("/dashboard/unpaid-bookings", async (_req, res): Promise<void> => {
  const [paidMap, minimalBookings] = await Promise.all([
    buildPaidMapSQL(),
    db.select({ id: bookingsTable.id, totalAmount: bookingsTable.totalAmount })
      .from(bookingsTable)
      .where(sql`${bookingsTable.status} != 'cancelled'`),
  ]);

  const unpaidIds = minimalBookings
    .filter(b => wholeEuroDue(Number(b.totalAmount), paidMap.get(b.id) ?? 0) > 0)
    .map(b => b.id);

  const full = await getBatchFullBookingsDash(unpaidIds);
  res.json(full.filter(Boolean));
});

router.get("/dashboard/analytics", async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
  const isAdmin = (req as any).session?.role === "admin";

  // Determine hidden agent IDs for non-admins (SQL-only, no full table scan in JS)
  let hiddenAgentIds: number[] = [];
  if (!isAdmin) {
    const hidden = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.showInReports, false));
    hiddenAgentIds = hidden.map(a => a.id);
  }

  // Build reusable SQL fragments
  const notCancelled = sql`${bookingsTable.status} != 'cancelled'`;
  const notHidden = hiddenAgentIds.length > 0
    ? sql`(${bookingsTable.agentId} IS NULL OR ${bookingsTable.agentId} NOT IN (${sql.join(hiddenAgentIds.map(id => sql`${id}`), sql`,`)}))`
    : sql`TRUE`;

  // Period bounds
  const periodStart = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
  const periodEnd   = dateTo   ? new Date(dateTo   + "T23:59:59") : null;

  // Conditions for period-filtered queries
  const periodConds: ReturnType<typeof sql>[] = [notCancelled, notHidden];
  if (periodStart) periodConds.push(sql`${bookingsTable.createdAt} >= ${periodStart}`);
  if (periodEnd)   periodConds.push(sql`${bookingsTable.createdAt} <= ${periodEnd}`);

  // Conditions for unfiltered active queries (charts that always show full history)
  const activeConds = [notCancelled, notHidden];

  // Date windows for chart queries
  const since30 = new Date();
  since30.setDate(since30.getDate() - 29);
  since30.setHours(0, 0, 0, 0);

  const since12m = new Date();
  since12m.setMonth(since12m.getMonth() - 11);
  since12m.setDate(1);
  since12m.setHours(0, 0, 0, 0);

  // Run all heavy aggregations in parallel — no full table loads into JS memory
  const [
    revenueByDayRows,
    revenueByMonthRows,
    topDestRows,
    topAgentRows,
    highDateRows,
    almostSoldOutRows,
    statusRows,
    paidMap,
    filteredBookings,
  ] = await Promise.all([
    // Revenue by day — last 30 days (SQL GROUP BY)
    db.select({
      date:     sql<string>`(${bookingsTable.createdAt} AT TIME ZONE 'UTC')::date::text`,
      revenue:  sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}::numeric), 0)::text`,
      bookings: sql<string>`COUNT(*)::text`,
    })
      .from(bookingsTable)
      .where(and(...activeConds, gte(bookingsTable.createdAt, since30)))
      .groupBy(sql`(${bookingsTable.createdAt} AT TIME ZONE 'UTC')::date`)
      .orderBy(asc(sql`(${bookingsTable.createdAt} AT TIME ZONE 'UTC')::date`)),

    // Revenue by month — last 12 months (SQL GROUP BY)
    db.select({
      month:    sql<string>`TO_CHAR(${bookingsTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`,
      revenue:  sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}::numeric), 0)::text`,
      bookings: sql<string>`COUNT(*)::text`,
    })
      .from(bookingsTable)
      .where(and(...activeConds, gte(bookingsTable.createdAt, since12m)))
      .groupBy(sql`TO_CHAR(${bookingsTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`)
      .orderBy(asc(sql`TO_CHAR(${bookingsTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`)),

    // Top destinations — period filtered, JOIN with flights
    db.select({
      from:    flightsTable.fromCity,
      to:      flightsTable.toCity,
      count:   sql<string>`COUNT(*)::text`,
      revenue: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}::numeric), 0)::text`,
    })
      .from(bookingsTable)
      .innerJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
      .where(and(...periodConds))
      .groupBy(flightsTable.fromCity, flightsTable.toCity)
      .orderBy(desc(sql`COUNT(*)`), desc(sql`SUM(${bookingsTable.totalAmount}::numeric)`))
      .limit(6),

    // Top agents — period filtered, JOIN with agents
    db.select({
      name:    agentsTable.name,
      count:   sql<string>`COUNT(*)::text`,
      revenue: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}::numeric), 0)::text`,
    })
      .from(bookingsTable)
      .innerJoin(agentsTable, eq(bookingsTable.agentId, agentsTable.id))
      .where(and(...periodConds, sql`${bookingsTable.agentId} IS NOT NULL`))
      .groupBy(agentsTable.name)
      .orderBy(desc(sql`SUM(${bookingsTable.totalAmount}::numeric)`))
      .limit(5),

    // High departure dates — unfiltered active, JOIN with flights
    db.select({
      departureDate: flightsTable.departureDate,
      count:         sql<string>`COUNT(*)::text`,
      revenue:       sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}::numeric), 0)::text`,
    })
      .from(bookingsTable)
      .innerJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
      .where(and(...activeConds))
      .groupBy(flightsTable.departureDate)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(6),

    // Almost sold out flights
    db.select({
      id:            flightsTable.id,
      flightNumber:  flightsTable.flightNumber,
      fromCity:      flightsTable.fromCity,
      toCity:        flightsTable.toCity,
      departureDate: flightsTable.departureDate,
      totalSeats:    flightsTable.totalSeats,
      soldSeats:     flightsTable.soldSeats,
    })
      .from(flightsTable)
      .where(and(
        eq(flightsTable.status, "open"),
        sql`${flightsTable.totalSeats} > 0`,
        sql`(${flightsTable.totalSeats} - ${flightsTable.soldSeats}) < 10`,
      ))
      .orderBy(asc(sql`${flightsTable.totalSeats} - ${flightsTable.soldSeats}`))
      .limit(8),

    // Status breakdown (GROUP BY status, non-hidden)
    db.select({
      status: bookingsTable.status,
      cnt:    sql<string>`COUNT(*)::text`,
    })
      .from(bookingsTable)
      .where(notHidden)
      .groupBy(bookingsTable.status),

    // Paid map (for debt calculation)
    buildPaidMapSQL(),

    // Minimal booking rows for commission + passenger count + debt (period-filtered)
    // Fetch only the columns needed — avoid pulling all fields
    db.select({
      id:          bookingsTable.id,
      totalAmount: bookingsTable.totalAmount,
      netPrice:    bookingsTable.netPrice,
      markup:      bookingsTable.markup,
      agentId:     bookingsTable.agentId,
    })
      .from(bookingsTable)
      .where(and(...periodConds)),
  ]);

  // ── Build revenue-by-day (fill gaps for last 30 days) ──────────────────────
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const sinceDay = new Date(today);
  sinceDay.setDate(sinceDay.getDate() - 29);
  sinceDay.setHours(0, 0, 0, 0);

  const dayMap: Record<string, { revenue: number; bookings: number }> = {};
  for (let d = new Date(sinceDay); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = { revenue: 0, bookings: 0 };
  }
  for (const r of revenueByDayRows) {
    if (dayMap[r.date]) {
      dayMap[r.date].revenue  = Math.round(Number(r.revenue) * 100) / 100;
      dayMap[r.date].bookings = Number(r.bookings);
    }
  }
  const revenueByDay = Object.entries(dayMap).map(([date, v]) => ({
    date,
    label: new Date(date).toLocaleDateString("sq-AL", { day: "2-digit", month: "short" }),
    revenue: v.revenue,
    bookings: v.bookings,
  }));

  // ── Build revenue-by-month (fill gaps for last 12 months) ──────────────────
  const monthMap: Record<string, { revenue: number; bookings: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    monthMap[key] = { revenue: 0, bookings: 0 };
  }
  for (const r of revenueByMonthRows) {
    if (monthMap[r.month]) {
      monthMap[r.month].revenue  = Math.round(Number(r.revenue) * 100) / 100;
      monthMap[r.month].bookings = Number(r.bookings);
    }
  }
  const revenueByMonth = Object.entries(monthMap).map(([month, v]) => ({
    month,
    label: new Date(month + "-01").toLocaleDateString("sq-AL", { month: "short", year: "numeric" }),
    revenue: v.revenue,
    bookings: v.bookings,
  }));

  // ── Top destinations ────────────────────────────────────────────────────────
  const topDestinations = topDestRows.map(r => ({
    from:     r.from,
    to:       r.to,
    count:    Number(r.count),
    revenue:  Math.round(Number(r.revenue) * 100) / 100,
  }));

  // ── Top agents ──────────────────────────────────────────────────────────────
  const topAgents = topAgentRows.map(r => ({
    name:    r.name,
    count:   Number(r.count),
    revenue: Math.round(Number(r.revenue) * 100) / 100,
  }));

  // ── High dates ──────────────────────────────────────────────────────────────
  const highDates = highDateRows.map(r => ({
    date:    r.departureDate,
    label:   new Date(r.departureDate).toLocaleDateString("sq-AL", { day: "2-digit", month: "short", year: "numeric" }),
    count:   Number(r.count),
    revenue: Math.round(Number(r.revenue) * 100) / 100,
  }));

  // ── Almost sold out ─────────────────────────────────────────────────────────
  const almostSoldOut = almostSoldOutRows.map(f => ({
    ...f,
    netPrice: undefined, // çmimi neto informativ — vetëm te lista e fluturimeve (admin)
    availableSeats: f.totalSeats - f.soldSeats,
  }));

  // ── Status breakdown ────────────────────────────────────────────────────────
  const statusBreakdown: Record<string, number> = {};
  let totalBookingsAll = 0;
  for (const r of statusRows) {
    statusBreakdown[r.status] = Number(r.cnt);
    totalBookingsAll += Number(r.cnt);
  }

  // ── Total metrics (period-filtered, commission needs split net map) ─────────
  const filteredIds = filteredBookings.map(b => b.id);

  const [filteredSplitNetMap, paxRow] = await Promise.all([
    getSplitNetTotalsMap(filteredIds),
    filteredIds.length > 0
      ? db.select({ count: sql<number>`COUNT(*)` })
          .from(passengersTable)
          .where(and(
            inArray(passengersTable.bookingId, filteredIds),
            sql`${passengersTable.type} != 'infant'`,
          ))
      : Promise.resolve([{ count: 0 }]),
  ]);

  let totalRevenue   = 0;
  let totalPaidAll   = 0;
  let totalCommission = 0;

  // Borxhi bruto (para kreditit të agjentëve). E grupojmë borxhin sipas agjentit,
  // që më poshtë t'i zbresim çdo agjenti kreditin e vet (walletBalance) — pa lejuar
  // që krediti i një agjenti të fshijë borxhin e një tjetri.
  let nonAgentDebt = 0;                          // borxhi i rezervimeve pa agjent
  const debtByAgent = new Map<number, number>(); // agentId -> borxh bruto (në interval)

  for (const b of filteredBookings) {
    const amount = Number(b.totalAmount);
    const paid   = Math.max(0, paidMap.get(b.id) ?? 0);
    totalRevenue  += amount;
    totalPaidAll  += Math.min(paid, amount);
    const debt = wholeEuroDue(amount, paid);
    if (b.agentId != null) {
      debtByAgent.set(b.agentId, (debtByAgent.get(b.agentId) ?? 0) + debt);
    } else {
      nonAgentDebt += debt;
    }
    const { commission } = calcCombinedNetAndCommission(
      amount,
      b.netPrice != null ? Number(b.netPrice) : null,
      filteredSplitNetMap.get(b.id) ?? 0,
      Number(b.markup),
    );
    totalCommission += commission;
  }

  // Zbrit kreditin (walletBalance) e secilit agjent nga borxhi i tij — i kufizuar,
  // që borxhi neto për agjent të mos shkojë kurrë nën zero. Agjentët kanë paguar
  // paraprakisht edhe pse shumat s'janë kaluar ende në bileta.
  const debtAgentIds = [...debtByAgent.keys()];
  const walletRows = debtAgentIds.length > 0
    ? await db
        .select({ id: agentsTable.id, walletBalance: agentsTable.walletBalance })
        .from(agentsTable)
        .where(inArray(agentsTable.id, debtAgentIds))
    : [];
  const walletMap = new Map(walletRows.map(w => [w.id, Math.max(0, Number(w.walletBalance) || 0)]));

  let totalDebt = nonAgentDebt;
  for (const [agentId, grossDebt] of debtByAgent) {
    const credit = walletMap.get(agentId) ?? 0;
    totalDebt += Math.max(0, grossDebt - credit);
  }

  const totalPassengers = Number((paxRow as any)[0]?.count ?? 0);

  res.json({
    revenueByDay,
    revenueByMonth,
    topDestinations,
    topAgents,
    highDates,
    almostSoldOut,
    statusBreakdown,
    totalRevenue:    Math.round(totalRevenue    * 100) / 100,
    totalPaid:       Math.round(totalPaidAll    * 100) / 100,
    totalDebt:       Math.round(totalDebt       * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    totalBookings:   totalBookingsAll,
    activeBookings:  filteredBookings.length,
    totalPassengers,
  });
});

export default router;
