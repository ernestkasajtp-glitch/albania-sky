// Raporti ditor PREMIUM i shitjeve — email me pamje moderne + PDF elegant me
// listën e plotë të shitjeve të ditës (rezervimet e krijuara atë ditë sipas
// Europe/Tirane), shumën totale dhe komisionin e fituar. Dërgohet çdo natë
// në 23:55 te NOTIFY_EMAIL, kur dita e shitjeve është pothuajse e mbyllur.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { db, bookingsTable, flightsTable, passengersTable, agentsTable, paymentsTable } from "@workspace/db";
import { calcCombinedNetAndCommission } from "./getFullBooking.js";
import { EXCEL_PATH, excelSyncNowIfDirty } from "./excelSync.js";
import { sendEmail } from "./gmail.js";
import { logger } from "./logger.js";
import fs from "fs";

const BRAND = rgb(0.11, 0.15, 0.36);
const BRAND_LIGHT = rgb(0.93, 0.94, 0.98);
const MUTED = rgb(0.42, 0.45, 0.55);
const LINE = rgb(0.85, 0.87, 0.92);
const OK = rgb(0.12, 0.55, 0.28);
const ROW_ALT = rgb(0.965, 0.97, 0.985);

function pad(n: number) { return String(n).padStart(2, "0"); }

// ── Dita kalendarike Europe/Tirane (kopje e helper-ëve të cron.ts, DST-korrekte) ──
function albaniaOffsetMsAt(at: Date): number {
  const local = new Date(at.toLocaleString("en-US", { timeZone: "Europe/Tirane" }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
}
function albaniaMidnightUtc(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const offset = albaniaOffsetMsAt(new Date(guess));
  return new Date(guess - offset);
}
export function albaniaDayWindowForSales(ref: Date): { startOfDay: Date; endOfDay: Date; label: string } {
  const [y, m, d] = ref.toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" }).split("-").map(Number);
  const startOfDay = albaniaMidnightUtc(y, m, d);
  const [ny, nm, nd] = new Date(startOfDay.getTime() + 26 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" }).split("-").map(Number);
  const nextStart = albaniaMidnightUtc(ny, nm, nd);
  const endOfDay = new Date(nextStart.getTime() - 1);
  return { startOfDay, endOfDay, label: `${pad(d)}.${pad(m)}.${y}` };
}

// Ora shfaqet 12-orëshe me AM/PM (vetëm paraqitje — ruajtja mbetet 24-orëshe).
function albaniaTime(d: Date) {
  return d.toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true });
}

// WinAnsi-safe (i njëjti helper si te invoicePdf.ts) — € lejohet (\u20AC).
function safe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return (s ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/\u2022/g, "\u00B7")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2007\u2008\u2009\u200A\u202F]/g, " ")
    .replace(/[^\x00-\xFF\u20AC]/g, "?");
}

interface SaleRow {
  time: string;
  ref: string;
  customer: string;
  flight: string;
  agency: string;
  pax: number;
  amount: number;
  commission: number;
  status: string;
}

interface SalesData {
  label: string;
  rows: SaleRow[];
  totalSales: number;
  totalCommission: number;
  totalPax: number;
  cancelledCount: number;
  paidToday: number;
}

const STATUS_AL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  confirmed: "Konfirmuar",
  ticketed: "Me Biletë",
  cancelled: "Anuluar",
};

async function collectSalesData(ref: Date): Promise<SalesData> {
  const { startOfDay, endOfDay, label } = albaniaDayWindowForSales(ref);

  const dayBookings = await db.select().from(bookingsTable).where(and(
    gte(bookingsTable.createdAt, startOfDay),
    lte(bookingsTable.createdAt, endOfDay),
  ));
  const sold = dayBookings.filter(b => b.status !== "cancelled");
  const cancelledCount = dayBookings.length - sold.length;

  const bookingIds = sold.map(b => b.id);
  const paxRows = bookingIds.length
    ? await db.select({ bookingId: passengersTable.bookingId, cnt: sql<string>`COUNT(*)::text` })
        .from(passengersTable)
        .where(and(inArray(passengersTable.bookingId, bookingIds), sql`COALESCE(${passengersTable.cancelled}, false) = false`))
        .groupBy(passengersTable.bookingId)
    : [];
  const paxMap = new Map(paxRows.map(r => [r.bookingId, Number(r.cnt)] as const));

  const flightIds = [...new Set(sold.map(b => b.flightId))];
  const flights = flightIds.length ? await db.select().from(flightsTable).where(inArray(flightsTable.id, flightIds)) : [];
  const flightMap = new Map(flights.map(f => [f.id, f]));

  const agentIds = [...new Set(sold.map(b => b.agentId).filter((v): v is number => v != null))];
  const agents = agentIds.length ? await db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds)) : [];
  const agentMap = new Map(agents.map(a => [a.id, a.name] as const));

  const dayPayments = await db.select().from(paymentsTable).where(and(
    gte(paymentsTable.createdAt, startOfDay),
    lte(paymentsTable.createdAt, endOfDay),
  ));
  const paidToday = dayPayments
    .filter(p => p.status === "completed" && !p.isRefund)
    .reduce((s, p) => s + Number(p.amount), 0);

  const rows: SaleRow[] = [...sold]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(b => {
      const f = flightMap.get(b.flightId);
      const { commission } = calcCombinedNetAndCommission(
        Number(b.totalAmount),
        b.netPrice != null ? Number(b.netPrice) : null,
        0,
        Number(b.markup),
      );
      return {
        time: albaniaTime(b.createdAt),
        ref: b.bookingRef,
        customer: b.customerName,
        flight: f ? `${f.fromCity} -> ${f.toCity} · ${f.departureDate.split("-").reverse().join(".")}` : "-",
        agency: b.agentId != null ? (agentMap.get(b.agentId) ?? "-") : "Direkt",
        pax: paxMap.get(b.id) ?? 0,
        amount: Number(b.totalAmount),
        commission,
        status: STATUS_AL[b.status] ?? b.status,
      };
    });

  return {
    label,
    rows,
    totalSales: rows.reduce((s, r) => s + r.amount, 0),
    totalCommission: rows.reduce((s, r) => s + r.commission, 0),
    totalPax: rows.reduce((s, r) => s + r.pax, 0),
    cancelledCount,
    paidToday,
  };
}

// ── PDF premium ──────────────────────────────────────────────────────────────
async function generateSalesPdf(data: SalesData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape — tabela merr frymë
  const M = 36;
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = 0;

  const text = (s: string, x: number, yy: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(safe(s), { x, y: yy, size: opts.size ?? 9, font: opts.font ?? font, color: opts.color ?? rgb(0.13, 0.13, 0.16) });
  };
  const right = (s: string, xRight: number, yy: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 9;
    text(s, xRight - f.widthOfTextAtSize(safe(s), size), yy, opts);
  };
  const clip = (s: string, max: number, size: number, f: PDFFont): string => {
    let v = safe(s);
    while (v.length > 1 && f.widthOfTextAtSize(v, size) > max) v = v.slice(0, -1);
    return v === safe(s) ? v : v.slice(0, -1) + "...";
  };

  // Kolonat (landscape, 770 pt të përdorshme)
  const COL = { idx: M, time: M + 26, ref: M + 62, customer: M + 128, flight: M + 268, agency: M + 452, status: M + 570, pax: M + 640, amountR: M + 706, commR: PAGE_W - M };
  const CUSTOMER_W = COL.flight - COL.customer - 10;
  const FLIGHT_W = COL.agency - COL.flight - 10;
  const AGENCY_W = COL.status - COL.agency - 10;
  const STATUS_W = COL.pax - COL.status - 10;

  const drawTableHeader = () => {
    page.drawRectangle({ x: M - 6, y: y - 4, width: PAGE_W - 2 * (M - 6), height: 16, color: BRAND });
    const o = { size: 7.5, font: bold, color: rgb(1, 1, 1) };
    text("#", COL.idx, y, o);
    text("ORA", COL.time, y, o);
    text("REF", COL.ref, y, o);
    text("KLIENTI", COL.customer, y, o);
    text("FLUTURIMI", COL.flight, y, o);
    text("AGJENCIA", COL.agency, y, o);
    text("STATUSI", COL.status, y, o);
    text("PAX", COL.pax, y, o);
    right("SHUMA", COL.amountR, y, o);
    right("KOMISIONI", COL.commR, y, o);
    y -= 20;
  };
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 45;
    drawTableHeader();
  };

  // ── Header band ──
  page.drawRectangle({ x: 0, y: PAGE_H - 84, width: PAGE_W, height: 84, color: BRAND });
  y = PAGE_H - 40;
  text("Albania Sky", M, y, { size: 20, font: bold, color: rgb(1, 1, 1) });
  right("RAPORT DITOR I SHITJEVE", PAGE_W - M, y, { size: 16, font: bold, color: rgb(1, 1, 1) });
  y -= 20;
  text("Flight Management System", M, y, { size: 9, color: rgb(0.78, 0.82, 0.95) });
  right(data.label, PAGE_W - M, y, { size: 11, font: bold, color: rgb(0.78, 0.82, 0.95) });

  // ── Kutitë përmbledhëse ──
  y = PAGE_H - 84 - 46;
  const boxW = (PAGE_W - 2 * M - 3 * 12) / 4;
  const boxes = [
    { label: "REZERVIME TE SHITURA", value: String(data.rows.length) },
    { label: "PASAGJERE", value: String(data.totalPax) },
    { label: "SHITJE TOTALE", value: `€${Math.round(data.totalSales)}` },
    { label: "KOMISIONI I FITUAR", value: `€${Math.round(data.totalCommission)}`, ok: true },
  ];
  boxes.forEach((b, i) => {
    const x = M + i * (boxW + 12);
    page.drawRectangle({ x, y: y - 14, width: boxW, height: 44, color: BRAND_LIGHT, borderColor: LINE, borderWidth: 1 });
    text(b.label, x + 10, y + 16, { size: 7, font: bold, color: MUTED });
    text(b.value, x + 10, y - 2, { size: 14, font: bold, color: b.ok ? OK : BRAND });
  });
  y -= 44;

  // ── Tabela ──
  drawTableHeader();
  if (data.rows.length === 0) {
    text("Asnje shitje e regjistruar per kete dite.", M, y, { size: 10, color: MUTED });
    y -= 14;
  }
  let i = 0;
  for (const r of data.rows) {
    i += 1;
    if (y < 60) newPage();
    if (i % 2 === 0) page.drawRectangle({ x: M - 6, y: y - 3.5, width: PAGE_W - 2 * (M - 6), height: 13, color: ROW_ALT });
    text(String(i), COL.idx, y, { size: 8, color: MUTED });
    text(r.time, COL.time, y, { size: 8 });
    text(r.ref, COL.ref, y, { size: 8, font: bold });
    text(clip(r.customer.toUpperCase(), CUSTOMER_W, 8, font), COL.customer, y, { size: 8 });
    text(clip(r.flight, FLIGHT_W, 8, font), COL.flight, y, { size: 8 });
    text(clip(r.agency, AGENCY_W, 8, font), COL.agency, y, { size: 8 });
    text(clip(r.status, STATUS_W, 8, font), COL.status, y, { size: 8, color: MUTED });
    text(String(r.pax), COL.pax, y, { size: 8 });
    right(`€${Math.round(r.amount)}`, COL.amountR, y, { size: 8 });
    right(`€${Math.round(r.commission)}`, COL.commR, y, { size: 8, color: OK });
    y -= 13;
  }

  // ── Totali ──
  if (y < 76) newPage();
  y -= 4;
  page.drawLine({ start: { x: M - 6, y: y + 8 }, end: { x: PAGE_W - M + 6, y: y + 8 }, thickness: 1.2, color: BRAND });
  text("TOTALI", COL.customer, y - 6, { size: 10, font: bold, color: BRAND });
  text(String(data.totalPax), COL.pax, y - 6, { size: 9, font: bold });
  right(`€${Math.round(data.totalSales)}`, COL.amountR, y - 6, { size: 10, font: bold, color: BRAND });
  right(`€${Math.round(data.totalCommission)}`, COL.commR, y - 6, { size: 10, font: bold, color: OK });
  y -= 26;
  text(`Arketuar sot (pagesa te kryera): €${Math.round(data.paidToday)}`, M, y, { size: 8.5, color: MUTED });
  if (data.cancelledCount > 0) {
    y -= 12;
    text(`Rezervime te anuluara sot: ${data.cancelledCount} (nuk perfshihen ne totalet me siper)`, M, y, { size: 8.5, color: MUTED });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ── Email body premium ───────────────────────────────────────────────────────
function buildSalesEmailHtml(data: SalesData, excelDownloadUrl?: string): string {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const CAP = 40;
  const shown = data.rows.slice(0, CAP);
  const rowsHtml = shown.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f6f8fc"}">
      <td style="padding:7px 10px;font-size:12px;color:#64748b">${esc(r.time)}</td>
      <td style="padding:7px 10px;font-size:12px;font-weight:600;color:#1c2660">${esc(r.ref)}</td>
      <td style="padding:7px 10px;font-size:12px">${esc(r.customer)}</td>
      <td style="padding:7px 10px;font-size:12px;color:#475569">${esc(r.agency)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:center">${r.pax}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:600">€${Math.round(r.amount)}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;color:#15803d;font-weight:600">€${Math.round(r.commission)}</td>
    </tr>`).join("");

  const card = (label: string, value: string, accent = "#1c2660") => `
    <td style="padding:6px">
      <div style="background:#f6f8fc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;text-align:center">
        <div style="font-size:10px;letter-spacing:1px;color:#64748b;font-weight:700;text-transform:uppercase">${label}</div>
        <div style="font-size:22px;font-weight:800;color:${accent};margin-top:4px">${value}</div>
      </div>
    </td>`;

  return `
  <div style="background:#eef1f7;padding:24px 8px;font-family:'Segoe UI',Arial,sans-serif">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:linear-gradient(135deg,#1c2660 0%,#2d3a8c 60%,#3b4bb8 100%);padding:26px 28px">
        <div style="font-size:22px;font-weight:800;color:#ffffff">Albania Sky</div>
        <div style="font-size:14px;color:#c3cbf2;margin-top:2px">Raport Ditor i Shitjeve — <strong style="color:#ffffff">${esc(data.label)}</strong></div>
      </div>
      <div style="padding:20px 22px 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          ${card("Rezervime", String(data.rows.length))}
          ${card("Pasagjerë", String(data.totalPax))}
        </tr><tr>
          ${card("Shitje Totale", `€${Math.round(data.totalSales)}`)}
          ${card("Komisioni", `€${Math.round(data.totalCommission)}`, "#15803d")}
        </tr></table>
        <div style="margin:10px 6px 0;font-size:12px;color:#64748b">
          Arkëtuar sot (pagesa të kryera): <strong style="color:#1c2660">€${Math.round(data.paidToday)}</strong>
          ${data.cancelledCount > 0 ? ` &nbsp;·&nbsp; Anuluar sot: <strong>${data.cancelledCount}</strong>` : ""}
        </div>
      </div>
      <div style="padding:14px 22px 6px">
        <div style="font-size:13px;font-weight:700;color:#1c2660;margin:0 6px 8px">Shitjet e ditës${data.rows.length > CAP ? ` (${CAP} të parat — lista e plotë në PDF)` : ""}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
          <tr style="background:#1c2660">
            <th style="padding:8px 10px;font-size:10px;color:#ffffff;text-align:left;letter-spacing:0.5px">ORA</th>
            <th style="padding:8px 10px;font-size:10px;color:#ffffff;text-align:left;letter-spacing:0.5px">REF</th>
            <th style="padding:8px 10px;font-size:10px;color:#ffffff;text-align:left;letter-spacing:0.5px">KLIENTI</th>
            <th style="padding:8px 10px;font-size:10px;color:#ffffff;text-align:left;letter-spacing:0.5px">AGJENCIA</th>
            <th style="padding:8px 10px;font-size:10px;color:#ffffff;text-align:center;letter-spacing:0.5px">PAX</th>
            <th style="padding:8px 10px;font-size:10px;color:#ffffff;text-align:right;letter-spacing:0.5px">SHUMA</th>
            <th style="padding:8px 10px;font-size:10px;color:#ffffff;text-align:right;letter-spacing:0.5px">KOMISIONI</th>
          </tr>
          ${rowsHtml || `<tr><td colspan="7" style="padding:14px;text-align:center;font-size:12px;color:#64748b">Asnjë shitje e regjistruar sot.</td></tr>`}
        </table>
      </div>
      <div style="padding:14px 28px 22px">
        <div style="font-size:12px;color:#64748b">📎 Lista e plotë dhe e detajuar gjendet në <strong>PDF-në dhe Excel-in bashkangjitur</strong>.</div>
        ${excelDownloadUrl ? `
          <div style="margin-top:14px">
            <a href="${excelDownloadUrl}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px">
              Shkarko Excel-in e Plotë
            </a>
            <div style="font-size:10px;color:#94a3b8;margin-top:7px">Për arsye sigurie, linku kërkon hyrje aktive në FMS.</div>
          </div>
        ` : ""}
        <div style="font-size:11px;color:#94a3b8;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:10px">Dërguar automatikisht nga FMS Pro · Albania Sky</div>
      </div>
    </div>
  </div>`;
}

// Dërgon raportin ditor premium të shitjeve te NOTIFY_EMAIL.
// `ref` (opsionale) = çasti brenda ditës që raportohet; default tani.
export async function sendDailySalesReport(ref: Date = new Date()): Promise<void> {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo) return;
  try {
    const data = await collectSalesData(ref);
    const pdf = await generateSalesPdf(data);
    const dateSlug = data.label.replace(/\./g, "-");
    await excelSyncNowIfDirty();
    const excel = fs.existsSync(EXCEL_PATH) ? fs.readFileSync(EXCEL_PATH) : null;
    const publicBaseUrl = process.env.FMS_PUBLIC_BASE_URL?.replace(/\/+$/, "");
    const excelDownloadUrl = publicBaseUrl
      ? `${publicBaseUrl}/api/reports/export/excel/live`
      : undefined;
    if (!excel) {
      logger.warn("[sales-report] Excel file unavailable; sending report without Excel attachment");
    }
    const attachments = [
      { filename: `shitjet_${dateSlug}.pdf`, content: pdf, mimeType: "application/pdf" },
      ...(excel
        ? [{
            filename: `FMS_Pro_Live_${dateSlug}.xlsx`,
            content: excel,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }]
        : []),
    ];
    await sendEmail(
      notifyTo,
      `📊 Raport Ditor i Shitjeve — ${data.label} · €${Math.round(data.totalSales)} shitje · €${Math.round(data.totalCommission)} komision`,
      buildSalesEmailHtml(data, excelDownloadUrl),
      attachments,
    );
    logger.info(
      { bookings: data.rows.length, totalSales: data.totalSales, totalCommission: data.totalCommission, excelAttached: Boolean(excel) },
      "[sales-report] daily sales report sent",
    );
  } catch (e) {
    logger.error({ err: e }, "[sales-report] failed to send daily sales report");
  }
}
