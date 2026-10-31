// Email — via nodemailer SMTP (standard, works on any VPS)
import nodemailer from "nodemailer";
import { reportOperationalFailure } from "./operationalFailures.js";
import { failedEmails, type RetryEmail } from "./failedEmail.js";
import { computeVoucherPricing } from "./voucherPricing.js";
import { fmtAmPm } from "./timeFormat.js";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 90_000,
  });
}

interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  mimeType?: string;
}

/** SMTP only. The recovery path uses this to avoid creating another failure alert. */
export async function deliverEmail(payload: RetryEmail): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) {
    const error = new Error("SMTP not configured");
    Object.assign(error, { code: "SMTP_NOT_CONFIGURED" });
    throw error;
  }
  try {
    const result = await transporter.sendMail({
      from: process.env.GMAIL_FROM || process.env.SMTP_USER || "Albania Sky <noreply>",
      to: payload.to, subject: payload.subject, html: payload.htmlBody,
      attachments: payload.attachments?.map(a => ({ filename: a.filename, content: a.content, contentType: a.mimeType ?? "text/csv" })),
    });
    if (result.rejected?.length) {
      const error = new Error("Serveri i email-it refuzoi një ose më shumë marrës.");
      Object.assign(error, { code: "EENVELOPE", retryTo: result.rejected.map((r: any) => typeof r === "string" ? r : r.address).join(", ") });
      throw error;
    }
  } finally { transporter.close(); }
}

async function sendEmailInternal(
  to: string,
  subject: string,
  htmlBody: string,
  attachments: EmailAttachment[] | undefined,
  throwOnFailure: boolean,
): Promise<void> {
  try {
    await deliverEmail({ to, subject, htmlBody, attachments });
  } catch (err) {
    console.error("[email] sendEmail failed:", err);
    try {
      await failedEmails.record({ to, subject, htmlBody, attachments }, err);
    } catch (recordError) {
      // Do not recursively send an email about failure to preserve an email.
      console.error("[email] recovery copy failed:", recordError);
      await reportOperationalFailure("smtp", `Dërgimi i email-it "${subject}" te ${to} (kopja e ridërgimit nuk u ruajt)`, err, false);
    }
    if (throwOnFailure) throw err;
  }
}

export async function sendEmail(to: string, subject: string, htmlBody: string, attachments?: EmailAttachment[]): Promise<void> {
  return sendEmailInternal(to, subject, htmlBody, attachments, false);
}

/** Variant që raporton dështimin te thirrësi; përdoret kur gjendja e DB varet nga dorëzimi. */
export async function sendEmailStrict(to: string, subject: string, htmlBody: string, attachments?: EmailAttachment[]): Promise<void> {
  return sendEmailInternal(to, subject, htmlBody, attachments, true);
}

// ------- Helpers -------

const CHANGED_BG = "#fff3cd";
const CHANGED_BORDER = "#f59e0b";
const CHANGED_LABEL_COLOR = "#92400e";
const CHANGED_VALUE_COLOR = "#b45309";
const CHANGED_TAG = `<span style="display:inline-block;background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:6px;vertical-align:middle;letter-spacing:.04em">NDRYSHUAR</span>`;

const statusLabels: Record<string, string> = {
  draft: "HOLD",
  pending: "PRITJE",
  confirmed: "KONFIRMUAR",
  ticketed: "BILETE LESHUAR",
  cancelled: "ANULUAR",
};

const statusColors: Record<string, string> = {
  draft: "#ca8a04",
  pending: "#ea580c",
  confirmed: "#2563eb",
  ticketed: "#16a34a",
  cancelled: "#dc2626",
};

const methodLabels: Record<string, string> = {
  cash: "Para ne dore",
  bank_transfer: "Transferte bankare",
  card: "Karte",
  online: "Online",
  credit: "Kredit Agjencie",
};

const typeLabels: Record<string, string> = {
  adult: "I rritur",
  child: "Femije",
  infant: "Foshnye",
};

function fmt(n: any): string {
  return String(Math.round(Number(n ?? 0)));
}

// Whole-euro formatter (no decimals) — used for booking prices in notification emails
function fmtWhole(n: any): string {
  return String(Math.round(Number(n ?? 0)));
}

function fmtDate(d: any): string {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("sq-AL", { day: "2-digit", month: "short", year: "numeric" }); } catch { return String(d); }
}

const SUBJECT_MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SUBJECT_MONTHS_SQ = ["Janar","Shkurt","Mars","Prill","Maj","Qershor","Korrik","Gusht","Shtator","Tetor","Nentor","Dhjetor"];

// CitizenPlane (white-label) reference for ONLINE TRAVEL bookings. The CP code is
// stored inside notes as "[CP:XXXX]". Returns null for non ONLINE-TRAVEL bookings.
export function cpRefOf(booking: any): string | null {
  const isOnlineTravel = String(booking?.agentName ?? "").toUpperCase().includes("ONLINE TRAVEL");
  if (!isOnlineTravel) return null;
  const m = String(booking?.notes ?? "").match(/\[CP:([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

// Builds compact ops-style subject: "<label> <N> PAX <FROM> <TO> <DD> <Month>"
// e.g. "New Booking 2 PAX DTM TIA 15 July" / "Rezervim i Ri 2 PAX DTM TIA 15 Korrik"
export function bookingSubject(label: string, booking: any, lang: "sq" | "en"): string {
  const pax = Array.isArray(booking?.passengers) ? booking.passengers.length : 0;
  const flight = booking?.flight ?? {};
  const from = (flight.fromCity ?? "").toString().trim();
  const to = (flight.toCity ?? "").toString().trim();
  let dateStr = "";
  const m = String(flight.departureDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const day = parseInt(m[3], 10);
    const month = (lang === "sq" ? SUBJECT_MONTHS_SQ : SUBJECT_MONTHS_EN)[parseInt(m[2], 10) - 1];
    if (month) dateStr = `${day} ${month}`;
  }
  const ref = (booking?.bookingRef ?? "").toString().trim();
  // Booking total (no decimals when whole, else 2dp), e.g. "€204" / "€204.50".
  const totalNum = Number(booking?.totalAmount);
  let totalStr = "";
  if (Number.isFinite(totalNum) && totalNum > 0) {
     totalStr = `€${Math.round(totalNum)}`;
  }
  const base = [label, pax > 0 ? `${pax} PAX` : "", from, to, dateStr, totalStr].filter(Boolean).join(" ");
  const withRef = ref ? `${base} [${ref}]` : base;
  // CP bookings (ONLINE TRAVEL): include the CitizenPlane reference in the subject.
  // The CP code already carries its own "CP" prefix (e.g. "CPZP55WZ"), so we add
  // NO literal "CP" — just the code inside spaced brackets, e.g. "... [ CPZP55WZ ]".
  const cp = cpRefOf(booking);
  return cp ? `${withRef} [ ${cp} ]` : withRef;
}

function fmtDateTime(d: any): string {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    // Data mbetet si më parë; ora shfaqet 12-orëshe me AM/PM.
    return `${dt.toLocaleDateString("sq-AL", { day: "2-digit", month: "short", year: "numeric" })}, ` +
      `${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  } catch { return String(d); }
}

function row(label: string, value: string, changed = false): string {
  if (changed) {
    return `<tr style="background:${CHANGED_BG};border-left:4px solid ${CHANGED_BORDER}">
      <td style="padding:9px 12px 9px 10px;color:${CHANGED_LABEL_COLOR};font-size:13px;white-space:nowrap;vertical-align:top;width:160px;font-weight:600">${label}</td>
      <td style="padding:9px 0 9px 2px;font-size:13px;font-weight:700;color:${CHANGED_VALUE_COLOR}">${value || "-"}&nbsp;${CHANGED_TAG}</td>
    </tr>`;
  }
  return `<tr>
    <td style="padding:7px 12px 7px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;width:160px">${label}</td>
    <td style="padding:7px 0;font-size:13px;">${value || "-"}</td>
  </tr>`;
}

function priceCell(label: string, value: string, color: string, changed = false, note = ""): string {
  const borderStyle = changed ? `border:3px solid ${CHANGED_BORDER};background:${CHANGED_BG};` : "border:1px solid #e2e8f0;background:#fff;";
  return `<td style="text-align:center;padding:12px 8px;${borderStyle}border-radius:6px;position:relative">
    <div style="font-size:11px;color:${changed ? CHANGED_LABEL_COLOR : "#64748b"};margin-bottom:4px;font-weight:${changed ? "700" : "400"};text-transform:uppercase;letter-spacing:.06em">${label}${changed ? `&nbsp;<span style="background:#dc2626;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:2px;vertical-align:middle">!</span>` : ""}</div>
    <div style="font-size:22px;font-weight:700;color:${changed ? CHANGED_VALUE_COLOR : color}">${value}</div>
    ${note ? `<div style="font-size:11px;color:${changed ? CHANGED_VALUE_COLOR : "#6b7280"};margin-top:2px">${note}</div>` : ""}
  </td>`;
}

function section(title: string, content: string, accentColor = "#1e3a5f"): string {
  return `
  <div style="margin-bottom:20px">
    <div style="background:${accentColor};border-radius:6px 6px 0 0;padding:8px 14px">
      <span style="color:#fff;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">${title}</span>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 6px 6px;overflow:hidden;background:#fff">
      ${content}
    </div>
  </div>`;
}

// ------- Full Booking Email -------

export function bookingFullEmail(
  booking: any,
  eventLabel: string,
  highlightBox?: { color: string; text: string },
  changedFields?: Set<string>
): string {
  const ch = changedFields ?? new Set<string>();

  const status = booking.status ?? "draft";
  const statusColor = statusColors[status] ?? "#6b7280";
  const statusLabel = statusLabels[status] ?? status.toUpperCase();
  const statusChanged = ch.has("status");

  const totalAmount = Number(booking.totalAmount ?? 0);
  const paidAmount = Number(booking.paidAmount ?? 0);
  const dueAmount = Number(booking.dueAmount ?? 0);
  const netPrice = booking.netPrice != null ? Number(booking.netPrice) : null;
  const commissionAmount = booking.commissionAmount != null ? Number(booking.commissionAmount) : null;
  const flight = booking.flight ?? {};
  const passengers: any[] = booking.passengers ?? [];
  const extras: any[] = booking.extras ?? [];
  const payments: any[] = booking.payments ?? [];

  // ---- Highlight box (event callout) ----
  const highlightHtml = highlightBox
    ? `<div style="background:${highlightBox.color}18;border:2px solid ${highlightBox.color};border-radius:6px;padding:10px 14px;font-size:13px;color:${highlightBox.color};font-weight:700;margin-bottom:18px">${highlightBox.text}</div>`
    : "";

  // ---- Changed fields summary strip ----
  const fieldDisplayNames: Record<string, string> = {
    totalAmount: "Cmimi i Shitjes",
    netPrice: "Cmimi Neto",
    pnr: "PNR",
    status: "Statusi",
    customerName: "Emri i Klientit",
    customerPhone: "Telefon Klienti",
  };
  const changedSummary = ch.size > 0
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:9px 14px;font-size:12px;color:#78350f;margin-bottom:14px">
        <strong>Fushat e ndryshuara:</strong>&nbsp;
        ${[...ch].map(f => `<span style="background:#dc2626;color:#fff;padding:2px 7px;border-radius:3px;font-weight:700;font-size:11px;margin-right:4px">${fieldDisplayNames[f] ?? f}</span>`).join(" ")}
      </div>`
    : "";

  // ---- Header ----
  const header = `
  <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px 8px 0 0">
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="vertical-align:middle">
        <div style="color:#93c5fd;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">FMS Pro · Rezervim</div>
        <div style="color:#fff;font-size:22px;font-weight:700;margin-top:4px;letter-spacing:.02em">${booking.bookingRef ?? "-"}</div>
        <div style="color:#cbd5e1;font-size:12px;margin-top:2px">Krijuar ${fmtDateTime(booking.createdAt)}</div>
      </td>
      <td style="text-align:right;vertical-align:middle">
        <span style="background:${statusColor};color:#fff;font-size:11px;font-weight:700;padding:5px 12px;border-radius:20px;letter-spacing:.06em;${statusChanged ? "outline:3px solid #fbbf24;" : ""}">${statusLabel}${statusChanged ? " !" : ""}</span>
        ${booking.pnr ? `<div style="color:${ch.has("pnr") ? "#fbbf24" : "#fbbf24"};font-size:14px;font-weight:700;font-family:monospace;margin-top:8px;letter-spacing:.12em${ch.has("pnr") ? ";text-decoration:underline;text-underline-offset:3px" : ""}">PNR: ${booking.pnr}${ch.has("pnr") ? " !" : ""}</div>` : ""}
      </td>
    </tr></table>
  </div>`;

  // ---- Event label strip ----
  const eventStrip = `<div style="background:#f1f5f9;padding:8px 24px;font-size:12px;color:#475569;font-weight:600;border-bottom:1px solid #e2e8f0">${eventLabel}</div>`;

  // ---- Customer section ----
  // ONLINE TRAVEL është kanal white-label: emrin e agjensisë NUK e shfaqim te emaili.
  const hideAgencyName = String(booking.agentName ?? "").toUpperCase().includes("ONLINE TRAVEL");
  const cpRef = cpRefOf(booking);
  const customerContent = `<table style="border-collapse:collapse;width:100%;padding:4px">
    ${row("Klienti", `<strong>${booking.customerName ?? "-"}</strong>`, ch.has("customerName"))}
    ${row("Telefon", booking.customerPhone ?? "-", ch.has("customerPhone"))}
    ${booking.agentName && !hideAgencyName ? row("Agjencia", booking.agentName) : ""}
    ${cpRef ? row("CP Reference", `<strong>${cpRef}</strong>`) : ""}
  </table>`;

  // ---- Flight section ----
  const flightContent = `<table style="border-collapse:collapse;width:100%;padding:4px">
    ${row("Fluturimi", `<strong>${flight.airline ?? ""} ${flight.flightNumber ?? ""}</strong>`)}
    ${row("Rruga", `<strong>${flight.fromCity ?? "-"} &rarr; ${flight.toCity ?? "-"}</strong>`)}
    ${row("Nisja", `${fmtDate(flight.departureDate)}${flight.departureTime ? " &nbsp;&nbsp;" + fmtAmPm(flight.departureTime) : ""}`)}
    ${flight.arrivalDate ? row("Mberritja", `${fmtDate(flight.arrivalDate)}${flight.arrivalTime ? " &nbsp;&nbsp;" + fmtAmPm(flight.arrivalTime) : ""}`) : ""}
    ${flight.cabinClass ? row("Klasa", flight.cabinClass) : ""}
  </table>`;

  // ---- Prices section ----
  const commNote = commissionAmount != null && totalAmount > 0
    ? `${((commissionAmount / totalAmount) * 100).toFixed(1)}% marzh`
    : "";
  const pricesContent = `<table style="width:100%;border-collapse:separate;border-spacing:6px;padding:8px">
    <tr>
      ${priceCell("Cmimi i Shitjes", `&euro;${fmtWhole(totalAmount)}`, "#1e3a5f", ch.has("totalAmount"))}
      ${priceCell("Cmimi Neto", netPrice != null ? `&euro;${fmtWhole(netPrice)}` : `<span style="color:#9ca3af">&#8212;</span>`, "#374151", ch.has("netPrice"))}
      ${priceCell("Komisioni", commissionAmount != null ? `&euro;${fmtWhole(commissionAmount)}` : `<span style="color:#9ca3af">&#8212;</span>`, commissionAmount != null && commissionAmount >= 0 ? "#16a34a" : "#dc2626", ch.has("netPrice") || ch.has("totalAmount"), commNote)}
    </tr>
  </table>`;

  // ---- Payment summary ----
  const paymentSummary = `
  <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #e2e8f0">
    <tr>
      <td style="width:33%;text-align:center;padding:12px;border-right:1px solid #e2e8f0">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Totali</div>
        <div style="font-size:20px;font-weight:700;color:#1e3a5f">&euro;${fmtWhole(totalAmount)}</div>
      </td>
      <td style="width:33%;text-align:center;padding:12px;border-right:1px solid #e2e8f0">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Paguar</div>
        <div style="font-size:20px;font-weight:700;color:#16a34a">&euro;${fmtWhole(paidAmount)}</div>
      </td>
      <td style="width:33%;text-align:center;padding:12px">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Mbetet</div>
        <div style="font-size:20px;font-weight:700;color:${dueAmount > 0 ? "#dc2626" : "#6b7280"}">&euro;${fmtWhole(dueAmount)}</div>
      </td>
    </tr>
  </table>`;

  // ---- Payment history table ----
  const paymentRows = payments.length === 0
    ? `<tr><td colspan="5" style="padding:14px;text-align:center;color:#9ca3af;font-size:13px">Nuk ka pagesa</td></tr>`
    : payments.map((p: any) => {
        const isRefund = p.isRefund;
        const mLabel = isRefund ? "Rimbursim" : (methodLabels[p.method] ?? p.method);
        return `<tr style="border-bottom:1px solid #f1f5f9;${isRefund ? "background:#fef2f2;" : ""}">
          <td style="padding:7px 8px;font-size:12px;color:#374151">${fmtDateTime(p.createdAt)}</td>
          <td style="padding:7px 8px;font-size:12px;font-weight:600;color:${isRefund ? "#dc2626" : "#374151"}">${mLabel}</td>
          <td style="padding:7px 8px;font-size:12px;color:#374151">
            ${p.reference ? `<div>${p.reference}</div>` : ""}
            ${p.notes ? `<div style="color:#6b7280;font-size:11px">${p.notes}</div>` : ""}
            ${!p.reference && !p.notes ? "-" : ""}
          </td>
          <td style="padding:7px 8px;font-size:13px;font-weight:700;color:${isRefund ? "#dc2626" : "#16a34a"};text-align:right">${isRefund ? "-" : "+"}${fmtWhole(p.amount)}</td>
          <td style="padding:7px 8px;font-size:11px;color:#6b7280;text-align:center">${p.status ?? ""}</td>
        </tr>`;
      }).join("");

  const paymentTableHtml = `
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Data</th>
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Metoda</th>
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Referenca / Shenime</th>
        <th style="padding:7px 8px;text-align:right;color:#64748b;font-weight:600">Shuma (&euro;)</th>
        <th style="padding:7px 8px;text-align:center;color:#64748b;font-weight:600">Statusi</th>
      </tr>
    </thead>
    <tbody>${paymentRows}</tbody>
  </table>`;

  const paymentsContent = paymentSummary + paymentTableHtml;

  // ---- Passengers ----
  const paxRows = passengers.length === 0
    ? `<tr><td colspan="7" style="padding:14px;text-align:center;color:#9ca3af;font-size:13px">Nuk ka pasagjere</td></tr>`
    : passengers.map((p: any, i: number) => {
        // Per-passenger extras with their corresponding prices (looked up from the flight)
        const extraItems: string[] = [];
        if (p.baggageOption === "checked") {
          const bp = flight.checkedBaggagePrice;
          extraItems.push(`Bagazh${bp != null && Number(bp) > 0 ? ` &euro;${fmtWhole(bp)}` : ""}`);
        } else if (p.baggageOption === "cabin") {
          extraItems.push("Bagazh kabine");
        }
        if (p.hasSeatSelection) {
          const sp = flight.seatSelectionPrice;
          extraItems.push(`Ulese${sp != null && Number(sp) > 0 ? ` &euro;${fmtWhole(sp)}` : ""}`);
        }
        if (p.hasPriorityBoarding) {
          const pp = flight.priorityBoardingPrice;
          extraItems.push(`Prioritet${pp != null && Number(pp) > 0 ? ` &euro;${fmtWhole(pp)}` : ""}`);
        }
        if (p.hasInsurance) {
          const ip = flight.insurancePrice;
          extraItems.push(`Sigurim${ip != null && Number(ip) > 0 ? ` &euro;${fmtWhole(ip)}` : ""}`);
        }
        const extras_list = extraItems.length
          ? extraItems.map(e => `<span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 6px;margin:1px 2px;font-size:11px;color:#374151;white-space:nowrap">${e}</span>`).join("")
          : "-";
        const basePrice = p.type === "infant" ? flight.infantPrice
          : p.type === "child" ? flight.childPrice
          : flight.adultPrice;
        const paxPriceVal = p.ticketPrice != null ? p.ticketPrice : basePrice;
        const paxPrice = paxPriceVal != null
          ? `&euro;${fmtWhole(paxPriceVal)}`
          : `<span style="color:#9ca3af">&#8212;</span>`;
        return `<tr style="border-bottom:1px solid #f1f5f9;${i % 2 === 1 ? "background:#fafafa;" : ""}">
          <td style="padding:7px 8px;font-size:13px;font-weight:600;color:#1e3a5f">${p.firstName ?? ""} ${p.lastName ?? ""}</td>
          <td style="padding:7px 8px;font-size:12px;color:#374151">${typeLabels[p.type] ?? p.type}</td>
          <td style="padding:7px 8px;font-size:13px;font-weight:700;color:#1e3a5f;text-align:right;white-space:nowrap">${paxPrice}</td>
          <td style="padding:7px 8px;font-size:12px;color:#374151">${p.seatNumber || "-"}</td>
          <td style="padding:7px 8px;font-size:12px;color:#374151">
            ${p.passportNumber ? `<div>${p.passportNumber}</div>` : "-"}
            ${p.passportExpiry ? `<div style="font-size:11px;color:#6b7280">Skadon: ${fmtDate(p.passportExpiry)}</div>` : ""}
          </td>
          <td style="padding:7px 8px;font-size:12px;color:#374151">${p.nationality || "-"}</td>
          <td style="padding:7px 8px;font-size:12px;color:#374151">${extras_list}</td>
        </tr>`;
      }).join("");

  const passengersContent = `
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Emri</th>
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Tipi</th>
        <th style="padding:7px 8px;text-align:right;color:#64748b;font-weight:600">Cmimi</th>
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Ulese</th>
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Pasaporta</th>
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Shtetersia</th>
        <th style="padding:7px 8px;text-align:left;color:#64748b;font-weight:600">Shtesa</th>
      </tr>
    </thead>
    <tbody>${paxRows}</tbody>
  </table>`;

  // ---- Extras ----
  const extrasContent = extras.length === 0
    ? `<div style="color:#9ca3af;font-size:13px;text-align:center;padding:10px">Nuk ka shtojca</div>`
    : extras.map((ex: any) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px">
        <span style="color:#374151">${ex.description}</span>
        <span style="font-weight:700;color:#1e3a5f">&euro;${fmtWhole(ex.amount)}</span>
      </div>`).join("") + `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8fafc;font-size:13px;font-weight:700">
        <span style="color:#374151">Total Shtojca</span>
        <span style="color:#1e3a5f">&euro;${fmtWhole(extras.reduce((s: number, e: any) => s + Number(e.amount), 0))}</span>
      </div>`;

  // ---- Assemble ----
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:680px;margin:auto">
  ${header}
  ${eventStrip}
  <div style="padding:18px 18px 4px">
    ${highlightHtml}
    ${changedSummary}
    ${section("Informacion Klienti", customerContent)}
    ${section("Informacion Fluturimi", flightContent, "#0f4c81")}
    ${section("PNR · Cmimet · Komisioni", pricesContent, "#164e63")}
    ${section("Pagesat", paymentsContent, "#065f46")}
    ${section("Pasagjerete (" + passengers.length + ")", passengersContent, "#3b0764")}
    ${extras.length > 0 ? section("Shtojcat Pasagjereve", extrasContent, "#78350f") : ""}
  </div>
  <div style="text-align:center;padding:12px;font-size:11px;color:#94a3b8">
    FMS Pro &nbsp;&middot;&nbsp; ${new Date().toLocaleDateString("sq-AL")}, ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
  </div>
</div>
</body>
</html>`;
}

// ------- Public wrappers -------

export function bookingCreatedEmail(booking: any): string {
  return bookingFullEmail(
    booking,
    "Rezervim i Ri",
    { color: "#2563eb", text: "Rezervim i ri u krijua ne sistem." }
  );
}

export function bookingUpdatedEmail(
  booking: any,
  changedFields: string[],
  oldValues?: Record<string, any>
): string {
  const ch = new Set(changedFields);

  const statusLabelsMap: Record<string, string> = {
    draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar",
    ticketed: "Bilete Leshuar", cancelled: "Anuluar",
  };

  const statusOnlyEvents: Record<string, { color: string; text: string }> = {
    confirmed: { color: "#2563eb", text: "Rezervimi u <strong>KONFIRMUA</strong>." },
    ticketed:  { color: "#16a34a", text: "Biletat u <strong>leshuan</strong> per kete rezervim." },
    cancelled: { color: "#dc2626", text: "Rezervimi u <strong>ANULUA</strong>." },
  };

  // Build per-field "para → pas" descriptions
  const descriptions: string[] = [];

  for (const field of changedFields) {
    const oldVal = oldValues?.[field];
    const newVal = (booking as any)[field];

    if (field === "totalAmount") {
      const oldF = oldVal != null ? `&euro;${fmtWhole(oldVal)}` : "—";
      const newF = newVal != null ? `&euro;${fmtWhole(newVal)}` : "—";
      descriptions.push(`<strong>Cmimi i Shitjes:</strong> <span style="color:#6b7280">${oldF}</span> &rarr; <strong style="color:#dc2626">${newF}</strong>`);
    } else if (field === "netPrice") {
      const oldF = oldVal != null ? `&euro;${fmtWhole(oldVal)}` : "—";
      const newF = newVal != null ? `&euro;${fmtWhole(newVal)}` : "—";
      descriptions.push(`<strong>Cmimi Neto:</strong> <span style="color:#6b7280">${oldF}</span> &rarr; <strong style="color:#dc2626">${newF}</strong>`);
    } else if (field === "pnr") {
      const oldF = oldVal || "—";
      const newF = newVal || "—";
      descriptions.push(`<strong>PNR:</strong> <span style="color:#6b7280;font-family:monospace">${oldF}</span> &rarr; <strong style="color:#dc2626;font-family:monospace">${newF}</strong>`);
    } else if (field === "status") {
      const oldF = statusLabelsMap[oldVal] ?? oldVal ?? "—";
      const newF = statusLabelsMap[newVal] ?? newVal ?? "—";
      descriptions.push(`<strong>Statusi:</strong> <span style="color:#6b7280">${oldF}</span> &rarr; <strong style="color:#dc2626">${newF}</strong>`);
    } else if (field === "customerName") {
      descriptions.push(`<strong>Emri:</strong> <span style="color:#6b7280">${oldVal || "—"}</span> &rarr; <strong style="color:#dc2626">${newVal || "—"}</strong>`);
    } else if (field === "customerPhone") {
      descriptions.push(`<strong>Telefon:</strong> <span style="color:#6b7280">${oldVal || "—"}</span> &rarr; <strong style="color:#dc2626">${newVal || "—"}</strong>`);
    }
  }

  let highlight: { color: string; text: string };

  // Status-only change: use dedicated message
  if (ch.has("status") && ch.size === 1 && statusOnlyEvents[booking.status]) {
    highlight = statusOnlyEvents[booking.status];
  } else if (descriptions.length > 0) {
    // Show before → after for each changed field
    highlight = {
      color: "#b45309",
      text: descriptions.join("<br>"),
    };
  } else {
    highlight = { color: "#ca8a04", text: "Te dhenat e rezervimit u perditesuan." };
  }

  return bookingFullEmail(booking, "Ndryshim Rezervimi", highlight, ch);
}

export function paymentEmail(
  booking: any,
  payment: { amount: number; method: string; reference?: string; notes?: string; isRefund?: boolean }
): string {
  const isRefund = payment.isRefund;
  const mLabel = methodLabels[payment.method] ?? payment.method;

  const highlightText = isRefund
     ? `Rimbursim i procesuar: <strong>-&euro;${fmtWhole(payment.amount)}</strong> &nbsp;&middot;&nbsp; ${mLabel}${payment.notes ? " &nbsp;&middot;&nbsp; " + payment.notes : ""}`
     : `Pagese e re e regjistruar: <strong>+&euro;${fmtWhole(payment.amount)}</strong> &nbsp;&middot;&nbsp; ${mLabel}${payment.reference ? " &nbsp;&middot;&nbsp; Ref: " + payment.reference : ""}`;

  return bookingFullEmail(
    booking,
    isRefund ? "Rimbursim" : "Pagese e Re",
    { color: isRefund ? "#dc2626" : "#16a34a", text: highlightText }
  );
}

// ------- Passenger Changed Email -------

const paxFieldLabels: Record<string, string> = {
  firstName: "Emri",
  lastName: "Mbiemri",
  type: "Tipi",
  dateOfBirth: "Data e Lindjes",
  nationality: "Shtetersia",
  passportNumber: "Nr. Pasaportes",
  passportExpiry: "Skadenca Pasaportes",
  seatNumber: "Ulese",
  baggageOption: "Bagazhi",
  hasSeatSelection: "Zgjedhja Uleses",
  hasPriorityBoarding: "Boarding Prioritar",
  hasInsurance: "Sigurim",
};

const paxTypeLabels: Record<string, string> = {
  adult: "I rritur", child: "Femije", infant: "Foshnye",
};

const baggageLabels: Record<string, string> = {
  none: "Pa bagazh", cabin: "Kabine", checked: "Bagazh i kontrolluar",
};

function formatPaxValue(field: string, val: any): string {
  if (val === null || val === undefined || val === "") return "—";
  if (field === "type") return paxTypeLabels[val] ?? val;
  if (field === "baggageOption") return baggageLabels[val] ?? val;
  if (field === "hasSeatSelection" || field === "hasPriorityBoarding" || field === "hasInsurance") {
    return val ? "Po" : "Jo";
  }
  if (field === "dateOfBirth" || field === "passportExpiry") return fmtDate(val);
  return String(val);
}

export function passengerChangedEmail(
  booking: any,
  oldPax: Record<string, any>,
  newPax: Record<string, any>,
  changedFields: string[]
): string {
  const paxName = `${newPax.firstName ?? ""} ${newPax.lastName ?? ""}`.trim();

  const descriptions = changedFields
    .filter(f => f in paxFieldLabels)
    .map(f => {
      const label = paxFieldLabels[f];
      const oldV = formatPaxValue(f, oldPax[f]);
      const newV = formatPaxValue(f, newPax[f]);
      return `<strong>${label}:</strong> <span style="color:#6b7280">${oldV}</span> &rarr; <strong style="color:#dc2626">${newV}</strong>`;
    });

  const highlightText = `<strong>Pasagjeri:</strong> ${paxName}<br>${descriptions.join("<br>")}`;

  return bookingFullEmail(
    booking,
    "Ndryshim Pasagjeri",
    { color: "#7c3aed", text: highlightText },
    new Set(["passengers"])
  );
}

// ------- Extra Changed Email -------

export function extraChangedEmail(
  booking: any,
  extra: { description: string; amount: number },
  action: "added" | "removed",
  oldTotal: number,
  newTotal: number
): string {
  const isAdded = action === "added";
  const highlightText = isAdded
    ? `Shtojce e re: <strong>${extra.description}</strong> &nbsp;&mdash;&nbsp; <strong style="color:#16a34a">+&euro;${fmtWhole(extra.amount)}</strong><br>Cmimi total: <span style="color:#6b7280">&euro;${fmtWhole(oldTotal)}</span> &rarr; <strong style="color:#dc2626">&euro;${fmtWhole(newTotal)}</strong>`
    : `Shtojce e fshire: <strong>${extra.description}</strong> &nbsp;&mdash;&nbsp; <strong style="color:#dc2626">-&euro;${fmtWhole(extra.amount)}</strong><br>Cmimi total: <span style="color:#6b7280">&euro;${fmtWhole(oldTotal)}</span> &rarr; <strong style="color:#16a34a">&euro;${fmtWhole(newTotal)}</strong>`;

  return bookingFullEmail(
    booking,
    isAdded ? "Shtojce e Re" : "Shtojce e Fshire",
    { color: isAdded ? "#047857" : "#dc2626", text: highlightText }
  );
}

// ------- Price Sync Email -------

export interface PriceSyncRow {
  id: number;
  route: string;
  flightNumber?: string;
  departureDate?: string;
  oldGooglePrice?: number | null;
  googlePrice: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  status: string;
}

export function priceSyncEmail(
  results: PriceSyncRow[],
  triggeredBy: string
): string {
  const updated  = results.filter(r => r.status === "updated" || r.status === "fallback_applied");
  const skipped  = results.filter(r => r.status.startsWith("skipped"));
  const notFound = results.filter(r => r.status === "not_found");
  const nowD = new Date();
  const now = `${nowD.toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane", dateStyle: "full" })}, ${nowD.toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true })}`;

  const updatedRows = updated.map(r => {
    const diff = r.newPrice !== null && r.oldPrice !== null ? r.newPrice - r.oldPrice : 0;
    const diffColor = diff <= 0 ? "#16a34a" : "#dc2626";
    const diffSign  = diff <= 0 ? "▼" : "▲";
    const diffText  = `${diffSign} €${fmtWhole(Math.abs(diff))}`;
    const isFallback = r.status === "fallback_applied";
    return `
      <tr style="border-bottom:1px solid #e5e7eb${isFallback ? ";background:#fff7ed" : ""}">
        <td style="padding:10px 12px;font-weight:600;color:#1e293b">${r.route}${isFallback ? ' <span style="font-size:10px;background:#f97316;color:#fff;border-radius:4px;padding:1px 5px;margin-left:4px">ÇMIM FIKS</span>' : ""}</td>
        <td style="padding:10px 12px;color:#64748b;font-size:13px">${r.flightNumber || "—"}</td>
        <td style="padding:10px 12px;color:#64748b;font-size:13px">${r.departureDate || "—"}</td>
        <td style="padding:10px 12px;text-align:right;text-decoration:line-through;color:#94a3b8">${r.oldGooglePrice != null ? `€${fmtWhole(r.oldGooglePrice)}` : "—"}</td>
        <td style="padding:10px 12px;text-align:right;color:#64748b">€${fmtWhole(r.googlePrice ?? 0)}</td>
        <td style="padding:10px 12px;text-align:right;text-decoration:line-through;color:#94a3b8">€${fmtWhole(r.oldPrice ?? 0)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:#1e293b">€${fmtWhole(r.newPrice ?? 0)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:600;color:${diffColor}">${diffText}</td>
      </tr>`;
  }).join("");

  const skippedRows = skipped.length ? `
    <div style="margin-top:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#64748b">Anashkaluar (${skipped.length})</p>
      ${skipped.map(r => `<div style="font-size:12px;color:#94a3b8;padding:2px 0">${r.route} — Google: €${fmtWhole(r.googlePrice ?? 0)} — ${r.status === "skipped_minimum" ? "Nën minimum" : "Nën pragun MBI/ABOVE"}</div>`).join("")}
    </div>` : "";

  const notFoundRows = notFound.length ? `
    <div style="margin-top:12px;background:#fff8f8;border:1px solid #fecaca;border-radius:8px;padding:14px 16px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#dc2626">Pa rezultat nga Google Flights (${notFound.length})</p>
      ${notFound.map(r => `<div style="font-size:12px;color:#ef4444;padding:2px 0">${r.route}</div>`).join("")}
    </div>` : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:760px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 32px">
      <div style="color:#94a3b8;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Kings Travel · Albania Sky</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">✈ Sinkronizimi i Çmimeve</h1>
      <div style="color:#7dd3fc;font-size:13px;margin-top:6px">${now} &nbsp;·&nbsp; Aktivizuar nga: <strong>${triggeredBy}</strong></div>
    </div>

    <div style="padding:24px 32px">
      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#16a34a">${updated.length}</div>
          <div style="font-size:12px;color:#166534;font-weight:600;margin-top:2px">U Ndryshuan</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#d97706">${skipped.length}</div>
          <div style="font-size:12px;color:#92400e;font-weight:600;margin-top:2px">Anashkaluar</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#dc2626">${notFound.length}</div>
          <div style="font-size:12px;color:#991b1b;font-weight:600;margin-top:2px">Pa Rezultat</div>
        </div>
        <div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#1e293b">${results.length}</div>
          <div style="font-size:12px;color:#64748b;font-weight:600;margin-top:2px">Gjithsej</div>
        </div>
      </div>

      ${updated.length > 0 ? `
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;border-left:4px solid #16a34a;padding-left:10px">Fluturimet e Ndryshura (${updated.length})</h2>
      <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb">
              <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Rruga</th>
              <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Fluturimi</th>
              <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Data</th>
              <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600">Google Vjetër</th>
              <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600">Google Ri</th>
              <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600">Çmimi Ynë Vjetër</th>
              <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600">Çmimi Ynë Ri</th>
              <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600">Ndryshimi</th>
            </tr>
          </thead>
          <tbody>${updatedRows}</tbody>
        </table>
      </div>` : `<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px">Asnjë çmim nuk u ndryshua gjatë këtij sinkronizimi.</div>`}

      ${skippedRows}
      ${notFoundRows}
    </div>

    <div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;color:#94a3b8;text-align:center">
      Kings Travel · Albania Sky &copy; ${new Date().getFullYear()} &nbsp;·&nbsp; kings-travel.tours
    </div>
  </div>
</body></html>`;

  return html;
}

// ─── CitizenPlane-style agent booking confirmation ───────────────────────────

// Flight date/time come from the DB as separate plain-text fields
// (departureDate "2025-07-06", departureTime "16:20", arrivalTime "18:50").
// Render "Mon, 06 Jul 4:20 PM – 6:50 PM" (times displayed 12h, stored 24h).
function cpFmtFlightDate(
  dateStrRaw: string | null | undefined,
  depTimeRaw: string | null | undefined,
  arrTimeRaw: string | null | undefined,
): string {
  const dateStr = dateStrRaw;
  const depTime = fmtAmPm(depTimeRaw);
  const arrTime = fmtAmPm(arrTimeRaw);
  if (!dateStr) {
    const t = [depTime, arrTime].filter(Boolean).join(" \u2013 ");
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
  if (arrTime) base += ` \u2013 ${arrTime}`;
  return base;
}

const PAX_TYPE_LABEL: Record<string, string> = { adult: "Adult", child: "Child", infant: "Infant" };

function emailHtmlEscape(value: unknown): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function agentBookingEmail(
  booking: any,
  status: "draft" | "pending" | "confirmed" | "ticketed" | "cancelled",
  ticketChanges: import("./ticketUpdateEmail.js").TicketedBookingChange[] = [],
  updatedTicketAttached = true,
): string {
  const isCancelled = status === "cancelled";
  const flight = booking.flight;
  const passengers: any[] = booking.passengers ?? [];

  const firstPax = passengers[0];
  const greetingName = firstPax?.lastName || firstPax?.firstName || booking.customerName || "";

  const origin      = flight?.fromCity ?? flight?.origin ?? "—";
  const destination = flight?.toCity ?? flight?.destination ?? "—";
  const dateStr     = cpFmtFlightDate(flight?.departureDate, flight?.departureTime, flight?.arrivalTime);
  const flightNum   = flight?.flightNumber ?? flight?.airline ?? "—";
  const pnr         = booking.pnr ?? null;
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
  const topPnrStyle = topPnr && topPnr.length > 9 ? "font-size:15px;letter-spacing:.03em" : "font-size:20px;letter-spacing:.06em";

  // ── Reference / PNR block ──────────────────────────────────────────────────
  // CP bookings (ONLINE TRAVEL): surface the CitizenPlane reference next to ours.
  const cpRef = cpRefOf(booking);
  const refHtml = `
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:16px 16px 14px;vertical-align:top">
          <div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.14em;margin-bottom:7px">Booking Reference</div>
           <div style="font-size:20px;font-weight:700;letter-spacing:.06em;color:#0f172a;font-family:'Courier New',Courier,monospace;line-height:1">${emailHtmlEscape(booking.bookingRef ?? "—")}</div>
        </td>
        ${cpRef ? `<td style="padding:16px 16px 14px;vertical-align:top;border-left:1px solid #e2e8f0">
          <div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.14em;margin-bottom:7px">CP Reference</div>
           <div style="font-size:20px;font-weight:700;letter-spacing:.06em;color:#0f172a;font-family:'Courier New',Courier,monospace;line-height:1">${emailHtmlEscape(cpRef)}</div>
        </td>` : ""}
        ${topPnr ? `<td style="padding:16px 16px 14px;vertical-align:top;border-left:1px solid #e2e8f0">
          <div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.14em;margin-bottom:7px">Airline PNR</div>
           <div style="${topPnrStyle};font-weight:700;color:#0f172a;font-family:'Courier New',Courier,monospace;line-height:1">${emailHtmlEscape(topPnr)}</div>
        </td>` : ""}
      </tr>
    </table>`;

  // ── Flight row ──────────────────────────────────────────────────────────────
  const flightHtml = `
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:0 0 10px;vertical-align:top">
          <div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px">Flight</div>
           <div style="font-size:16px;font-weight:700;color:#0f172a;letter-spacing:.04em">${emailHtmlEscape(flightNum)}</div>
        </td>
        <td style="padding:0 0 10px 32px;vertical-align:top">
          <div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px">Route</div>
           <div style="font-size:16px;font-weight:700;color:#0f172a">${emailHtmlEscape(origin)}&nbsp;&nbsp;&#x2192;&nbsp;&nbsp;${emailHtmlEscape(destination)}</div>
        </td>
        <td style="padding:0 0 10px 32px;vertical-align:top">
          <div style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px">Date</div>
           <div style="font-size:14px;font-weight:600;color:#0f172a">${emailHtmlEscape(dateStr)}</div>
        </td>
      </tr>
    </table>`;

  // ── Pricing (per-person price + extras + total) ──────────────────────────────
  const pricing = computeVoucherPricing(booking);
  const money = (n: number): string => `&euro;${fmtWhole(n)}`;

  // ── Passengers (name · type · per-person price) ──────────────────────────────
  const paxRows = pricing.pax.map((px, i: number) => {
    const typeLabel = PAX_TYPE_LABEL[px.type] ?? "Adult";
    const border    = i < pricing.pax.length - 1 ? "border-bottom:1px solid #f1f5f9;" : "";
    const effPnr    = px.pnr ?? pnr;
    const pnrLine   = effPnr ? `<div style="font-size:12px;color:#475569;font-weight:600;font-family:'Courier New',Courier,monospace;margin-top:2px;letter-spacing:.04em">PNR ${emailHtmlEscape(effPnr)}</div>` : "";
    const priceCell = px.cancelled
      ? `<span style="color:#e11d48;font-weight:600;font-size:12px">Cancelled</span>`
      : `<span style="color:#0f172a;font-weight:700">${money(px.price)}</span>`;
    return `<tr><td style="${border}padding:11px 0;font-size:14px;font-weight:500;color:#1e293b">${emailHtmlEscape(px.name)}${pnrLine}</td><td style="${border}padding:11px 0;font-size:11px;color:#64748b;text-align:center;font-weight:500;text-transform:uppercase;letter-spacing:.06em;vertical-align:top">${emailHtmlEscape(typeLabel)}</td><td style="${border}padding:11px 0;font-size:14px;text-align:right;vertical-align:top">${priceCell}</td></tr>`;
  }).join("");

  // ── Price summary ────────────────────────────────────────────────────────────
  const sumRow = (label: string, val: string, color = "#1e293b") =>
    `<tr><td style="padding:7px 0;font-size:13px;color:#64748b">${label}</td><td style="padding:7px 0;font-size:13px;font-weight:600;color:${color};text-align:right">${val}</td></tr>`;
  const summaryRows: string[] = [];
  summaryRows.push(sumRow(`Tickets (${pricing.activePaxCount} pax)`, money(pricing.ticketTotal)));
  for (const ex of pricing.bookingExtras) summaryRows.push(sumRow(ex.description, money(ex.amount)));
  if (pricing.paxExtrasBreakdown.length > 0) {
    for (const ex of pricing.paxExtrasBreakdown) {
      summaryRows.push(sumRow(ex.count > 1 ? `${ex.label} (${ex.count})` : ex.label, money(ex.amount)));
    }
  } else if (pricing.paxExtrasTotal > 0) {
    summaryRows.push(sumRow("Seat &amp; baggage extras", money(pricing.paxExtrasTotal)));
  }
  if (pricing.tax > 0) summaryRows.push(sumRow("Tax", money(pricing.tax)));
  if (pricing.discount > 0) summaryRows.push(sumRow("Discount", `&minus;${money(pricing.discount)}`, "#16a34a"));
  const priceSummaryHtml = `
    <table style="width:100%;border-collapse:collapse">
      ${summaryRows.join("")}
      <tr><td colspan="2" style="padding:8px 0 0"><div style="border-top:1px solid #e2e8f0"></div></td></tr>
      <tr>
        <td style="padding:13px 0 0;font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.06em">Total</td>
        <td style="padding:13px 0 0;font-size:20px;font-weight:800;color:#0f172a;text-align:right">${money(pricing.total)}</td>
      </tr>
    </table>`;

  // ── Luggage ─────────────────────────────────────────────────────────────────
  const cabinKg       = flight?.cabinBaggageKg    ? Number(flight.cabinBaggageKg)    : null;
  const checkedKg     = flight?.checkedBaggageKg  ? Number(flight.checkedBaggageKg)  : null;
  const nonInfants    = passengers.filter((p: any) => p.type !== "infant");
  const checkedCount  = passengers.filter((p: any) => p.baggageOption === "checked").length;

  const lugRows: string[] = [];
  if (checkedKg !== null) {
    lugRows.push(`<tr><td style="border-bottom:1px solid #f1f5f9;padding:11px 0;font-size:14px;font-weight:500;color:#1e293b">${checkedCount} &times; Checked Luggage</td><td style="border-bottom:1px solid #f1f5f9;padding:11px 0;font-size:13px;color:#64748b;text-align:right">${checkedKg} Kg</td></tr>`);
  }
  if (nonInfants.length > 0) {
    lugRows.push(`<tr><td style="padding:11px 0;font-size:14px;font-weight:500;color:#1e293b">${nonInfants.length} &times; Cabin Bag${nonInfants.length !== 1 ? "s" : ""}</td><td style="padding:11px 0;font-size:13px;color:#64748b;text-align:right">40x30x20 cm</td></tr>`);
  }

  // ── Cancelled overlay ───────────────────────────────────────────────────────
  const cancelBanner = isCancelled ? `
    <div style="background:#fff1f2;border-left:3px solid #e11d48;padding:12px 16px;margin-bottom:24px;border-radius:0 4px 4px 0">
      <div style="font-size:11px;font-weight:700;color:#e11d48;text-transform:uppercase;letter-spacing:.1em">Booking Cancelled</div>
      <div style="font-size:12px;color:#9f1239;margin-top:3px">This booking has been cancelled. Reference: <strong>${booking.bookingRef ?? "—"}</strong></div>
    </div>` : "";

  // ── Section builder ─────────────────────────────────────────────────────────
  const section = (label: string, inner: string) => `
    <div style="margin-bottom:24px">
      <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.16em;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0">${label}</div>
      ${inner}
    </div>`;

  const STATUS_EN: Record<string, { label: string; color: string }> = {
    draft:     { label: "HOLD",      color: "#ca8a04" },
    pending:   { label: "PENDING",   color: "#ea580c" },
    confirmed: { label: "CONFIRMED", color: "#2563eb" },
    ticketed:  { label: "TICKETED",  color: "#16a34a" },
    cancelled: { label: "CANCELLED", color: "#dc2626" },
  };
  const stMeta = STATUS_EN[status] ?? STATUS_EN.confirmed;

  const titleText =
    isCancelled ? "Booking Cancellation"
    : status === "ticketed" ? "E-Ticket"
    : status === "confirmed" ? "Booking Confirmation"
    : status === "pending" ? "Booking Pending"
    : "Booking Summary";
  const greeting  = greetingName ? greetingName : "Traveler";
  const subLine   =
    isCancelled ? "Your booking has been cancelled."
    : status === "ticketed" ? "your ticket has been issued"
    : status === "confirmed" ? "here you can find your booking confirmation"
    : status === "pending" ? "your booking is awaiting confirmation"
    : "here you can find your booking summary";
  const noteLine  = isCancelled ? "" :
    `<div style="font-size:11px;color:#94a3b8;font-style:italic;margin-top:2px">Please note this document is not your boarding pass.</div>`;
  const ticketChangesHtml = ticketChanges.length > 0 ? `
    <div style="margin-bottom:24px;border:1px solid #cbd5e1;border-radius:5px;overflow:hidden">
      <div style="background:#0f172a;color:#fff;padding:12px 16px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Ticket Details Updated</div>
        <div style="font-size:11px;color:#cbd5e1;margin-top:4px;line-height:1.5">The following ticket details have been updated. ${updatedTicketAttached ? "Please refer to the updated ticket attached to this email." : "Please use the updated details shown below."}</div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <th style="padding:9px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left;font-size:9px;color:#64748b;letter-spacing:.1em;text-transform:uppercase">Change</th>
          <th style="padding:9px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left;font-size:9px;color:#64748b;letter-spacing:.1em;text-transform:uppercase">Previous</th>
          <th style="padding:9px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left;font-size:9px;color:#64748b;letter-spacing:.1em;text-transform:uppercase">Updated</th>
        </tr>
        ${ticketChanges.map((change, index) => `
        <tr>
          <td style="padding:11px 12px;${index < ticketChanges.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}font-size:11px;font-weight:700;color:#334155;text-transform:uppercase">${emailHtmlEscape(change.label)}</td>
          <td style="padding:11px 12px;${index < ticketChanges.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}">
            <span style="display:inline-block;padding:5px 8px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-size:12px;font-weight:700;text-decoration:line-through">${emailHtmlEscape(change.oldValue)}</span>
          </td>
          <td style="padding:11px 12px;${index < ticketChanges.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}">
            <span style="display:inline-block;padding:5px 8px;border-radius:4px;background:#d1fae5;color:#047857;font-size:12px;font-weight:800">${emailHtmlEscape(change.newValue)}</span>
          </td>
        </tr>`).join("")}
      </table>
      <div style="padding:10px 16px;background:#ecfdf5;border-top:1px solid #a7f3d0;font-size:11px;font-weight:700;color:#047857">${updatedTicketAttached ? "The updated ticket is attached to this email. " : ""}Please use the updated details from now on.</div>
    </div>` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<div style="max-width:580px;margin:36px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.10),0 8px 32px rgba(0,0,0,.06)">

  <!-- Top strip -->
  <div style="background:#0f172a;padding:14px 32px;display:flex;align-items:center">
    <span style="font-size:18px;margin-right:10px">&#9992;</span>
    <span style="color:#e2e8f0;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Albania Sky &nbsp;&middot;&nbsp; Kings Travel</span>
  </div>

  <!-- Document body -->
  <div style="padding:36px 40px 32px">

    <!-- Title + greeting -->
    <div style="margin-bottom:28px">
      <h1 style="display:inline-block;margin:0 12px 14px 0;font-size:30px;font-weight:800;color:#0f172a;letter-spacing:-.5px;line-height:1;vertical-align:middle">${titleText}</h1><span style="display:inline-block;vertical-align:middle;background:${stMeta.color};color:#fff;font-size:10px;font-weight:700;padding:4px 11px;border-radius:20px;letter-spacing:.08em;margin-bottom:14px">${stMeta.label}</span>
      <div style="font-size:11px;color:#64748b;line-height:1.6">
         Dear ${emailHtmlEscape(greeting)},<br>
        ${subLine}
      </div>
      ${noteLine}
    </div>

    ${cancelBanner}
    ${ticketChangesHtml}

    <!-- Booking ref / PNR -->
    ${section("", `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">${refHtml}</div>`)}

    ${isCancelled ? "" : `<div style="font-size:12px;font-weight:600;color:#0f766e;background:#ecfdf5;border-left:3px solid #10b981;padding:10px 14px;border-radius:0 4px 4px 0;margin-bottom:24px">Online check-in is open 24 hours before the flight.</div>`}

    <!-- Flight -->
    ${section("", `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:18px 24px">${flightHtml}</div>`)}

    ${passengers.length > 0 ? section("Who&rsquo;s traveling?", `<table style="width:100%;border-collapse:collapse">${paxRows}</table>`) : ""}

    ${lugRows.length > 0 ? section("Luggage", `<table style="width:100%;border-collapse:collapse">${lugRows.join("")}</table>`) : ""}

    ${section("Price summary", priceSummaryHtml)}

    <!-- Footer -->
    <div style="border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;color:#94a3b8">For verification contact <a href="mailto:booking@albaniasky.com" style="color:#64748b;text-decoration:none">booking@albaniasky.com</a></span>
      <span style="font-size:11px;color:#cbd5e1">Page 1 of 1</span>
    </div>

  </div>
</div>
</body>
</html>`;
}

// ------- Seat Sold-Out Email -------
// Sent by the automatic seat-availability check when flights are auto-marked
// Sold Out because Google no longer offers `minSeats` seats for them.
export function seatSoldOutEmail(
  flights: Array<{
    airline?: string | null;
    flightNumber?: string | null;
    route: string;
    departureDate?: string | null;
    googlePrice?: number | null;
  }>,
  minSeats: number
): string {
  const nowD = new Date();
  const now = `${nowD.toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane", dateStyle: "full" })}, ${nowD.toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true })}`;

  const rows = flights.map(f => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:10px 12px;font-weight:600;color:#1e293b">${f.route}</td>
      <td style="padding:10px 12px;color:#64748b;font-size:13px">${[f.airline, f.flightNumber].filter(Boolean).join(" ") || "—"}</td>
      <td style="padding:10px 12px;color:#64748b;font-size:13px">${f.departureDate || "—"}</td>
      <td style="padding:10px 12px;text-align:right;color:#64748b">${f.googlePrice != null ? `€${fmtWhole(f.googlePrice)}` : "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:760px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#7f1d1d,#b91c1c);padding:28px 32px">
      <div style="color:#fecaca;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Kings Travel · Albania Sky</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">⛔ Fluturime të dala Sold Out</h1>
      <div style="color:#fecaca;font-size:13px;margin-top:6px">${now}</div>
    </div>

    <div style="padding:24px 32px">
      <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.5">
        Kontrolli automatik i vendeve nuk gjeti <strong>${minSeats} vende</strong> në Google për fluturimet e mëposhtme.
        Ato u shënuan automatikisht <strong style="color:#b91c1c">Sold Out</strong> dhe shitja u ndal.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb">
              <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Rruga</th>
              <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Fluturimi</th>
              <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600">Data</th>
              <th style="padding:10px 12px;text-align:right;color:#64748b;font-weight:600">Çmimi Google</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;color:#94a3b8;text-align:center">
      Kings Travel · Albania Sky &copy; ${new Date().getFullYear()} &nbsp;·&nbsp; kings-travel.tours
    </div>
  </div>
</body></html>`;

  return html;
}
