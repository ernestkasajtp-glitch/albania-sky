// Raporti ditor "Pasagjerët e Sotëm" — email me numrin e pasagjerëve që
// fluturojnë sot, komisionin e fituar nga këto rezervime dhe listën e plotë
// të pasagjerëve në PDF. Dërgohet çdo mëngjes te NOTIFY_EMAIL (cron) dhe
// numëron me të njëjtat rregulla si karta "Pasagjerë Sot" në dashboard:
// vetëm pasagjerë jo të anuluar në rezervime jo të anuluara, për fluturime
// me nisje sot (Europe/Tirane).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, bookingsTable, flightsTable, passengersTable, agentsTable } from "@workspace/db";
import { calcCombinedNetAndCommission } from "./getFullBooking.js";
import { sendEmail } from "./gmail.js";
import { logger } from "./logger.js";
import { fmtAmPm } from "./timeFormat.js";

const BRAND = rgb(0.11, 0.15, 0.36);
const MUTED = rgb(0.42, 0.45, 0.55);
const LINE = rgb(0.85, 0.87, 0.92);
const OK = rgb(0.09, 0.55, 0.31);

const PAX_TYPE_AL: Record<string, string> = {
  adult: "I rritur",
  child: "Fëmijë",
  infant: "Foshnjë",
};

// Zëvendëson karaktere jashtë WinAnsi që encodeText të mos hedhë gabim
// (i njëjti helper si te invoicePdf.ts).
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
    .replace(/[^\x00-\xFF\u20AC]/g, "?"); // € (\u20AC) lejohet — WinAnsi e enkodon
}

interface PaxRow {
  name: string;
  type: string;
  pnr: string;
  bookingRef: string;
  agency: string;
}

export interface FlightGroup {
  title: string; // p.sh. "W6 4432 · Tirana -> Milan Bergamo · Nisja 06:40"
  commission: number; // komisioni i fituar nga rezervimet e këtij fluturimi
  rows: PaxRow[];
}

export async function generatePassengersPdf(dateLabel: string, groups: FlightGroup[], totalPax: number, totalCommission: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 40;
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 45;

  const text = (s: string, x: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(safe(s), { x, y, size: opts.size ?? 9, font: opts.font ?? font, color: opts.color ?? rgb(0.13, 0.13, 0.16) });
  };
  const clip = (s: string, max: number, size: number, f: PDFFont): string => {
    let v = safe(s);
    while (v.length > 1 && f.widthOfTextAtSize(v, size) > max) v = v.slice(0, -1);
    return v === safe(s) ? v : v.slice(0, -1) + "...";
  };
  const newPageIfNeeded = (needed: number) => {
    if (y - needed < 45) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 45;
    }
  };
  const hr = () => page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: LINE });

  // Kolonat: # | Emri | Lloji | PNR | Rezervimi | Agjencia
  const COL = { idx: M, name: M + 22, type: M + 200, pnr: M + 258, ref: M + 330, agency: M + 402 };
  const AGENCY_W = PAGE_W - M - COL.agency;

  // ── Header ──
  text("Albania Sky", M, { size: 16, font: bold, color: BRAND });
  const hdr = "PASAGJERET E DITES";
  page.drawText(safe(hdr), { x: PAGE_W - M - bold.widthOfTextAtSize(hdr, 14), y, size: 14, font: bold, color: BRAND });
  y -= 15;
  text(`Data e fluturimit: ${dateLabel}`, M, { size: 9, color: MUTED });
  const tot = `Gjithsej: ${totalPax} pasagjere  ·  Komisioni total: €${Math.round(totalCommission)}`;
  page.drawText(safe(tot), { x: PAGE_W - M - bold.widthOfTextAtSize(safe(tot), 9), y, size: 9, font: bold });
  y -= 10;
  hr();
  y -= 18;

  if (groups.length === 0) {
    text("Nuk ka pasagjere per kete date.", M, { size: 10, color: MUTED });
  }

  for (const g of groups) {
    newPageIfNeeded(46);
    // Titulli i fluturimit + komisioni i fituar nga ky fluturim (djathtas)
    const comm = safe(`Komisioni: €${Math.round(g.commission)}`);
    const commW = bold.widthOfTextAtSize(comm, 9);
    text(clip(g.title, PAGE_W - 2 * M - commW - 10, 10.5, bold), M, { size: 10.5, font: bold, color: BRAND });
    page.drawText(comm, { x: PAGE_W - M - commW, y, size: 9, font: bold, color: OK });
    y -= 14;
    // Header i tabelës
    text("#", COL.idx, { size: 7.5, font: bold, color: MUTED });
    text("EMRI", COL.name, { size: 7.5, font: bold, color: MUTED });
    text("LLOJI", COL.type, { size: 7.5, font: bold, color: MUTED });
    text("PNR", COL.pnr, { size: 7.5, font: bold, color: MUTED });
    text("REZERVIMI", COL.ref, { size: 7.5, font: bold, color: MUTED });
    text("AGJENCIA", COL.agency, { size: 7.5, font: bold, color: MUTED });
    y -= 4;
    hr();
    y -= 12;

    let i = 0;
    for (const r of g.rows) {
      i += 1;
      newPageIfNeeded(13);
      text(String(i), COL.idx, { size: 8.5, color: MUTED });
      text(clip(r.name, COL.type - COL.name - 8, 8.5, font), COL.name, { size: 8.5 });
      text(clip(r.type, COL.pnr - COL.type - 8, 8.5, font), COL.type, { size: 8.5 });
      text(clip(r.pnr, COL.ref - COL.pnr - 8, 8.5, font), COL.pnr, { size: 8.5 });
      text(clip(r.bookingRef, COL.agency - COL.ref - 8, 8.5, font), COL.ref, { size: 8.5 });
      text(clip(r.agency, AGENCY_W, 8.5, font), COL.agency, { size: 8.5 });
      y -= 12;
    }
    y -= 14;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// Mbledh të dhënat për një datë (YYYY-MM-DD, ditë kalendarike Europe/Tirane),
// me filtër opsional për qytetin/kodin e nisjes dhe të mbërritjes (ILIKE pjesore).
async function collectPassengersData(dateStr: string, filter?: { from?: string; to?: string }) {
  const conds = [eq(flightsTable.departureDate, dateStr)];
  if (filter?.from) conds.push(sql`${flightsTable.fromCity} ILIKE ${"%" + filter.from + "%"}`);
  if (filter?.to) conds.push(sql`${flightsTable.toCity} ILIKE ${"%" + filter.to + "%"}`);
  const flights = await db.select().from(flightsTable).where(and(...conds));
  if (flights.length === 0) {
    return { flights, bookings: [] as (typeof bookingsTable.$inferSelect)[], passengers: [] as (typeof passengersTable.$inferSelect)[], agentNames: new Map<number, string>() };
  }
  const flightIds = flights.map(f => f.id);
  const bookings = await db.select().from(bookingsTable).where(and(
    inArray(bookingsTable.flightId, flightIds),
    sql`${bookingsTable.status} != 'cancelled'`,
  ));
  const bookingIds = bookings.map(b => b.id);
  const passengers = bookingIds.length
    ? await db.select().from(passengersTable).where(and(
        inArray(passengersTable.bookingId, bookingIds),
        sql`COALESCE(${passengersTable.cancelled}, false) = false`,
      ))
    : [];
  const agentIds = [...new Set(bookings.map(b => b.agentId).filter((v): v is number => v != null))];
  const agents = agentIds.length ? await db.select().from(agentsTable).where(inArray(agentsTable.id, agentIds)) : [];
  const agentNames = new Map(agents.map(a => [a.id, a.name] as const));
  return { flights, bookings, passengers, agentNames };
}

// Ndërton grupet e pasagjerëve për një datë (opsionale: filtër nisje/mbërritje).
// Përdoret nga raporti ditor me email DHE nga kërkimi admin në dashboard.
export async function buildPassengersReportData(dateStr: string, filter?: { from?: string; to?: string }) {
  const { flights, bookings, passengers, agentNames } = await collectPassengersData(dateStr, filter);

  // Komisioni për secilin fluturim (nga rezervimet e tij, jo të anuluara).
  const commissionByFlight = new Map<number, number>();
  for (const b of bookings) {
    const { commission } = calcCombinedNetAndCommission(
      Number(b.totalAmount),
      b.netPrice != null ? Number(b.netPrice) : null,
      0,
      Number(b.markup),
    );
    commissionByFlight.set(b.flightId, (commissionByFlight.get(b.flightId) ?? 0) + commission);
  }

  // Grupim pasagjerësh sipas fluturimit, i renditur sipas orës së nisjes.
  const bookingById = new Map(bookings.map(b => [b.id, b] as const));
  const paxByFlight = new Map<number, PaxRow[]>();
  for (const p of passengers) {
    const b = bookingById.get(p.bookingId);
    if (!b) continue;
    const rows = paxByFlight.get(b.flightId) ?? [];
    rows.push({
      name: `${p.lastName} ${p.firstName}`.trim().toUpperCase(),
      type: PAX_TYPE_AL[p.type] ?? p.type,
      pnr: p.pnr || b.pnr || "-",
      bookingRef: b.bookingRef,
      agency: b.agentId != null ? (agentNames.get(b.agentId) ?? "-") : "Direkt",
    });
    paxByFlight.set(b.flightId, rows);
  }

  const sortedFlights = [...flights].sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
  const groups: FlightGroup[] = [];
  for (const f of sortedFlights) {
    const rows = paxByFlight.get(f.id);
    if (!rows?.length) continue;
    rows.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({
      title: `${f.airline} ${f.flightNumber} · ${f.fromCity} -> ${f.toCity} · Nisja ${fmtAmPm(f.departureTime)} (${rows.length} pax)`,
      commission: commissionByFlight.get(f.id) ?? 0,
      rows,
    });
  }

  const totalPax = passengers.length;
  // Totali = shuma e komisioneve të fluturimeve TË SHFAQURA, që totali të përputhet
  // gjithmonë me rreshtat për-fluturim në PDF.
  const commissionTotal = groups.reduce((sum, g) => sum + g.commission, 0);
  return { groups, totalPax, commissionTotal };
}

// Dërgon raportin ditor "Pasagjerët e Ditës" te NOTIFY_EMAIL.
// Ekzekutohet në 00:01 (ora e Shqipërisë), sapo mbaron dita — raporton
// pasagjerët e DITËS QË SAPO PËRFUNDOI (dita e kaluar), jo të ditës së re.
export async function sendDailyPassengersReport(): Promise<void> {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo) return;

  try {
    // Dita që sapo mbaroi: merr datën e SOTME sipas orës së Shqipërisë dhe
    // zbrit një ditë kalendarike me aritmetikë UTC (e sigurt edhe në ndërrimet
    // e orës verore/dimërore dhe edhe nëse timer-i vonon disa minuta).
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" }); // YYYY-MM-DD
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const reportDateStr = new Date(Date.UTC(ty, tm - 1, td) - 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD e ditës së kaluar
    const [yy, mm, dd] = reportDateStr.split("-");
    const dateLabel = `${dd}.${mm}.${yy}`;

    const { groups, totalPax, commissionTotal } = await buildPassengersReportData(reportDateStr);
    const pdf = await generatePassengersPdf(dateLabel, groups, totalPax, commissionTotal);

    const flightsWithPax = groups.length;
    const html = `
      <h2>Pasagjerët e Ditës — ${dateLabel}</h2>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif">
        <tr style="background:#f0f0f0"><th>Metrika</th><th>Vlera</th></tr>
        <tr><td>Pasagjerë që fluturuan më ${dateLabel}</td><td><strong>${totalPax}</strong></td></tr>
        <tr><td>Fluturime me pasagjerë</td><td><strong>${flightsWithPax}</strong></td></tr>
        <tr><td>Komisioni i fituar (nga këto rezervime)</td><td><strong>€${Math.round(commissionTotal)}</strong></td></tr>
      </table>
      <p style="font-family:sans-serif;font-size:13px">Lista e plotë e pasagjerëve gjendet në PDF-në bashkangjitur.</p>
      <p style="color:#888;font-size:12px">Dërguar automatikisht nga FMS Pro</p>
    `;

    await sendEmail(notifyTo, `✈️ Pasagjerët e Ditës — ${dateLabel} (${totalPax} pasagjerë)`, html, [
      { filename: `pasagjeret_${reportDateStr}.pdf`, content: pdf, mimeType: "application/pdf" },
    ]);
    logger.info({ totalPax, flightsWithPax, commissionTotal }, "[pax-report] daily passengers report sent");
  } catch (e) {
    logger.error({ err: e }, "[pax-report] failed to send daily passengers report");
  }
}
