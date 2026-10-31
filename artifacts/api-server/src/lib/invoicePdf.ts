// Payment invoice PDF generator — pure-JS (pdf-lib) so it bundles cleanly with
// esbuild (no external font files read at runtime). StandardFonts use WinAnsi
// (CP1252) encoding which covers € and Albanian ë/ç characters.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { computeVoucherPricing } from "./voucherPricing.js";
import { fmtAmPm } from "./timeFormat.js";

export interface InvoiceInput {
  invoiceCode: string;
  date: Date;
  paymentDate: Date;
  amount: number;
  method: string;
  reference?: string | null;
  isRefund?: boolean;
  confirmed?: boolean;
  bookingRef: string;
  pnr?: string | null;
  customerName: string;
  agentName?: string | null;
  agentCompany?: string | null;
  agentEmail?: string | null;
  airline?: string | null;
  flightNumber?: string | null;
  routeFrom?: string | null;
  routeTo?: string | null;
  departureDate?: string | null;
  total?: number | null;
  paid?: number | null;
  due?: number | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  online: "Online",
  credit: "Credit (Wallet)",
};

/** Çdo mënyrë pagese që përmban "cash" shfaqet vetëm "Cash", jo me emrin e plotë të sistemit. */
function methodLabelPdf(m: string | null | undefined): string {
  if (m && /cash/i.test(m)) return "Cash";
  return (m && METHOD_LABELS[m]) || m || "-";
}

const BRAND = rgb(0.11, 0.15, 0.36);
const MUTED = rgb(0.42, 0.45, 0.55);
const LINE = rgb(0.85, 0.87, 0.92);
const OK = rgb(0.12, 0.55, 0.28);

function eur(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `EUR ${Math.round(n)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// Keep the recorded payment timestamp separate from the invoice-generation date.
function fmtPaymentDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Tirane" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/Tirane" });
}

// Replace characters outside WinAnsi so encodeText never throws on odd input.
// Control characters (TAB 0x09, newlines, etc.) are within \x00-\xFF but WinAnsi
// cannot encode them and pdf-lib throws — collapse them to a space first.
function safe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return (s ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    // Normalize common typographic punctuation that WinAnsi cannot encode, so it
    // renders cleanly instead of as "?" (em/en dash, ellipsis, bullet, smart quotes).
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/\u2022/g, "\u00B7")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2007\u2008\u2009\u200A\u202F]/g, " ")
    .replace(/[^\x00-\xFF]/g, "?");
}

export async function generateInvoicePdf(input: InvoiceInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const M = 50;
  let y = 800;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(safe(s), { x, y: yy, size: opts.size ?? 10, font: opts.font ?? font, color: opts.color ?? rgb(0.13, 0.13, 0.16) });
  };
  const right = (
    s: string,
    xRight: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(safe(s), size);
    text(s, xRight - w, yy, opts);
  };
  const hr = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 1, color: LINE });

  const docTitle = input.isRefund ? "CREDIT NOTE" : "INVOICE";

  // ── Header ───────────────────────────────────────────────────────────────
  text("Albania Sky", M, y, { size: 18, font: bold, color: BRAND });
  right(docTitle, W - M, y, { size: 18, font: bold, color: BRAND });
  y -= 16;
  text("Flight Management System", M, y, { size: 9, color: MUTED });
  right(input.invoiceCode, W - M, y, { size: 10, font: bold });
  y -= 13;
  right(fmtDate(input.date), W - M, y, { size: 9, color: MUTED });
  y -= 14;
  hr(y);
  y -= 26;

  // ── Parties ──────────────────────────────────────────────────────────────
  text("BOOKING", M, y, { size: 8, font: bold, color: MUTED });
  y -= 15;
  text(`Ref: ${input.bookingRef}`, M, y, { size: 11, font: bold });
  y -= 14;
  if (input.pnr) { text(`PNR: ${input.pnr}`, M, y, { size: 9, color: MUTED }); y -= 13; }
  text(`Customer: ${input.customerName}`, M, y, { size: 9, color: MUTED });
  y -= 24;

  // ── Flight ───────────────────────────────────────────────────────────────
  if (input.routeFrom || input.airline) {
    hr(y); y -= 18;
    text("FLIGHT", M, y, { size: 8, font: bold, color: MUTED });
    y -= 15;
    const route = [input.routeFrom, input.routeTo].filter(Boolean).join("  ->  ") || "—";
    text(route, M, y, { size: 11, font: bold });
    const al = [input.airline, input.flightNumber].filter(Boolean).join(" ");
    if (al) right(al, W - M, y, { size: 10 });
    y -= 14;
    if (input.departureDate) { text(`Departure: ${input.departureDate}`, M, y, { size: 9, color: MUTED }); }
    y -= 22;
  }

  // ── Payment table ─────────────────────────────────────────────────────────
  hr(y); y -= 16;
  text("DESCRIPTION", M, y, { size: 8, font: bold, color: MUTED });
  right("AMOUNT", W - M, y, { size: 8, font: bold, color: MUTED });
  y -= 6; hr(y); y -= 18;

  const desc = input.isRefund
    ? `Payment refund - ${input.bookingRef}`
    : `Payment for booking ${input.bookingRef}`;
  text(desc, M, y, { size: 10 });
  right(eur(input.amount), W - M, y, { size: 10, font: bold });
  y -= 14;
  text(`Method: ${methodLabelPdf(input.method)}`, M, y, { size: 9, color: MUTED });
  if (input.reference) right(`Ref: ${input.reference}`, W - M, y, { size: 9, color: MUTED });
  y -= 14;
  text(`PAYMENT DATE: ${fmtPaymentDate(input.paymentDate)}`, M, y, { size: 9, color: MUTED });
  y -= 14;
  hr(y); y -= 20;

  // ── Total paid line ───────────────────────────────────────────────────────
  right(input.isRefund ? "AMOUNT REFUNDED" : "AMOUNT PAID", W - 130, y, { size: 10, font: bold });
  right(eur(input.amount), W - M, y, { size: 12, font: bold, color: BRAND });
  y -= 26;

  // ── Booking financial summary ─────────────────────────────────────────────
  if (input.total != null) {
    text("BOOKING BALANCE", M, y, { size: 8, font: bold, color: MUTED });
    y -= 15;
    text("Booking total", M, y, { size: 9, color: MUTED });
    right(eur(input.total), W - M, y, { size: 9 });
    y -= 13;
    text("Paid so far", M, y, { size: 9, color: MUTED });
    right(eur(input.paid), W - M, y, { size: 9 });
    y -= 13;
    text("Remaining to pay", M, y, { size: 9, font: bold, color: MUTED });
    right(eur(input.due), W - M, y, { size: 9, font: bold, color: input.due && input.due > 0 ? rgb(0.7, 0.2, 0.2) : OK });
    y -= 22;
  }

  // ── Confirmed stamp ───────────────────────────────────────────────────────
  if (input.confirmed) {
    page.drawRectangle({ x: M, y: y - 6, width: 190, height: 24, borderColor: OK, borderWidth: 1.5, color: rgb(0.92, 0.97, 0.93) });
    text("PAYMENT CONFIRMED", M + 12, y + 2, { size: 10, font: bold, color: OK });
    y -= 36;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  text("This invoice was generated automatically by Albania Sky.", M, 60, { size: 8, color: MUTED });
  text(`Unique invoice code: ${input.invoiceCode}`, M, 48, { size: 8, color: MUTED });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export interface CreditInvoiceInput {
  invoiceCode: string;
  date: Date;
  paymentDate: Date;
  amount: number;
  // "deposit" = pure credit added to wallet (no products);
  // "credit"  = surplus (tepricë) from an overpayment.
  kind: "deposit" | "credit";
  paymentMethod?: string | null;
  agentName?: string | null;
  agentCompany?: string | null;
  agentEmail?: string | null;
  bookingRef?: string | null;
  reference?: string | null;
  notes?: string | null;
  balanceAfter?: number | null;
}

// Credit invoice — for wallet deposits and surplus (tepricë) credits that are
// NOT tied to a product/ticket. Uses the CRD invoice code.
export async function generateCreditInvoicePdf(input: CreditInvoiceInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const M = 50;
  let y = 800;

  const text = (
    s: string, x: number, yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(safe(s), { x, y: yy, size: opts.size ?? 10, font: opts.font ?? font, color: opts.color ?? rgb(0.13, 0.13, 0.16) });
  };
  const right = (
    s: string, xRight: number, yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(safe(s), size);
    text(s, xRight - w, yy, opts);
  };
  const hr = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 1, color: LINE });

  const isDeposit = input.kind === "deposit";
  const reductionDescription = !isDeposit && input.notes?.startsWith("Kreditim €")
    ? input.notes
    : null;

  // ── Header ───────────────────────────────────────────────────────────────
  text("Albania Sky", M, y, { size: 18, font: bold, color: BRAND });
  right("CREDIT INVOICE", W - M, y, { size: 18, font: bold, color: BRAND });
  y -= 16;
  text("Flight Management System", M, y, { size: 9, color: MUTED });
  right(input.invoiceCode, W - M, y, { size: 10, font: bold });
  y -= 13;
  right(fmtDate(input.date), W - M, y, { size: 9, color: MUTED });
  y -= 14;
  hr(y);
  y -= 26;

  y -= 11;

  // ── Credit table ────────────────────────────────────────────────────────────
  hr(y); y -= 16;
  text("DESCRIPTION", M, y, { size: 8, font: bold, color: MUTED });
  right("AMOUNT", W - M, y, { size: 8, font: bold, color: MUTED });
  y -= 6; hr(y); y -= 18;

  const desc = isDeposit
    ? (input.amount < 0 ? "Deduction from credit balance" : "Deposit to credit balance")
    : reductionDescription ?? `Credit from surplus${input.bookingRef ? ` - ${input.bookingRef}` : ""}`;
  text(desc, M, y, { size: 10 });
  right(eur(input.amount), W - M, y, { size: 10, font: bold });
  y -= 14;
  if (input.paymentMethod) { text(`Payment method: ${input.paymentMethod}`, M, y, { size: 9, color: MUTED }); y -= 14; }
  if (input.reference) { text(`Ref: ${input.reference}`, M, y, { size: 9, color: MUTED }); y -= 14; }
  text(`${isDeposit ? "PAYMENT DATE" : "CREDIT DATE"}: ${fmtPaymentDate(input.paymentDate)}`, M, y, { size: 9, color: MUTED });
  y -= 14;
  hr(y); y -= 20;

  // ── Total credited line ──────────────────────────────────────────────────────
  right(input.amount < 0 ? "CREDIT ADJUSTMENT" : "AMOUNT CREDITED", W - 150, y, { size: 10, font: bold });
  right(eur(input.amount), W - M, y, { size: 12, font: bold, color: OK });
  y -= 26;

  if (input.balanceAfter != null) {
    text("Current wallet balance", M, y, { size: 9, color: MUTED });
    right(eur(input.balanceAfter), W - M, y, { size: 9, font: bold });
    y -= 18;
  }

  if (input.notes && input.notes !== desc) {
    text("Note:", M, y, { size: 8, font: bold, color: MUTED });
    y -= 13;
    text(input.notes, M, y, { size: 9, color: MUTED });
    y -= 18;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  text("This invoice was generated automatically by Albania Sky.", M, 60, { size: 8, color: MUTED });
  text(`Unique invoice code: ${input.invoiceCode}`, M, 48, { size: 8, color: MUTED });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ── Booking confirmation PDF (matches the premium email document) ────────────
const NAVY = rgb(0.059, 0.090, 0.165); // #0f172a
const SLATE = rgb(0.118, 0.161, 0.231); // #1e293b
const GRAY = rgb(0.580, 0.639, 0.722); // #94a3b8
const SOFT = rgb(0.392, 0.455, 0.545); // #64748b
const PANEL = rgb(0.973, 0.980, 0.988); // #f8fafc
const HAIR = rgb(0.886, 0.910, 0.941); // #e2e8f0
const ROSE = rgb(0.882, 0.114, 0.282); // #e11d48

const PDF_PAX_LABEL: Record<string, string> = { adult: "Adult", child: "Child", infant: "Infant" };

// Flight date/time come from the DB as separate plain-text fields
// (departureDate "2025-07-06", departureTime "16:20", arrivalTime "18:50").
// Render "Mon, 06 Jul 4:20 PM - 6:50 PM" (times displayed 12h, stored 24h).
function pdfFlightDate(
  dateStrRaw: string | null | undefined,
  depTimeRaw: string | null | undefined,
  arrTimeRaw: string | null | undefined,
): string {
  const dateStr = dateStrRaw;
  const depTime = fmtAmPm(depTimeRaw);
  const arrTime = fmtAmPm(arrTimeRaw);
  if (!dateStr) {
    const t = [depTime, arrTime].filter(Boolean).join(" - ");
    return t || "—";
  }
  const d = new Date(`${dateStr}T00:00:00Z`);
  let base: string;
  if (isNaN(d.getTime())) {
    base = String(dateStr);
  } else {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    base = `${days[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")} ${months[d.getUTCMonth()]}`;
  }
  if (depTime) base += ` ${depTime}`;
  if (arrTime) base += ` - ${arrTime}`;
  return base;
}

export async function generateBookingConfirmationPdf(
  booking: any,
  status: "draft" | "pending" | "confirmed" | "ticketed" | "cancelled",
): Promise<Buffer> {
  const isCancelled = status === "cancelled";
  const isTicketed = status === "ticketed";
  const isPending = status === "pending";
  const flight = booking.flight ?? {};
  const passengers: any[] = booking.passengers ?? [];

  const firstPax = passengers[0];
  const greetingName = firstPax?.lastName || firstPax?.firstName || booking.customerName || "Traveler";

  const origin = flight?.fromCity ?? flight?.origin ?? "—";
  const destination = flight?.toCity ?? flight?.destination ?? "—";
  const dateStr = pdfFlightDate(flight?.departureDate, flight?.departureTime, flight?.arrivalTime);
  const flightNum = flight?.flightNumber ?? flight?.airline ?? "—";
  const pnr = booking.pnr ?? null;
  // Per-passenger airline PNRs (own pnr or resolved group pnr). When passengers
  // carry separate PNRs, the top reference shows them joined: "PNR1 / PNR2".
  const activePnrs = [
    ...new Set(
      passengers
        .filter((p: any) => !p.cancelled)
        .map((p: any) => p.pnr || p.groupPnr)
        .filter(Boolean) as string[],
    ),
  ];
  const topPnr = activePnrs.length > 0 ? activePnrs.join("  /  ") : pnr;
  // CitizenPlane reference — only for the ONLINE TRAVEL agency. These bookings
  // are imported from CitizenPlane and carry a second reference (the CP code,
  // stored in notes as "[CP:XXXX]"). We surface it next to our own booking
  // reference so the agency can match both codes on one document.
  const isOnlineTravel = String(booking.agentName ?? "").toUpperCase().includes("ONLINE TRAVEL");
  const cpRefMatch = isOnlineTravel ? String(booking.notes ?? "").match(/\[CP:([^\]]+)\]/i) : null;
  const cpRef = cpRefMatch ? cpRefMatch[1].trim() : null;
  // Reference shown in the top status banner. For ONLINE TRAVEL the customer-facing
  // reference is the CP code; everyone else keeps our own booking reference.
  const topRef = cpRef ?? (booking.bookingRef ?? "—");

  const doc = await PDFDocument.create();
  let page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono: PDFFont = await doc.embedFont(StandardFonts.CourierBold);
  const W = page.getWidth();
  const M = 50;
  let y = 841.89;
  // Multi-page: content that doesn't fit flows onto a fresh page instead of
  // overlapping the footer (bookings with many passengers).
  const BOTTOM = 90;
  const newPage = () => {
    page = doc.addPage([595.28, 841.89]);
    y = 841.89 - 50;
  };
  const ensure = (need: number) => { if (y - need < BOTTOM) newPage(); };

  const text = (
    s: string, x: number, yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(safe(s), { x, y: yy, size: opts.size ?? 10, font: opts.font ?? font, color: opts.color ?? SLATE });
  };
  const right = (
    s: string, xRight: number, yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    text(s, xRight - f.widthOfTextAtSize(safe(s), size), yy, opts);
  };
  const fitSize = (s: string, f: PDFFont, maxW: number, want: number, min = 9) => {
    let sz = want;
    while (sz > min && f.widthOfTextAtSize(safe(s), sz) > maxW) sz -= 0.5;
    return sz;
  };
  const hr = (yy: number, x1 = M, x2 = W - M) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 1, color: HAIR });
  const sectionLabel = (label: string, yy: number) => {
    text(label.toUpperCase(), M, yy, { size: 8, font: bold, color: GRAY });
    hr(yy - 8);
  };

  // ── Top navy strip ─────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: y - 46, width: W, height: 46, color: NAVY });
  text("ALBANIA SKY   -   KINGS TRAVEL", M, y - 28, { size: 11, font: bold, color: rgb(0.886, 0.910, 0.941) });
  y -= 46 + 44;

  // ── Title + greeting ───────────────────────────────────────────────────────
  const titleText =
    isCancelled ? "Booking Cancellation"
    : isTicketed ? "E-Ticket"
    : status === "confirmed" ? "Booking Confirmation"
    : isPending ? "Booking Pending"
    : "Booking Summary";
  text(titleText, M, y, { size: 26, font: bold, color: NAVY });

  // ── Current-status pill (top-right of title row) ────────────────────────────
  const STATUS_PILL: Record<string, { label: string; fg: ReturnType<typeof rgb>; bg: ReturnType<typeof rgb> }> = {
    draft:     { label: "HOLD",      fg: rgb(0.55, 0.40, 0.02), bg: rgb(0.99, 0.95, 0.80) },
    pending:   { label: "PENDING",   fg: rgb(0.69, 0.25, 0.02), bg: rgb(1.00, 0.93, 0.83) },
    confirmed: { label: "CONFIRMED", fg: rgb(0.12, 0.25, 0.69), bg: rgb(0.86, 0.92, 1.00) },
    ticketed:  { label: "TICKETED",  fg: rgb(0.02, 0.45, 0.20), bg: rgb(0.85, 0.97, 0.89) },
    cancelled: { label: "CANCELLED", fg: rgb(0.78, 0.07, 0.15), bg: rgb(1.00, 0.92, 0.93) },
  };
  const pill = STATUS_PILL[status] ?? STATUS_PILL.confirmed;
  const pillSize = 8.5;
  const pillW = bold.widthOfTextAtSize(pill.label, pillSize) + 22;
  const pillX = W - M - pillW;
  page.drawRectangle({ x: pillX, y: y - 3, width: pillW, height: 19, color: pill.bg });
  text(pill.label, pillX + 11, y + 3, { size: pillSize, font: bold, color: pill.fg });

  y -= 22;
  text(`Dear ${greetingName},`, M, y, { size: 9.5, color: SOFT });
  y -= 13;
  text(
    isCancelled ? "your booking has been cancelled"
    : isTicketed ? "your ticket has been issued"
    : status === "confirmed" ? "here you can find your booking confirmation"
    : isPending ? "your booking is awaiting confirmation"
    : "here you can find your booking summary",
    M, y, { size: 9.5, color: SOFT },
  );
  if (!isCancelled) {
    y -= 13;
    text("Please note this document is not your boarding pass.", M, y, { size: 8.5, color: GRAY });
  }
  y -= 28;

  // ── Cancelled banner ───────────────────────────────────────────────────────
  if (isCancelled) {
    page.drawRectangle({ x: M, y: y - 22, width: W - 2 * M, height: 34, color: rgb(1, 0.945, 0.957) });
    page.drawRectangle({ x: M, y: y - 22, width: 3, height: 34, color: ROSE });
    text("BOOKING CANCELLED", M + 14, y + 2, { size: 9, font: bold, color: ROSE });
    text(`This booking has been cancelled. Reference: ${topRef}`, M + 14, y - 11, { size: 8.5, color: rgb(0.624, 0.071, 0.224) });
    y -= 46;
  }

  // ── Ticket-issued banner ───────────────────────────────────────────────────
  if (isTicketed) {
    page.drawRectangle({ x: M, y: y - 22, width: W - 2 * M, height: 34, color: rgb(0.925, 0.992, 0.961) });
    page.drawRectangle({ x: M, y: y - 22, width: 3, height: 34, color: rgb(0.024, 0.588, 0.412) });
    text("TICKET ISSUED", M + 14, y + 2, { size: 9, font: bold, color: rgb(0.024, 0.588, 0.412) });
    const bannerLine = `Your ticket has been issued.${topPnr ? "  PNR: " + topPnr : ""}  Reference: ${topRef}`;
    text(bannerLine, M + 14, y - 11, { size: fitSize(bannerLine, font, W - 2 * M - 28, 8.5, 5.5), color: rgb(0.047, 0.404, 0.298) });
    y -= 46;
  }

  // ── Pending banner ──────────────────────────────────────────────────────────
  if (isPending) {
    page.drawRectangle({ x: M, y: y - 22, width: W - 2 * M, height: 34, color: rgb(1, 0.961, 0.902) });
    page.drawRectangle({ x: M, y: y - 22, width: 3, height: 34, color: rgb(0.918, 0.451, 0.024) });
    text("BOOKING PENDING", M + 14, y + 2, { size: 9, font: bold, color: rgb(0.690, 0.251, 0.024) });
    text(`This booking is awaiting confirmation. Reference: ${topRef}`, M + 14, y - 11, { size: 8.5, color: rgb(0.549, 0.196, 0.020) });
    y -= 46;
  }

  // ── Reference / PNR panel ──────────────────────────────────────────────────
  // Columns: our booking reference (always), the CP reference (ONLINE TRAVEL
  // only), and the airline PNR (when present). Laid out in equal columns with a
  // hairline divider between each, so 1/2/3 codes all stay aligned.
  const refCols: Array<{ label: string; value: string }> = [
    { label: "BOOKING REFERENCE", value: booking.bookingRef ?? "—" },
  ];
  if (cpRef) refCols.push({ label: "CP REFERENCE", value: cpRef });
  if (topPnr) refCols.push({ label: "AIRLINE PNR", value: topPnr });

  const refH = 58;
  page.drawRectangle({ x: M, y: y - refH, width: W - 2 * M, height: refH, color: PANEL, borderColor: HAIR, borderWidth: 1 });
  const refInnerW = W - 2 * M;
  const refColW = refInnerW / refCols.length;
  refCols.forEach((c, i) => {
    const cx = M + i * refColW + 20;
    const valMaxW = refColW - 40;
    if (i > 0) {
      const divX = M + i * refColW;
      page.drawLine({ start: { x: divX, y: y - 12 }, end: { x: divX, y: y - refH + 12 }, thickness: 1, color: HAIR });
    }
    text(c.label, cx, y - 20, { size: 8, font: bold, color: GRAY });
    // Vlera me shumë PNR ("A / B / C / ...") thyhet në deri 2 rreshta që të mos dalë jashtë kutisë.
    const tokens = c.value.split(/\s+\/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const t of tokens) {
      const cand = cur ? `${cur} / ${t}` : t;
      if (cur && mono.widthOfTextAtSize(safe(cand), 10) > valMaxW) { lines.push(cur); cur = t; }
      else cur = cand;
    }
    if (cur) lines.push(cur);
    // Shkrim normal (jo i madh) — kërkesë e userit: të dalin TË GJITHA PNR-të.
    if (lines.length <= 1) {
      text(c.value, cx, y - 42, { size: fitSize(c.value, mono, valMaxW, 13), font: mono, color: NAVY });
    } else {
      const l2 = lines.slice(1).join(" / ");
      text(lines[0], cx, y - 36, { size: fitSize(lines[0], mono, valMaxW, 9, 6), font: mono, color: NAVY });
      text(l2, cx, y - 48, { size: fitSize(l2, mono, valMaxW, 9, 6), font: mono, color: NAVY });
    }
  });
  y -= refH + 12;

  // ── Online check-in note ───────────────────────────────────────────────────
  text("Online check-in is open 24 hours before the flight.", M, y, { size: 9, font: bold, color: NAVY });
  y -= 24;

  // ── Agency (agjensia që ka bërë rezervimin) ────────────────────────────────
  // ONLINE TRAVEL është kanal white-label: emrin e agjensisë NUK e shfaqim te e-bileta.
  if (booking.agentName && !isOnlineTravel) {
    text("AGENCY", M, y, { size: 7.5, font: bold, color: GRAY });
    y -= 15;
    text(String(booking.agentName), M, y, { size: 12, font: bold, color: NAVY });
    y -= 28;
  }

  // ── Flight ─────────────────────────────────────────────────────────────────
  sectionLabel("Flight", y);
  y -= 26;
  const col2 = M + 110;
  const col3 = M + 330;
  text("FLIGHT", M, y, { size: 7.5, font: bold, color: GRAY });
  text("ROUTE", col2, y, { size: 7.5, font: bold, color: GRAY });
  text("DATE", col3, y, { size: 7.5, font: bold, color: GRAY });
  y -= 15;
  const routeStr = `${origin}  ->  ${destination}`;
  text(flightNum, M, y, { size: fitSize(flightNum, bold, col2 - M - 10, 13, 9), font: bold, color: NAVY });
  text(routeStr, col2, y, { size: fitSize(routeStr, bold, col3 - col2 - 12, 13, 8), font: bold, color: NAVY });
  text(dateStr, col3, y, { size: fitSize(dateStr, font, W - M - col3, 10, 8), color: NAVY });
  y -= 30;

  // ── Passengers (with per-person price) ─────────────────────────────────────
  const pricing = computeVoucherPricing(booking);
  if (pricing.pax.length > 0) {
    ensure(70);
    sectionLabel("Who's traveling?", y);
    y -= 22;
    for (const px of pricing.pax) {
      ensure(42);
      const typeLabel = (PDF_PAX_LABEL[px.type] ?? "Adult").toUpperCase();
      // Një rresht: Emër Mbiemër (TIPI) … PNR … Çmimi
      text(px.name, M, y, { size: 11, color: px.cancelled ? GRAY : SLATE });
      const nameW = font.widthOfTextAtSize(safe(px.name), 11);
      text(`(${typeLabel})`, M + nameW + 8, y, { size: 8, color: GRAY });
      const paxPnr = px.pnr ?? pnr;
      if (paxPnr) {
        right(`PNR ${paxPnr}`, W - M - 110, y, { size: 8.5, font: mono, color: GRAY });
      }
      if (px.cancelled) {
        right("CANCELLED", W - M, y, { size: 9, font: bold, color: ROSE });
      } else {
        right(eur(px.price), W - M, y, { size: 11, font: bold, color: NAVY });
      }
      y -= 12;
      hr(y);
      y -= 12;
    }
    y -= 6;
  }

  // ── Luggage ────────────────────────────────────────────────────────────────
  const cabinKg = flight?.cabinBaggageKg ? Number(flight.cabinBaggageKg) : null;
  const checkedKg = flight?.checkedBaggageKg ? Number(flight.checkedBaggageKg) : null;
  const nonInfants = passengers.filter((p: any) => p.type !== "infant");
  const checkedCount = passengers.filter((p: any) => p.baggageOption === "checked").length;
  const lug: Array<[string, string]> = [];
  if (checkedKg !== null) lug.push([`${checkedCount} x Checked Luggage`, `${checkedKg} Kg`]);
  if (nonInfants.length > 0) lug.push([`${nonInfants.length} x Cabin Bag${nonInfants.length !== 1 ? "s" : ""}`, "40x30x20 cm"]);
  void cabinKg;

  if (lug.length > 0) {
    ensure(70);
    sectionLabel("Luggage", y);
    y -= 22;
    for (const [l, r] of lug) {
      ensure(30);
      text(l, M, y, { size: 11, color: SLATE });
      right(r, W - M, y, { size: 10, color: SOFT });
      y -= 12;
      hr(y);
      y -= 12;
    }
  }

  // ── Price summary ──────────────────────────────────────────────────────────
  {
    y -= 4;
    ensure(90);
    sectionLabel("Price summary", y);
    y -= 22;
    const sline = (
      label: string,
      val: string,
      o: { bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {},
    ) => {
      ensure(24);
      text(label, M, y, { size: o.bold ? 11 : 9.5, font: o.bold ? bold : font, color: o.bold ? NAVY : SOFT });
      right(val, W - M, y, { size: o.bold ? 14 : 10, font: o.bold ? bold : font, color: o.color ?? (o.bold ? NAVY : SLATE) });
      y -= o.gap ?? 16;
    };
    sline(`Tickets (${pricing.activePaxCount} pax)`, eur(pricing.ticketTotal));
    for (const ex of pricing.bookingExtras) sline(ex.description, eur(ex.amount));
    if (pricing.paxExtrasBreakdown.length > 0) {
      for (const ex of pricing.paxExtrasBreakdown) {
        sline(ex.count > 1 ? `${ex.label} (${ex.count})` : ex.label, eur(ex.amount));
      }
    } else if (pricing.paxExtrasTotal > 0) {
      sline("Seat & baggage extras", eur(pricing.paxExtrasTotal));
    }
    if (pricing.tax > 0) sline("Tax", eur(pricing.tax));
    if (pricing.discount > 0) sline("Discount", `- ${eur(pricing.discount)}`, { color: OK });
    y -= 4;
    hr(y);
    y -= 20;
    sline("TOTAL", eur(pricing.total), { bold: true, gap: 8 });
  }

  // ── Footer (në çdo faqe, me numërim) ───────────────────────────────────────
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 72 }, end: { x: W - M, y: 72 }, thickness: 1, color: HAIR });
    p.drawText(safe("For verification contact booking@albaniasky.com"), { x: M, y: 58, size: 8.5, font, color: GRAY });
    const lbl = `Page ${i + 1} of ${pages.length}`;
    p.drawText(lbl, { x: W - M - font.widthOfTextAtSize(lbl, 8.5), y: 58, size: 8.5, font, color: rgb(0.796, 0.835, 0.882) });
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export interface BatchInvoiceLineItem {
  bookingRef: string;
  customerName?: string | null;
  route?: string | null;
  amount: number;         // paid with THIS payment (Paid Today)
  prevPaid?: number | null; // paid before this payment
  method?: string | null;
  airline?: string | null;
  flightNumber?: string | null;
  departureDate?: string | null;
  total?: number | null;
  paid?: number | null;   // total paid incl. this payment (= prevPaid + amount)
  due?: number | null;
}

export interface BatchInvoiceInput {
  invoiceCode: string;
  date: Date;
  paymentDate: Date;
  method: string;
  reference?: string | null;
  agentName?: string | null;
  agentCompany?: string | null;
  agentEmail?: string | null;
  lineItems: BatchInvoiceLineItem[];
  total: number;
  creditAmount?: number | null;
}

// Batch (mass) payment invoice — one A4-landscape document with a proper table:
// one row per booking (#, Booking, Passenger, Route, Flight, Departure, Total,
// Prev. Paid, Paid Today, Balance), a "Total Paid Today" row and, when the
// payment exceeds the amount due, a green CREDIT NOTE box.
// Design chosen by the user: "Ledger Kompakt" (variant 3, canvas mockup).
export async function generateBatchInvoicePdf(input: BatchInvoiceInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = PAGE_W;
  const M = 40;
  let y = PAGE_H - 45;

  const INK = rgb(0.13, 0.13, 0.16);
  const AMBER = rgb(0.72, 0.45, 0.02);
  const RED = rgb(0.7, 0.2, 0.2);
  const HEADBG = BRAND;
  const ZEBRA = rgb(0.955, 0.96, 0.985);

  const text = (
    s: string, x: number, yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(safe(s), { x, y: yy, size: opts.size ?? 9, font: opts.font ?? font, color: opts.color ?? INK });
  };
  const right = (
    s: string, xRight: number, yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 9;
    text(s, xRight - f.widthOfTextAtSize(safe(s), size), yy, opts);
  };
  const clip = (s: string, max: number, size: number, f: PDFFont): string => {
    let v = safe(s);
    while (v.length > 1 && f.widthOfTextAtSize(v, size) > max) v = v.slice(0, -1);
    return v === safe(s) ? v : v.slice(0, -1) + "…";
  };
  const hr = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 1, color: LINE });

  // Column layout (left-aligned x for text cols, right-aligned edge for numbers)
  const cIdx = M + 4;          // "#"
  const cRef = M + 24;         // Booking ref
  const cPax = M + 105;        // Passenger / customer
  const cRoute = M + 245;      // Route
  const cFlight = M + 345;     // Flight
  const cDep = M + 470;        // Departure date
  const rTotal = M + 590;      // Total (right edge)
  const rPrev = M + 655;       // Prev. Paid (right edge)
  const rToday = M + 715;      // Paid Today (right edge)
  const rBal = W - M - 4;      // Balance (right edge)

  const drawTableHead = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 17, color: HEADBG });
    const h = { size: 7.5, font: bold, color: rgb(1, 1, 1) };
    text("#", cIdx, y, h);
    text("BOOKING", cRef, y, h);
    text("PASSENGER", cPax, y, h);
    text("ROUTE", cRoute, y, h);
    text("FLIGHT", cFlight, y, h);
    text("DEPARTURE", cDep, y, h);
    right("TOTAL", rTotal, y, h);
    right("PREV. PAID", rPrev, y, h);
    right("PAID TODAY", rToday, y, h);
    right("BALANCE", rBal, y, h);
    y -= 19;
  };

  // ── Header ───────────────────────────────────────────────────────────────
  text("Albania Sky", M, y, { size: 17, font: bold, color: BRAND });
  right("PAYMENT INVOICE", W - M, y, { size: 17, font: bold, color: BRAND });
  y -= 15;
  text("Flight Management System", M, y, { size: 8.5, color: MUTED });
  right(input.invoiceCode, W - M, y, { size: 9.5, font: bold });
  y -= 12;
  right(fmtDate(input.date), W - M, y, { size: 8.5, color: MUTED });
  y -= 12;
  hr(y);
  y -= 18;

  // ── Meta strip: method / reference / bookings count ───────────────────────
  text("PAYMENT METHOD", M, y, { size: 7, font: bold, color: MUTED });
  text("BOOKINGS", M + 170, y, { size: 7, font: bold, color: MUTED });
  if (input.reference) text("REFERENCE", M + 290, y, { size: 7, font: bold, color: MUTED });
  y -= 12;
  text(methodLabelPdf(input.method), M, y, { size: 10, font: bold });
  text(String(input.lineItems.length), M + 170, y, { size: 10, font: bold });
  if (input.reference) text(String(input.reference), M + 290, y, { size: 10, font: bold });
  y -= 16;
  text(`PAYMENT DATE: ${fmtPaymentDate(input.paymentDate)}`, M, y, { size: 9, color: MUTED });
  y -= 20;

  // ── Table ──────────────────────────────────────────────────────────────────
  drawTableHead();

  let i = 0;
  for (const li of input.lineItems) {
    if (y < 95) { // new page — redraw the table header
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 45;
      drawTableHead();
    }
    if (i % 2 === 1) {
      page.drawRectangle({ x: M, y: y - 4.5, width: W - 2 * M, height: 15, color: ZEBRA });
    }
    const prev = li.prevPaid != null ? Number(li.prevPaid) : null;
    const balance =
      li.due != null ? Number(li.due)
      : li.total != null ? Number(li.total) - (prev ?? 0) - Number(li.amount)
      : null;

    text(String(i + 1), cIdx, y, { size: 8, color: MUTED });
    text(clip(li.bookingRef, cPax - cRef - 8, 8.5, bold), cRef, y, { size: 8.5, font: bold, color: BRAND });
    text(clip((li.customerName ?? "—").toUpperCase(), cRoute - cPax - 8, 8, font), cPax, y, { size: 8 });
    text(clip(li.route ?? "—", cFlight - cRoute - 8, 8, font), cRoute, y, { size: 8 });
    const fl = [li.airline, li.flightNumber].filter(Boolean).join(" ") || "—";
    text(clip(fl, cDep - cFlight - 8, 8, font), cFlight, y, { size: 8 });
    text(clip(li.departureDate ?? "—", 70, 8, font), cDep, y, { size: 8 });
    right(eur(li.total), rTotal, y, { size: 8 });
    if (prev != null && prev > 0) {
      right(eur(prev), rPrev, y, { size: 8, color: AMBER });
    } else {
      right("—", rPrev, y, { size: 8, color: rgb(0.75, 0.77, 0.8) });
    }
    right(eur(li.amount), rToday, y, { size: 8.5, font: bold });
    if (balance != null) {
      right(eur(balance), rBal, y, { size: 8, font: balance > 0 ? bold : font, color: balance > 0 ? RED : OK });
    } else {
      right("—", rBal, y, { size: 8, color: rgb(0.75, 0.77, 0.8) });
    }
    y -= 15;
    i++;
  }

  // ── Total Paid Today row ───────────────────────────────────────────────────
  if (y < 110) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 45;
  }
  page.drawRectangle({ x: M, y: y - 5.5, width: W - 2 * M, height: 19, color: HEADBG });
  right("TOTAL PAID TODAY", rPrev, y, { size: 9, font: bold, color: rgb(1, 1, 1) });
  right(eur(input.total), rBal, y, { size: 10.5, font: bold, color: rgb(1, 1, 1) });
  y -= 30;

  // ── Credit note (green) — only when the payment exceeded the amount due ───
  if (input.creditAmount && input.creditAmount > 0) {
    const boxH = 40;
    page.drawRectangle({
      x: M, y: y - boxH + 12, width: W - 2 * M, height: boxH,
      color: rgb(0.925, 0.98, 0.94), borderColor: OK, borderWidth: 1,
    });
    text("CREDIT NOTE - OVERPAYMENT", M + 12, y - 2, { size: 8.5, font: bold, color: OK });
    text(
      `Amount received (${eur(input.total + input.creditAmount)}) exceeds the total due (${eur(input.total)}). The difference has been credited to the agency account.`,
      M + 12, y - 15, { size: 8, color: rgb(0.05, 0.4, 0.2) },
    );
    right(`+ ${eur(input.creditAmount)}`, W - M - 12, y - 9, { size: 13, font: bold, color: OK });
    y -= boxH + 8;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const lastPage = doc.getPages()[doc.getPageCount() - 1];
  lastPage.drawText(safe("This invoice was generated automatically by Albania Sky."), { x: M, y: 42, size: 7.5, font, color: MUTED });
  lastPage.drawText(safe(`Unique invoice code: ${input.invoiceCode}`), { x: M, y: 31, size: 7.5, font, color: MUTED });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
