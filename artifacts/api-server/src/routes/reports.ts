import { Router, type IRouter } from "express";
import { eq, sql, gte, lte, and, inArray } from "drizzle-orm";
import { db, bookingsTable, flightsTable, passengersTable, agentsTable, paymentsTable, bookingExtrasTable, agentCreditTransactionsTable } from "@workspace/db";
import { getSplitNetTotalsMap, calcCombinedNetAndCommission } from "../lib/getFullBooking.js";
import ExcelJS from "exceljs";
import fs from "fs";
import { EXCEL_PATH, scheduleExcelSync as initExcelSync, excelSyncNowIfDirty } from "../lib/excelSync.js";
import { scheduleGSheetsSync, syncGoogleSheetsNow } from "../lib/googleSheets.js";
import {
  GetSalesReportQueryParams,
  GetRoutePerformanceQueryParams,
  GetAgentSalesQueryParams,
  GetDetailedFlightsReportQueryParams,
  GetAirlinePerformanceQueryParams,
} from "@workspace/api-zod";
import { wholeEuroDue } from "../lib/money.js";
import { getEffectivePermissions } from "./permissions.js";

const router: IRouter = Router();

// Trigger initial sync when server starts (with 10s delay to let DB connect)
setTimeout(() => { initExcelSync(100); scheduleGSheetsSync(100); }, 10000);

// Manual Google Sheets sync trigger (admin only)
router.post("/reports/sync-gsheets", async (req, res): Promise<void> => {
  if (!req.session?.userId || req.session.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  // Sinkronizim i menjëhershëm kur e kërkon admini me buton — anashkalon throttle-in.
  void syncGoogleSheetsNow().catch(() => {});
  res.json({ ok: true, message: "Sync triggered" });
});

// ── Excel download/status endpoints are exported separately so they can be
//    mounted with requireFmsAuth (all FMS users) rather than requireManagerOrAdmin.
export const excelDownloadRouter: IRouter = Router();

excelDownloadRouter.get("/reports/export/excel/live", async (req, res): Promise<void> => {
  // Skedari rigjenerohet vetëm nëse ka ndryshime që nga hera e fundit (dirty),
  // që shkarkimi të jetë gjithmonë i freskët pa e rënduar serverin gjatë punës.
  try { await excelSyncNowIfDirty(); } catch { /* serve last good file */ }
  if (!fs.existsSync(EXCEL_PATH)) {
    res.status(404).json({ error: "Excel file not generated yet. Try again in a moment." });
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="FMS_Pro_Live_${date}.xlsx"`);
  fs.createReadStream(EXCEL_PATH).pipe(res);
});

excelDownloadRouter.get("/reports/export/excel/status", async (req, res): Promise<void> => {
  if (fs.existsSync(EXCEL_PATH)) {
    const stat = fs.statSync(EXCEL_PATH);
    res.json({ exists: true, updatedAt: stat.mtime.toISOString(), sizeKb: Math.round(stat.size / 1024) });
  } else {
    res.json({ exists: false });
  }
});

router.get("/reports/sales", async (req, res): Promise<void> => {
  const parsed = GetSalesReportQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { dateFrom, dateTo } = parsed.data;

  // Ditët llogariten me orën e Shqipërisë (Europe/Tirane), jo UTC — përndryshe
  // rezervimet e bëra 00:00–02:00 binin te dita e djeshme (kërkesë 03.08.2026).
  // Marrim një ditë tampon nga çdo anë dhe filtrojmë me datën lokale.
  const bookings = await db.select().from(bookingsTable)
    .where(and(
      gte(bookingsTable.createdAt, new Date(new Date(dateFrom + "T00:00:00Z").getTime() - 24 * 3600 * 1000)),
      lte(bookingsTable.createdAt, new Date(new Date(dateTo + "T23:59:59Z").getTime() + 24 * 3600 * 1000))
    ));

  const tiraneDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" });
  const tiraneDate = (d: Date): string => tiraneDateFmt.format(d);

  const activeBookings = bookings.filter(b => {
    if (b.status === "cancelled") return false;
    const ld = tiraneDate(b.createdAt);
    return ld >= dateFrom && ld <= dateTo;
  });
  const activeIds = activeBookings.map(b => b.id);
  const splitNetMap = await getSplitNetTotalsMap(activeIds);

  const totalSales = activeBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0);
  // Commission = shuma shitur - çmim neto (kur është vendosur); fallback = markup
  const totalCommission = activeBookings.reduce((sum, b) => {
    const { commission } = calcCombinedNetAndCommission(Number(b.totalAmount), b.netPrice != null ? Number(b.netPrice) : null, splitNetMap.get(b.id) ?? 0, Number(b.markup));
    return sum + commission;
  }, 0);
  const totalNetCost = activeBookings.reduce((sum, b) => {
    const { combinedNet } = calcCombinedNetAndCommission(Number(b.totalAmount), b.netPrice != null ? Number(b.netPrice) : null, splitNetMap.get(b.id) ?? 0, 0);
    return sum + (combinedNet ?? 0);
  }, 0);

  const allPassengers = await db.select().from(passengersTable);
  const bookingIds = new Set(activeBookings.map(b => b.id));
  const totalPassengers = allPassengers.filter(p => bookingIds.has(p.bookingId)).length;

  const byDayMap: Record<string, { sales: number; profit: number; bookings: number }> = {};
  for (const b of activeBookings) {
    const date = tiraneDate(b.createdAt);
    if (!byDayMap[date]) byDayMap[date] = { sales: 0, profit: 0, bookings: 0 };
    byDayMap[date].sales += Number(b.totalAmount);
    const { commission } = calcCombinedNetAndCommission(Number(b.totalAmount), b.netPrice != null ? Number(b.netPrice) : null, splitNetMap.get(b.id) ?? 0, Number(b.markup));
    byDayMap[date].profit += commission;
    byDayMap[date].bookings += 1;
  }

  const byDay = Object.entries(byDayMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({
    totalSales,
    totalProfit: totalCommission,
    totalCommission,
    totalNetCost,
    totalBookings: activeBookings.length,
    totalPassengers,
    byDay,
  });
});

router.get("/reports/route-performance", async (req, res): Promise<void> => {
  const parsed = GetRoutePerformanceQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const flights = await db.select().from(flightsTable);
  const allBookings = await db.select().from(bookingsTable);

  const routeMap: Record<string, {
    fromCity: string;
    toCity: string;
    totalFlights: number;
    totalBookings: number;
    totalRevenue: number;
    totalSeats: number;
    soldSeats: number;
  }> = {};

  for (const f of flights) {
    const key = `${f.fromCity}-${f.toCity}`;
    if (!routeMap[key]) {
      routeMap[key] = {
        fromCity: f.fromCity,
        toCity: f.toCity,
        totalFlights: 0,
        totalBookings: 0,
        totalRevenue: 0,
        totalSeats: 0,
        soldSeats: 0,
      };
    }
    routeMap[key].totalFlights += 1;
    routeMap[key].totalSeats += f.totalSeats;
    routeMap[key].soldSeats += f.soldSeats;
  }

  for (const b of allBookings.filter(b => b.status !== "cancelled")) {
    const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, b.flightId));
    if (flight) {
      const key = `${flight.fromCity}-${flight.toCity}`;
      if (routeMap[key]) {
        routeMap[key].totalBookings += 1;
        routeMap[key].totalRevenue += Number(b.totalAmount);
      }
    }
  }

  const result = Object.entries(routeMap).map(([route, data]) => ({
    route,
    ...data,
    occupancyRate: data.totalSeats > 0 ? (data.soldSeats / data.totalSeats) * 100 : 0,
  }));

  res.json(result);
});

router.get("/reports/agent-sales", async (req, res): Promise<void> => {
  const parsed = GetAgentSalesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { dateFrom, dateTo } = parsed.data;
  const agents = await db.select().from(agentsTable);
  const allBookings = await db.select().from(bookingsTable);
  const allPassengers = await db.select().from(passengersTable);
  const tiraneDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" });
  const tiraneDate = (d: Date): string => tiraneDateFmt.format(d);
  const isInsideSelectedRange = (booking: typeof allBookings[number]) => {
    if (booking.status === "cancelled") return false;
    const date = tiraneDate(booking.createdAt);
    return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
  };
  const activeBookings = allBookings.filter(isInsideSelectedRange);
  const allActiveIds = activeBookings.map(b => b.id);
  const splitNetMap = await getSplitNetTotalsMap(allActiveIds);
  const passengersByBooking = new Map<number, number>();
  for (const passenger of allPassengers) {
    passengersByBooking.set(passenger.bookingId, (passengersByBooking.get(passenger.bookingId) ?? 0) + 1);
  }

  const agentBookingsList = agents.map(agent => {
    const agentBookings = activeBookings.filter(b => b.agentId === agent.id);
    const totalSales = agentBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    // Cap paidAmount per booking at its totalAmount so overpayments don't inflate totals
    const totalPaid = agentBookings.reduce((sum, b) =>
      sum + Math.min(Number(b.paidAmount), Number(b.totalAmount)), 0);
    const totalCredit = agentBookings.reduce((sum, b) =>
      sum + Math.max(0, Number(b.paidAmount) - Number(b.totalAmount)), 0);
    // Commission = totalAmount - (netPrice + splitNetTotal) when any net is set; else use markup field
    const totalCommission = agentBookings.reduce((sum, b) => {
      const { commission } = calcCombinedNetAndCommission(Number(b.totalAmount), b.netPrice != null ? Number(b.netPrice) : null, splitNetMap.get(b.id) ?? 0, Number(b.markup));
      return sum + commission;
    }, 0);
    return {
      agentId: agent.id,
      agentName: agent.name,
      company: agent.company,
      totalBookings: agentBookings.length,
      totalPassengers: agentBookings.reduce((sum, b) => sum + (passengersByBooking.get(b.id) ?? 0), 0),
      totalSales,
      totalPaid,
      totalCredit,
      totalDebt: wholeEuroDue(totalSales, totalPaid),
      totalCommission,
    };
  });

  // Aggregat ditor vetëm nga rezervimet e agjentëve (ato me agentId jo null).
  const agentOnlyBookings = activeBookings.filter(b => b.agentId != null);
  const byDayMap: Record<string, { sales: number; profit: number; bookings: number }> = {};
  for (const b of agentOnlyBookings) {
    const date = tiraneDate(b.createdAt);
    if (!byDayMap[date]) byDayMap[date] = { sales: 0, profit: 0, bookings: 0 };
    byDayMap[date].sales += Number(b.totalAmount);
    const { commission } = calcCombinedNetAndCommission(Number(b.totalAmount), b.netPrice != null ? Number(b.netPrice) : null, splitNetMap.get(b.id) ?? 0, Number(b.markup));
    byDayMap[date].profit += commission;
    byDayMap[date].bookings += 1;
  }
  const byDay = Object.entries(byDayMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ agents: agentBookingsList, byDay });
});

router.get("/reports/detailed-flights", async (req, res): Promise<void> => {
  const parsed = GetDetailedFlightsReportQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { dateFrom, dateTo } = parsed.data;
  const isRealIsoDate = (value: string): boolean => {
    const parsedDate = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
  };
  if (!isRealIsoDate(dateFrom) || !isRealIsoDate(dateTo) || dateFrom > dateTo) {
    res.status(400).json({ error: "Intervali i datave është i pavlefshëm." });
    return;
  }

  const role = req.session?.role;
  const userId = req.session?.userId;
  const permissions = role === "admin"
    ? { can_view_route_report: true, can_view_profit_in_reports: true, can_view_commission_in_reports: true }
    : await getEffectivePermissions(role ?? "", userId);
  if (!permissions.can_view_route_report) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const canViewProfit = permissions.can_view_profit_in_reports === true;
  const canViewAgentCommission = permissions.can_view_commission_in_reports === true;

  const flights = await db.select().from(flightsTable)
    .where(and(gte(flightsTable.departureDate, dateFrom), lte(flightsTable.departureDate, dateTo)));
  if (!flights.length) {
    res.json({ groups: [] });
    return;
  }

  const flightIds = flights.map(f => f.id);
  const bookings = await db.select().from(bookingsTable).where(inArray(bookingsTable.flightId, flightIds));
  const bookingIds = bookings.map(b => b.id);
  const [passengers, agents] = await Promise.all([
    bookingIds.length ? db.select().from(passengersTable).where(inArray(passengersTable.bookingId, bookingIds)) : Promise.resolve([]),
    db.select().from(agentsTable),
  ]);

  const activeBookings = bookings.filter(b => b.status !== "cancelled");
  const splitNetMap = await getSplitNetTotalsMap(activeBookings.map(b => b.id));
  const bookingsByFlight = new Map<number, typeof bookings>();
  const passengersByBooking = new Map<number, typeof passengers>();
  const agentById = new Map(agents.map(agent => [agent.id, agent]));

  for (const booking of bookings) {
    const list = bookingsByFlight.get(booking.flightId) ?? [];
    list.push(booking);
    bookingsByFlight.set(booking.flightId, list);
  }
  for (const passenger of passengers) {
    const list = passengersByBooking.get(passenger.bookingId) ?? [];
    list.push(passenger);
    passengersByBooking.set(passenger.bookingId, list);
  }

  type StatusKey = "draft" | "pending" | "confirmed" | "ticketed" | "cancelled";
  type DateRow = {
    flightId: number; departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string;
    flightStatus: string; totalSeats: number; totalBookings: number; totalPassengers: number; occupiedSeats: number;
    occupancyRate: number; totalRevenue: number; totalPaid: number; totalDue: number;
  };
  type AgentRow = {
    agentId: number | null; agentName: string; company: string | null; totalBookings: number; totalPassengers: number;
    totalSales: number; totalPaid: number; totalDue: number; totalCommission: number; salesShare: number;
  };
  type Group = {
    key: string; route: string; fromCity: string; toCity: string; airline: string; flightNumber: string;
    totalFlightDates: number; totalBookings: number; totalPassengers: number; totalSeats: number; occupiedSeats: number;
    occupancyRate: number; totalRevenue: number; totalPaid: number; totalDue: number; totalNet: number;
    netComplete: boolean; totalCommission: number; statuses: Record<StatusKey, number>;
    dates: DateRow[]; agents: AgentRow[]; agentMap: Map<string, AgentRow>;
  };

  const groups = new Map<string, Group>();
  for (const flight of flights) {
    const fromCity = String(flight.fromCity ?? "").trim().toUpperCase();
    const toCity = String(flight.toCity ?? "").trim().toUpperCase();
    const route = `${fromCity}-${toCity}`;
    const flightNumber = String(flight.flightNumber ?? "").replace(/\s+/g, "").toUpperCase();
    const key = `${route}::${flightNumber}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key, route, fromCity, toCity, airline: flight.airline, flightNumber,
        totalFlightDates: 0, totalBookings: 0, totalPassengers: 0, totalSeats: 0, occupiedSeats: 0,
        occupancyRate: 0, totalRevenue: 0, totalPaid: 0, totalDue: 0, totalNet: 0,
        netComplete: true, totalCommission: 0,
        statuses: { draft: 0, pending: 0, confirmed: 0, ticketed: 0, cancelled: 0 },
        dates: [], agents: [], agentMap: new Map(),
      };
      groups.set(key, group);
    }

    const flightBookings = bookingsByFlight.get(flight.id) ?? [];
    for (const booking of flightBookings) {
      const status = booking.status as StatusKey;
      if (status in group.statuses) group.statuses[status] += 1;
    }
    const active = flightBookings.filter(booking => booking.status !== "cancelled");
    let datePassengers = 0;
    let dateOccupiedSeats = 0;
    let dateRevenue = 0;
    let datePaid = 0;

    for (const booking of active) {
      const bookingPassengers = (passengersByBooking.get(booking.id) ?? []).filter(passenger => !passenger.cancelled);
      const passengerCount = bookingPassengers.length;
      const occupiedSeats = bookingPassengers.filter(passenger => passenger.type !== "infant").length;
      const total = Number(booking.totalAmount);
      const paid = Math.min(Number(booking.paidAmount), total);
      const due = wholeEuroDue(total, paid);
      const { combinedNet, commission } = calcCombinedNetAndCommission(
        total,
        booking.netPrice != null ? Number(booking.netPrice) : null,
        splitNetMap.get(booking.id) ?? 0,
        Number(booking.markup),
      );

      datePassengers += passengerCount;
      dateOccupiedSeats += occupiedSeats;
      dateRevenue += total;
      datePaid += paid;
      group.totalBookings += 1;
      group.totalPassengers += passengerCount;
      group.occupiedSeats += occupiedSeats;
      group.totalRevenue += total;
      group.totalPaid += paid;
      group.totalDue += due;
      group.totalCommission += commission;
      if (combinedNet == null) group.netComplete = false;
      else group.totalNet += combinedNet;

      const agent = booking.agentId == null ? null : agentById.get(booking.agentId);
      const agentKey = booking.agentId == null ? "direct" : String(booking.agentId);
      let agentRow = group.agentMap.get(agentKey);
      if (!agentRow) {
        agentRow = {
          agentId: booking.agentId,
          agentName: agent?.name ?? "Direkt / Pa agjent",
          company: agent?.company ?? null,
          totalBookings: 0,
          totalPassengers: 0,
          totalSales: 0,
          totalPaid: 0,
          totalDue: 0,
          totalCommission: 0,
          salesShare: 0,
        };
        group.agentMap.set(agentKey, agentRow);
      }
      agentRow.totalBookings += 1;
      agentRow.totalPassengers += passengerCount;
      agentRow.totalSales += total;
      agentRow.totalPaid += paid;
      agentRow.totalDue += due;
      agentRow.totalCommission += commission;
    }

    group.totalFlightDates += 1;
    group.totalSeats += flight.totalSeats;
    group.dates.push({
      flightId: flight.id,
      departureDate: flight.departureDate,
      departureTime: flight.departureTime,
      arrivalDate: flight.arrivalDate,
      arrivalTime: flight.arrivalTime,
      flightStatus: flight.status,
      totalSeats: flight.totalSeats,
      totalBookings: active.length,
      totalPassengers: datePassengers,
      occupiedSeats: dateOccupiedSeats,
      occupancyRate: flight.totalSeats > 0 ? (dateOccupiedSeats / flight.totalSeats) * 100 : 0,
      totalRevenue: dateRevenue,
      totalPaid: datePaid,
      totalDue: wholeEuroDue(dateRevenue, datePaid),
    });
  }

  const result = [...groups.values()].map(group => {
    group.occupancyRate = group.totalSeats > 0 ? (group.occupiedSeats / group.totalSeats) * 100 : 0;
    group.dates.sort((a, b) => a.departureDate.localeCompare(b.departureDate) || a.departureTime.localeCompare(b.departureTime));
    group.agents = [...group.agentMap.values()]
      .map(agent => ({
        ...agent,
        totalCommission: canViewAgentCommission ? agent.totalCommission : 0,
        salesShare: group.totalRevenue > 0 ? (agent.totalSales / group.totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
    const { agentMap: _agentMap, ...publicGroup } = group;
    return {
      ...publicGroup,
      totalNet: canViewProfit ? publicGroup.totalNet : 0,
      netComplete: canViewProfit ? publicGroup.netComplete : false,
      totalCommission: canViewProfit ? publicGroup.totalCommission : 0,
    };
  }).sort((a, b) => a.route.localeCompare(b.route) || a.flightNumber.localeCompare(b.flightNumber));

  res.json({ groups: result });
});

router.get("/reports/airline-performance", async (req, res): Promise<void> => {
  const parsed = GetAirlinePerformanceQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const flights = await db.select().from(flightsTable);
  const allBookings = await db.select().from(bookingsTable);

  const airlineMap: Record<string, {
    totalFlights: number;
    totalBookings: number;
    totalRevenue: number;
    totalSeats: number;
    soldSeats: number;
  }> = {};

  for (const f of flights) {
    if (!airlineMap[f.airline]) {
      airlineMap[f.airline] = { totalFlights: 0, totalBookings: 0, totalRevenue: 0, totalSeats: 0, soldSeats: 0 };
    }
    airlineMap[f.airline].totalFlights += 1;
    airlineMap[f.airline].totalSeats += f.totalSeats;
    airlineMap[f.airline].soldSeats += f.soldSeats;
  }

  for (const b of allBookings.filter(b => b.status !== "cancelled")) {
    const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, b.flightId));
    if (flight && airlineMap[flight.airline]) {
      airlineMap[flight.airline].totalBookings += 1;
      airlineMap[flight.airline].totalRevenue += Number(b.totalAmount);
    }
  }

  const result = Object.entries(airlineMap).map(([airline, data]) => ({
    airline,
    ...data,
    occupancyRate: data.totalSeats > 0 ? (data.soldSeats / data.totalSeats) * 100 : 0,
  }));

  res.json(result);
});

// ── Full Excel Export (all sheets) ────────────────────────────────────────
router.get("/reports/export/excel", async (req, res): Promise<void> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FMS Pro";
  wb.created = new Date();

  // Fetch all data
  const [bookings, flights, passengers, payments, agents, extras, creditTx] = await Promise.all([
    db.select().from(bookingsTable).orderBy(bookingsTable.createdAt),
    db.select().from(flightsTable).orderBy(flightsTable.departureDate),
    db.select().from(passengersTable),
    db.select().from(paymentsTable).orderBy(paymentsTable.createdAt),
    db.select().from(agentsTable),
    db.select().from(bookingExtrasTable),
    db.select().from(agentCreditTransactionsTable).orderBy(agentCreditTransactionsTable.createdAt),
  ]);

  const fMap = new Map(flights.map(f => [f.id, f]));
  const aMap = new Map(agents.map(a => [a.id, a]));
  const bMap = new Map(bookings.map(b => [b.id, b]));
  const excelActiveIds = bookings.filter(b => b.status !== "cancelled").map(b => b.id);
  const excelSplitNetMap = await getSplitNetTotalsMap(excelActiveIds);

  function hdr(ws: ExcelJS.Worksheet, cols: string[]) {
    const row = ws.addRow(cols);
    row.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF93C5FD" } } };
    });
    ws.getRow(1).height = 22;
  }

  function autoWidth(ws: ExcelJS.Worksheet) {
    ws.columns.forEach(col => {
      let max = 10;
      col.eachCell?.({ includeEmpty: false }, cell => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 3, 40);
    });
  }

  function stripeRows(ws: ExcelJS.Worksheet) {
    ws.eachRow((row, i) => {
      if (i === 1) return;
      if (i % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        });
      }
    });
  }

  const statusAlb: Record<string, string> = {
    draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar", ticketed: "Biletë Lëshuar", cancelled: "Anuluar",
  };
  const methodAlb: Record<string, string> = {
    cash: "Para në Dorë", bank_transfer: "Transfertë Bankare", card: "Kartë", online: "Online", credit: "Kredit Agjenzie",
  };
  const typeAlb: Record<string, string> = { adult: "I rritur", child: "Fëmijë", infant: "Foshnjë" };
  const fmt = (n: any) => String(Math.round(Number(n ?? 0)));
  const fmtDate = (d: any) => d ? String(d).slice(0, 10) : "";

  // ─ Sheet 1: Rezervimet ─────────────────────────────────────────────────────
  const wsBook = wb.addWorksheet("Rezervimet", { properties: { tabColor: { argb: "FF1E3A5F" } } });
  hdr(wsBook, ["ID", "Data", "Referenca", "PNR", "Statusi", "Klienti", "Email", "Telefon",
    "Fluturimi", "Nga", "Deri", "Data Fluturimit", "Agjenti", "Kompania",
    "Total (€)", "Paguar (€)", "Detyrim (€)", "Çmim Neto (€)", "Komisioni (€)", "Shënime"]);
  for (const b of bookings) {
    const f = fMap.get(b.flightId);
    const a = b.agentId ? aMap.get(b.agentId) : null;
    const total = Number(b.totalAmount);
    const paid = Math.min(Number(b.paidAmount), total);
    const due = wholeEuroDue(total, paid);
    const { combinedNet, commission: comm } = calcCombinedNetAndCommission(total, b.netPrice != null ? Number(b.netPrice) : null, excelSplitNetMap.get(b.id) ?? 0, Number(b.markup ?? 0));
    const net = combinedNet;
    const row = wsBook.addRow([
      b.id, fmtDate(b.createdAt), b.bookingRef, b.pnr ?? "",
      statusAlb[b.status] ?? b.status,
      b.customerName, b.customerEmail ?? "", b.customerPhone ?? "",
      f ? `${f.airline ?? ""} ${f.flightNumber ?? ""}`.trim() : "",
      f?.fromCity ?? "", f?.toCity ?? "",
      fmtDate(f?.departureDate),
      a?.name ?? "", a?.company ?? "",
      total, paid, due,
      net ?? "", comm,
      b.notes ?? "",
    ]);
    // Colour status cell
    const statusCell = row.getCell(5);
    const statusColors: Record<string, string> = {
      "Konfirmuar": "FFDBECFF", "Biletë Lëshuar": "FFD1FAE5", "Anuluar": "FFFEE2E2", "Pritje": "FFFED7AA",
    };
    const sc = statusColors[String(statusCell.value)];
    if (sc) statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sc } };
    // Colour due cell red if > 0
    if (due > 0) {
      row.getCell(17).font = { bold: true, color: { argb: "FFDC2626" } };
    }
  }
  wsBook.autoFilter = { from: "A1", to: "T1" };
  autoWidth(wsBook);

  // ─ Sheet 2: Pasagjerët ─────────────────────────────────────────────────────
  const wsPax = wb.addWorksheet("Pasagjerët", { properties: { tabColor: { argb: "FF3B0764" } } });
  hdr(wsPax, ["ID", "Referenca Rezervimit", "Statusi Rezervimit", "Emri", "Mbiemri", "Tipi",
    "Datëlindja", "Shtetësia", "Nr. Pasaportës", "Skadon Pasaporta",
    "Ulëse", "Bagazhi", "Prioritet", "Sigurim", "Çmimi Biletës (€)"]);
  for (const p of passengers) {
    const b = bMap.get(p.bookingId);
    wsPax.addRow([
      p.id, b?.bookingRef ?? p.bookingId, statusAlb[b?.status ?? ""] ?? "",
      p.firstName, p.lastName, typeAlb[p.type] ?? p.type,
      fmtDate(p.dateOfBirth), p.nationality ?? "",
      p.passportNumber ?? "", fmtDate(p.passportExpiry),
      p.seatNumber ?? "",
      p.baggageOption === "checked" ? "Bagazh" : p.baggageOption === "cabin" ? "Kabine" : "Pa bagazh",
      p.hasPriorityBoarding ? "Po" : "Jo",
      p.hasInsurance ? "Po" : "Jo",
      p.ticketPrice != null ? Number(p.ticketPrice) : "",
    ]);
  }
  wsPax.autoFilter = { from: "A1", to: "O1" };
  autoWidth(wsPax);

  // ─ Sheet 3: Pagesat ────────────────────────────────────────────────────────
  const wsPay = wb.addWorksheet("Pagesat", { properties: { tabColor: { argb: "FF065F46" } } });
  hdr(wsPay, ["ID", "Data", "Referenca Rezervimit", "Klienti", "Agjenti",
    "Shuma (€)", "Metoda", "Statusi", "Rimbursim?", "Referenca", "Shënime"]);
  for (const p of payments) {
    const b = bMap.get(p.bookingId);
    const a = b?.agentId ? aMap.get(b.agentId) : null;
    const row = wsPay.addRow([
      p.id, fmtDate(p.createdAt), b?.bookingRef ?? "", b?.customerName ?? "",
      a?.name ?? "", Number(p.amount),
      methodAlb[p.method] ?? p.method,
      p.status, p.isRefund ? "Po" : "Jo",
      p.reference ?? "", p.notes ?? "",
    ]);
    if (p.isRefund) {
      row.getCell(6).font = { bold: true, color: { argb: "FFDC2626" } };
      row.getCell(8).font = { color: { argb: "FFDC2626" } };
    } else {
      row.getCell(6).font = { bold: true, color: { argb: "FF16A34A" } };
    }
  }
  wsPay.autoFilter = { from: "A1", to: "K1" };
  autoWidth(wsPay);

  // ─ Sheet 4: Agjentët ───────────────────────────────────────────────────────
  const wsAg = wb.addWorksheet("Agjentët", { properties: { tabColor: { argb: "FF92400E" } } });
  hdr(wsAg, ["ID", "Emri", "Kompania", "Email", "Telefon", "Statusi",
    "Nr. Rezervimeve", "Shitjet Totale (€)", "Paguar (€)", "Detyrim (€)", "Balanca Kredit (€)"]);
  for (const a of agents) {
    const ab = bookings.filter(b => b.agentId === a.id && b.status !== "cancelled");
    const sales = ab.reduce((s, b) => s + Number(b.totalAmount), 0);
    const paid = ab.reduce((s, b) => s + Math.min(Number(b.paidAmount), Number(b.totalAmount)), 0);
    const due = wholeEuroDue(sales, paid);
    wsAg.addRow([
      a.id, a.name, a.company ?? "", a.email, a.phone ?? "", a.status,
      ab.length, sales, paid, due, Number(a.walletBalance ?? 0),
    ]);
  }
  wsAg.autoFilter = { from: "A1", to: "K1" };
  autoWidth(wsAg);

  // ─ Sheet 5: Fluturimet ─────────────────────────────────────────────────────
  const wsFl = wb.addWorksheet("Fluturimet", { properties: { tabColor: { argb: "FF0F4C81" } } });
  hdr(wsFl, ["ID", "Nr. Fluturimit", "Kompania", "Nga", "Deri",
    "Data Nisjes", "Ora Nisjes", "Data Mbërritjes", "Ora Mbërritjes",
    "Klasa", "Çmim I rritur (€)", "Çmim Fëmijë (€)",
    "Ulëse Totale", "Ulëse Shitura", "Ulëse Lira", "Statusi"]);
  for (const f of flights) {
    const sold = bookings.filter(b => b.flightId === f.id && b.status !== "cancelled").length;
    const seats = Number(f.totalSeats ?? 0);
    const free = Math.max(0, seats - sold);
    wsFl.addRow([
      f.id, f.flightNumber ?? "", f.airline ?? "",
      f.fromCity, f.toCity, fmtDate(f.departureDate),
      f.departureTime ?? "", fmtDate(f.arrivalDate), f.arrivalTime ?? "",
      (f as any).cabinClass ?? "", Number(f.adultPrice ?? 0), Number(f.childPrice ?? 0),
      seats, sold, free, f.status ?? "active",
    ]);
  }
  wsFl.autoFilter = { from: "A1", to: "P1" };
  autoWidth(wsFl);

  // ─ Sheet 6: Kredite Agjentësh ──────────────────────────────────────────────
  const wsCr = wb.addWorksheet("Kredite Agjentësh", { properties: { tabColor: { argb: "FF64748B" } } });
  hdr(wsCr, ["ID", "Data", "Agjenti", "Referenca Rezervimit", "Tipi", "Shuma (€)", "Referenca", "Shënime"]);
  for (const tx of creditTx) {
    const a = aMap.get(tx.agentId);
    const b = tx.bookingId ? bMap.get(tx.bookingId) : null;
    const row = wsCr.addRow([
      tx.id, fmtDate(tx.createdAt),
      a?.name ?? tx.agentId, b?.bookingRef ?? tx.bookingRef ?? "",
      tx.type, Number(tx.amount),
      tx.reference ?? "", tx.notes ?? "",
    ]);
    if (tx.type === "credit" || tx.type === "deposit") {
      row.getCell(6).font = { bold: true, color: { argb: "FF16A34A" } };
    } else {
      row.getCell(6).font = { bold: true, color: { argb: "FFDC2626" } };
    }
  }
  wsCr.autoFilter = { from: "A1", to: "H1" };
  autoWidth(wsCr);

  // ─ Sheet 7: Shtojcat Pasagjerëve ───────────────────────────────────────────
  const wsEx = wb.addWorksheet("Shtojcat", { properties: { tabColor: { argb: "FF78350F" } } });
  hdr(wsEx, ["ID", "Referenca Rezervimit", "Klienti", "Përshkrim", "Shuma (€)"]);
  for (const ex of extras) {
    const b = bMap.get(ex.bookingId);
    wsEx.addRow([
      ex.id, b?.bookingRef ?? ex.bookingId, b?.customerName ?? "",
      ex.description, Number(ex.amount),
    ]);
  }
  autoWidth(wsEx);

  // ─ Sheet 8: Raport Financiar ───────────────────────────────────────────────
  const wsSum = wb.addWorksheet("Raport Financiar", { properties: { tabColor: { argb: "FF16A34A" } } });
  wsSum.mergeCells("A1:D1");
  const titleCell = wsSum.getCell("A1");
  titleCell.value = "RAPORT FINANCIAR — FMS PRO";
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  titleCell.alignment = { horizontal: "center" };
  wsSum.getRow(1).height = 28;

  const activeBookings = bookings.filter(b => b.status !== "cancelled");
  const totalSales = activeBookings.reduce((s, b) => s + Number(b.totalAmount), 0);
  const totalPaid = activeBookings.reduce((s, b) => s + Math.min(Number(b.paidAmount), Number(b.totalAmount)), 0);
    const totalDue = wholeEuroDue(totalSales, totalPaid);
  const totalComm = activeBookings.reduce((s, b) => {
    const { commission } = calcCombinedNetAndCommission(Number(b.totalAmount), b.netPrice != null ? Number(b.netPrice) : null, excelSplitNetMap.get(b.id) ?? 0, Number(b.markup ?? 0));
    return s + commission;
  }, 0);
  const totalPaymentsIn = payments.filter(p => p.status === "completed" && !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunds = payments.filter(p => p.status === "completed" && p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
  const totalExtras = extras.reduce((s, e) => s + Number(e.amount), 0);

  function sumRow(ws: ExcelJS.Worksheet, label: string, value: string | number, bold = false, color?: string) {
    const row = ws.addRow(["", label, "", value]);
    row.getCell(2).font = { bold, color: color ? { argb: color } : undefined };
    row.getCell(4).font = { bold, color: color ? { argb: color } : undefined };
    row.getCell(4).numFmt = '€#,##0.00';
    row.getCell(4).alignment = { horizontal: "right" };
    if (bold) row.height = 18;
  }
  function sumLabel(ws: ExcelJS.Worksheet, label: string) {
    const row = ws.addRow(["", label]);
    row.getCell(2).font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
    ws.mergeCells(`B${row.number}:D${row.number}`);
    row.height = 20;
  }

  wsSum.addRow([]);
  sumLabel(wsSum, "📊 SHITJET");
  sumRow(wsSum, "Rezervime Aktive", activeBookings.length);
  sumRow(wsSum, "Rezervime Anuluar", bookings.filter(b => b.status === "cancelled").length);
  sumRow(wsSum, "Pasagjerë Totalë", passengers.filter(p => {
    const b = bMap.get(p.bookingId);
    return b && b.status !== "cancelled";
  }).length);
  sumRow(wsSum, "Shitjet Totale (€)", totalSales, true, "FF1E3A5F");
  sumRow(wsSum, "Komisioni Total (€)", totalComm, true, "FF16A34A");
  wsSum.addRow([]);
  sumLabel(wsSum, "💰 PAGESAT");
  sumRow(wsSum, "Të Ardhura Totale (€)", totalPaymentsIn, true, "FF16A34A");
  sumRow(wsSum, "Rimbursime (€)", totalRefunds, false, "FFDC2626");
  sumRow(wsSum, "Neto të Ardhura (€)", totalPaymentsIn - totalRefunds, true, "FF16A34A");
  sumRow(wsSum, "Detyrime të Papaguara (€)", totalDue, true, totalDue > 0 ? "FFDC2626" : "FF16A34A");
  wsSum.addRow([]);
  sumLabel(wsSum, "✈ FLUTURIMET");
  sumRow(wsSum, "Fluturime Totale", flights.length);
  sumRow(wsSum, "Fluturime Aktive", flights.filter(f => f.status !== "cancelled").length);
  wsSum.addRow([]);
  sumLabel(wsSum, "👥 AGJENTËT");
  sumRow(wsSum, "Agjentë Aktive", agents.filter(a => a.status === "active").length);
  sumRow(wsSum, "Shtojca Totale (€)", totalExtras);
  wsSum.addRow([]);
  const dateCell = wsSum.addRow(["", `Gjeneruar: ${new Date().toLocaleString("sq-AL")}`, "", ""]);
  dateCell.getCell(2).font = { italic: true, color: { argb: "FF94A3B8" }, size: 10 };

  wsSum.getColumn(1).width = 3;
  wsSum.getColumn(2).width = 35;
  wsSum.getColumn(3).width = 5;
  wsSum.getColumn(4).width = 20;

  // Apply zebra striping and freeze header for data sheets
  for (const ws of [wsBook, wsPax, wsPay, wsAg, wsFl, wsCr, wsEx]) {
    stripeRows(ws);
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="FMS_Pro_Export_${date}.xlsx"`);
  await wb.xlsx.write(res);
});

// Excel/CSV Export endpoint
router.get("/reports/export", async (req, res): Promise<void> => {
  const { type = "sales" } = req.query as { type?: string };

  function csvRow(vals: (string | number | null | undefined)[]) {
    return vals.map(v => {
      const s = String(v ?? "").replace(/"/g, '""');
      return `"${s}"`;
    }).join(",");
  }

  const BOM = "\uFEFF"; // UTF-8 BOM for Excel

  if (type === "payments") {
    const payments = await db.select().from(paymentsTable).orderBy(paymentsTable.createdAt);
    const bookings = await db.select().from(bookingsTable);
    const agents = await db.select().from(agentsTable);
    const bMap = new Map(bookings.map(b => [b.id, b]));
    const aMap = new Map(agents.map(a => [a.id, a]));

    const header = csvRow(["ID", "Data", "Referenca Rezervimit", "Klienti", "Agjenti", "Shuma (€)", "Metoda", "Statusi", "Rimbursim", "Referenca", "Shënime"]);
    const rows = payments.map(p => {
      const b = bMap.get(p.bookingId);
      const a = b?.agentId ? aMap.get(b.agentId) : null;
      return csvRow([
        p.id,
        p.createdAt.toISOString().slice(0, 10),
        b?.bookingRef ?? p.bookingId,
        b?.customerName ?? "",
        a?.name ?? "",
        String(Math.round(Number(p.amount))),
        p.method,
        p.status,
        p.isRefund ? "PO" : "JO",
        p.reference ?? "",
        p.notes ?? "",
      ]);
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="pagesat_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(BOM + header + "\n" + rows.join("\n"));
    return;
  }

  if (type === "agents") {
    const agents = await db.select().from(agentsTable);
    const allBookings = await db.select().from(bookingsTable);

    const header = csvRow(["ID", "Emri", "Kompania", "Email", "Telefon", "Statusi", "Rezervime", "Shitjet Totale (€)", "Paguar (€)", "Detyrim (€)", "Balanca Kredit (€)"]);
    const rows = agents.map(a => {
      const ab = allBookings.filter(b => b.agentId === a.id && b.status !== "cancelled");
      const sales = ab.reduce((s, b) => s + Number(b.totalAmount), 0);
      const paid = ab.reduce((s, b) => s + Math.min(Number(b.paidAmount), Number(b.totalAmount)), 0);
      return csvRow([
        a.id, a.name, a.company ?? "", a.email, a.phone ?? "",
        a.status, ab.length,
        String(Math.round(sales)), String(Math.round(paid)), String(wholeEuroDue(sales, paid)),
        String(Math.round(Number(a.walletBalance))),
      ]);
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="agjentet_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(BOM + header + "\n" + rows.join("\n"));
    return;
  }

  // Default: sales/bookings
  const bookings = await db.select().from(bookingsTable).orderBy(bookingsTable.createdAt);
  const flights = await db.select().from(flightsTable);
  const agents = await db.select().from(agentsTable);
  const fMap = new Map(flights.map(f => [f.id, f]));
  const aMap = new Map(agents.map(a => [a.id, a]));
  const csvActiveIds = bookings.filter(b => b.status !== "cancelled").map(b => b.id);
  const csvSplitNetMap = await getSplitNetTotalsMap(csvActiveIds);

  const header = csvRow(["ID", "Data", "Referenca", "PNR", "Klienti", "Email", "Telefon", "Fluturimi", "Nga", "Deri", "Data Fluturimit", "Agjenti", "Statusi", "Total (€)", "Paguar (€)", "Detyrim (€)", "Çmim Neto (€)", "Komisioni (€)", "Shënime"]);
  const rows = bookings.map(b => {
    const f = fMap.get(b.flightId);
    const a = b.agentId ? aMap.get(b.agentId) : null;
    const total = Number(b.totalAmount);
    const rawPaid = Number(b.paidAmount);
    const paid = Math.min(rawPaid, total);
    const { combinedNet, commission: comm } = calcCombinedNetAndCommission(total, b.netPrice != null ? Number(b.netPrice) : null, csvSplitNetMap.get(b.id) ?? 0, Number(b.markup));
    const net = combinedNet;
    return csvRow([
      b.id,
      b.createdAt.toISOString().slice(0, 10),
      b.bookingRef, b.pnr ?? "",
      b.customerName, b.customerEmail ?? "", b.customerPhone ?? "",
      f ? `${f.airline} ${f.flightNumber}` : "",
      f?.fromCity ?? "", f?.toCity ?? "",
      f?.departureDate ?? "",
      a?.name ?? "",
      b.status,
      String(Math.round(total)), String(Math.round(paid)), String(wholeEuroDue(total, paid)),
      net != null ? String(Math.round(net)) : "",
      String(Math.round(comm)),
      b.notes ?? "",
    ]);
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="shitjet_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(BOM + header + "\n" + rows.join("\n"));
});

export default router;
