/**
 * excelWorker.ts — runs as a worker_threads worker.
 *
 * Spawned by excelSync.ts; performs the full ExcelJS workbook build off the
 * main thread so the event loop is never blocked, then posts the result back
 * to the parent.
 */
import { parentPort } from "worker_threads";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { wholeEuroDue } from "./money.js";
import {
  db,
  pool,
  bookingsTable,
  flightsTable,
  passengersTable,
  paymentsTable,
  agentsTable,
  bookingExtrasTable,
  agentCreditTransactionsTable,
} from "@workspace/db";

const DATA_DIR = path.join(process.cwd(), "data");
export const EXCEL_PATH = path.join(DATA_DIR, "fms_live.xlsx");

async function generateLiveExcel() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = "FMS Pro";
  wb.created = new Date();
  wb.modified = new Date();

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
    const net = b.netPrice != null ? Number(b.netPrice) : null;
    const comm = net != null ? Math.max(0, total - net) : Number(b.markup ?? 0);
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
    const statusColors: Record<string, string> = {
      "Konfirmuar": "FFDBECFF", "Biletë Lëshuar": "FFD1FAE5", "Anuluar": "FFFEE2E2", "Pritje": "FFFED7AA",
    };
    const sc = statusColors[String(row.getCell(5).value)];
    if (sc) row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: sc } };
    if (due > 0) row.getCell(17).font = { bold: true, color: { argb: "FFDC2626" } };
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
      methodAlb[p.method] ?? p.method, p.status,
      p.isRefund ? "Po" : "Jo",
      p.reference ?? "", p.notes ?? "",
    ]);
    if (p.isRefund) {
      row.getCell(6).font = { bold: true, color: { argb: "FFDC2626" } };
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
    wsAg.addRow([
      a.id, a.name, a.company ?? "", a.email, a.phone ?? "", a.status,
      ab.length, sales, paid, wholeEuroDue(sales, paid), Number(a.walletBalance ?? 0),
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
    wsFl.addRow([
      f.id, f.flightNumber ?? "", f.airline ?? "",
      f.fromCity, f.toCity, fmtDate(f.departureDate),
      f.departureTime ?? "", fmtDate(f.arrivalDate), f.arrivalTime ?? "",
      (f as any).cabinClass ?? "", Number(f.adultPrice ?? 0), Number(f.childPrice ?? 0),
      seats, sold, Math.max(0, seats - sold), f.status ?? "active",
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
      tx.type, Number(tx.amount), tx.reference ?? "", tx.notes ?? "",
    ]);
    if (tx.type === "credit" || tx.type === "deposit") {
      row.getCell(6).font = { bold: true, color: { argb: "FF16A34A" } };
    } else {
      row.getCell(6).font = { bold: true, color: { argb: "FFDC2626" } };
    }
  }
  wsCr.autoFilter = { from: "A1", to: "H1" };
  autoWidth(wsCr);

  // ─ Sheet 7: Shtojcat ───────────────────────────────────────────────────────
  const wsEx = wb.addWorksheet("Shtojcat", { properties: { tabColor: { argb: "FF78350F" } } });
  hdr(wsEx, ["ID", "Referenca Rezervimit", "Klienti", "Përshkrim", "Shuma (€)"]);
  for (const ex of extras) {
    const b = bMap.get(ex.bookingId);
    wsEx.addRow([ex.id, b?.bookingRef ?? ex.bookingId, b?.customerName ?? "", ex.description, Number(ex.amount)]);
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

  wsSum.mergeCells("A2:D2");
  const updCell = wsSum.getCell("A2");
  updCell.value = `Përditësuar: ${new Date().toLocaleString("sq-AL")}`;
  updCell.font = { italic: true, color: { argb: "FF64748B" }, size: 10 };
  updCell.alignment = { horizontal: "center" };

  const activeBookings = bookings.filter(b => b.status !== "cancelled");
  const totalSales = activeBookings.reduce((s, b) => s + Number(b.totalAmount), 0);
  const totalPaid = activeBookings.reduce((s, b) => s + Math.min(Number(b.paidAmount), Number(b.totalAmount)), 0);
  const totalComm = activeBookings.reduce((s, b) => {
    const net = b.netPrice != null ? Number(b.netPrice) : null;
    return s + (net != null ? Math.max(0, Number(b.totalAmount) - net) : Number(b.markup ?? 0));
  }, 0);
  const totalPayIn = payments.filter(p => p.status === "completed" && !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunds = payments.filter(p => p.status === "completed" && p.isRefund).reduce((s, p) => s + Number(p.amount), 0);

  function addSumRow(label: string, value: number | string, bold = false, color?: string) {
    const row = wsSum.addRow(["", label, "", value]);
    row.getCell(2).font = { bold, color: color ? { argb: color } : undefined };
    row.getCell(4).font = { bold, color: color ? { argb: color } : undefined };
    if (typeof value === "number") {
      row.getCell(4).numFmt = '€#,##0.00';
    }
    row.getCell(4).alignment = { horizontal: "right" };
    if (bold) row.height = 18;
  }
  function addSumSection(label: string) {
    const row = wsSum.addRow(["", label]);
    row.getCell(2).font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
    wsSum.mergeCells(`B${row.number}:D${row.number}`);
    row.height = 20;
  }

  wsSum.addRow([]);
  addSumSection("📊 SHITJET");
  addSumRow("Rezervime Aktive", activeBookings.length);
  addSumRow("Rezervime Anuluar", bookings.filter(b => b.status === "cancelled").length);
  addSumRow("Pasagjerë (aktive)", passengers.filter(p => bMap.get(p.bookingId)?.status !== "cancelled").length);
  addSumRow("Shitjet Totale (€)", totalSales, true, "FF1E3A5F");
  addSumRow("Komisioni Total (€)", totalComm, true, "FF16A34A");
  wsSum.addRow([]);
  addSumSection("💰 PAGESAT");
  addSumRow("Të Ardhura Totale (€)", totalPayIn, true, "FF16A34A");
  addSumRow("Rimbursime (€)", totalRefunds, false, "FFDC2626");
  addSumRow("Neto të Ardhura (€)", totalPayIn - totalRefunds, true, "FF16A34A");
  addSumRow("Detyrime të Papaguara (€)", wholeEuroDue(totalSales, totalPaid), true, wholeEuroDue(totalSales, totalPaid) > 0 ? "FFDC2626" : "FF16A34A");
  wsSum.addRow([]);
  addSumSection("✈ FLUTURIMET & AGJENTËT");
  addSumRow("Fluturime Totale", flights.length);
  addSumRow("Agjentë Aktive", agents.filter(a => a.status === "active").length);

  wsSum.getColumn(1).width = 3;
  wsSum.getColumn(2).width = 35;
  wsSum.getColumn(3).width = 5;
  wsSum.getColumn(4).width = 20;

  for (const ws of [wsBook, wsPax, wsPay, wsAg, wsFl, wsCr, wsEx]) {
    stripeRows(ws);
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const tmpPath = EXCEL_PATH + ".tmp";
  await wb.xlsx.writeFile(tmpPath);
  fs.renameSync(tmpPath, EXCEL_PATH);
  console.log(`[excelWorker] ✓ Excel u ruajt: ${EXCEL_PATH} (${bookings.length} rezervime, ${payments.length} pagesa)`);
}

// Entry point: run immediately, report back to parent.
(async () => {
  try {
    await generateLiveExcel();
    parentPort?.postMessage({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[excelWorker] Error:", message);
    parentPort?.postMessage({ ok: false, error: message });
  } finally {
    // Drain the connection pool so the worker process exits cleanly.
    try { await pool.end(); } catch { /* ignore */ }
  }
})();
