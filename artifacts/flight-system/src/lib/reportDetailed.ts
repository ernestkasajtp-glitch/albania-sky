import { format } from "date-fns";
import { fmtM, fmtAmPm, dueEuro } from "@/lib/utils";
import { renderAgencyReportHTML, paymentMethodLabel } from "@workspace/agency-report";

export const REPORT_TOOLBAR_CSS = `
  .rpt-toolbar { position: sticky; top: 0; z-index: 999; background:#1e3a5f; padding:10px 16px; display:flex; gap:10px; align-items:center; margin:-20px -20px 16px; box-shadow:0 2px 8px rgba(0,0,0,.15); }
  .rpt-toolbar button { font-family:Arial,sans-serif; font-size:13px; font-weight:600; border:none; border-radius:6px; padding:8px 18px; cursor:pointer; }
  .rpt-toolbar .dl { background:#2563eb; color:#fff; }
  .rpt-toolbar .cl { background:#ffffff; color:#1e3a5f; }
  .rpt-toolbar .lbl { color:#cbd5e1; font-size:12px; font-weight:700; margin-left:auto; letter-spacing:0.5px; }
  @media print { .rpt-toolbar { display:none !important; } }
`;

export function reportToolbarHTML(opts: { filename?: string; orientation?: "portrait" | "landscape"; autoAction?: "print" | "download" } = {}) {
  const filename = (opts.filename || "raport").replace(/[^\w\-€]+/g, "_").replace(/^_+|_+$/g, "") || "raport";
  const orientation = opts.orientation === "landscape" ? "landscape" : "portrait";
  const autoAction = opts.autoAction === "print" || opts.autoAction === "download" ? opts.autoAction : "";
  return `
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<div class="rpt-toolbar">
  <button class="pr" onclick="window.print()">🖨 Printo</button>
  <button class="dl" onclick="rptDownloadPDF(this)">⬇ Download PDF</button>
  <button class="cl" onclick="window.close()">Mbyll</button>
  <span class="lbl">Kings Travel</span>
</div>
<script>
function rptDownloadPDF(btn){
  if (typeof html2pdf === 'undefined') { alert('Po ngarkohet, provo serish pas pak sekondash.'); return; }
  var tb = document.querySelector('.rpt-toolbar');
  var old = btn ? btn.innerHTML : ''; if (btn) { btn.innerHTML = 'Duke pergatitur...'; btn.disabled = true; }
  if (tb) tb.style.display = 'none';
  var done = function(){ if (tb) tb.style.display = ''; if (btn) { btn.innerHTML = old; btn.disabled = false; } try { if (window.parent && window.parent !== window) window.parent.postMessage('rpt-download-done', '*'); } catch(e){} };
  var opt = {
    margin: 6,
    filename: '${filename}.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: document.documentElement.scrollWidth },
    jsPDF: { unit: 'mm', format: 'a4', orientation: '${orientation}' },
    pagebreak: { mode: ['css', 'legacy'] }
  };
  html2pdf().set(opt).from(document.body).save().then(done).catch(function(){ done(); alert('Gabim gjate gjenerimit te PDF.'); });
}
${autoAction === "print" ? `window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 350); });` : ""}
${autoAction === "download" ? `window.addEventListener('load', function(){ var n=0; var t=setInterval(function(){ n++; if (typeof html2pdf !== 'undefined') { clearInterval(t); rptDownloadPDF(document.querySelector('.rpt-toolbar .dl')); } else if (n > 100) { clearInterval(t); alert('Nuk u ngarkua libraria e PDF.'); } }, 100); });` : ""}
</script>`;
}

/**
 * Render the report HTML (which contains the auto-download script) into a
 * hidden, off-screen iframe so the PDF downloads directly without opening a
 * visible page/tab. The iframe is removed after html2pdf has finished.
 */
export function downloadReportPDF(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "820px";
  iframe.style.height = "1200px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("message", onMsg);
    window.clearTimeout(fallback);
    iframe.remove();
  };
  const onMsg = (e: MessageEvent) => {
    if (e.source === iframe.contentWindow && e.data === "rpt-download-done") {
      // Give the browser a moment to start the download before removing the iframe.
      window.setTimeout(cleanup, 1500);
    }
  };
  window.addEventListener("message", onMsg);
  // Fallback in case the completion message never arrives.
  const fallback = window.setTimeout(cleanup, 30000);

  doc.open();
  doc.write(html);
  doc.close();
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar", ticketed: "TICKETED", cancelled: "Anuluar",
};
const PASSENGER_TYPES: Record<string, string> = { adult: "I rritur", child: "Fëmijë", infant: "Foshnjë" };
const METHOD_LABELS: Record<string, string> = { cash: "Para në dorë", bank_transfer: "Bankë", card: "Kartë", other: "Tjetër" };

function statusColor(s: string) {
  return s === "ticketed" ? "#16a34a" : s === "confirmed" ? "#2563eb" : s === "cancelled" ? "#dc2626" : "#f59e0b";
}

function methodIcon(m: string) {
  if (m === "cash" || /cash/i.test(m)) return "💵";
  if (m === "bank_transfer") return "🏦";
  if (m === "card") return "💳";
  return "🔹";
}

function methodLabel(m: string) {
  if (METHOD_LABELS[m]) return METHOD_LABELS[m];
  if (m && /cash/i.test(m)) return "Pagesë Cash";
  return m;
}

// ——— Raporti i Detyrimeve (dizajn "Kompakt Zebra", A4 landscape) ———

function payMethodShort(m: string): string {
  return paymentMethodLabel(m);
}

/** "Bankë 12/07 €50 + Cash 13/07 €30" — metoda + data + shuma për çdo pagesë të kompletuar. */
export function debtPaymentsSummary(b: any): string {
  const payments: any[] = (b?.paymentHistory ?? []).filter((p: any) => p.status === "completed");
  if (payments.length === 0) return "—";
  return payments.map((p: any) => {
    const d = p.createdAt ? format(new Date(p.createdAt), "dd/MM") : "";
    const amt = `€${fmtM(Number(p.amount ?? 0))}`;
    const label = `${payMethodShort(p.method)}${d ? " " + d : ""}`;
    return p.isRefund ? `Rimb. ${label} -${amt}` : `${label} ${amt}`;
  }).join(" + ");
}

function escHtml(v: any): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Kodi CP (CitizenPlane) i nxjerrë nga notes (`[CP:kodi]`) — shfaqet VETËM për
 * rezervimet e agjencisë ONLINE TRAVEL. Agjencia merret nga `agencyName` (kur
 * raporti është për një agjent të vetëm) ose nga `b.agentName`.
 */
export function cpCodeOf(b: any, agencyName?: string | null): string {
  const agency = String(agencyName ?? b?.agentName ?? "");
  if (!/ONLINE\s*TRAVEL/i.test(agency)) return "";
  const m = String(b?.notes ?? "").match(/\[CP:([^\]]+)\]/i);
  return m ? m[1].trim() : "";
}

export function generateDebtReportHTML(
  data: any[],
  agent: { name?: string; company?: string | null; email?: string | null; phone?: string | null },
  opts: {
    autoAction?: "print" | "download"; filename?: string; agentCredit?: number; hideTotals?: boolean;
    /** Etiketa e raportit në krye/fund (default "Raport Detyrimet"). */
    reportLabel?: string;
    /** Etiketa e kutisë së kreditit (default "Kredit Gjendje (Info)"). */
    creditLabel?: string;
    /** Historia e krediteve — shfaqet si seksion pas tabelës kur ka veprime. */
    creditTransactions?: any[];
  } = {},
) {
  const {
    autoAction, filename, agentCredit = 0, hideTotals = false,
    reportLabel = "Raport Detyrimet", creditLabel = "Kredit Gjendje (Info)", creditTransactions = [],
  } = opts;
  return renderAgencyReportHTML({
    agent, credit: agentCredit, hideTotals, reportLabel, creditLabel,
    generated: format(new Date(), "dd/MM/yyyy h:mm a"), today: format(new Date(), "dd/MM/yyyy"),
    toolbarCss: REPORT_TOOLBAR_CSS,
    toolbarHtml: reportToolbarHTML({ filename: filename || "raport-detyrimet", orientation: "landscape", autoAction }),
    rows: data.map(b => ({
      ref: b.bookingRef, pnr: b.pnr || "—", cp: cpCodeOf(b, agent.name),
      customer: b.customerName, from: b.flight?.fromCity || "—", to: b.flight?.toCity || "—",
      departure: b.flight?.departureDate || "—",
      created: b.createdAt ? format(new Date(b.createdAt), "dd/MM/yyyy") : "—",
      status: b.status, total: Number(b.totalAmount ?? 0), paid: Number(b.paidAmount ?? 0),
      due: dueEuro(b.dueAmount), payments: debtPaymentsSummary(b),
    })),
    ledger: (Array.isArray(creditTransactions) ? creditTransactions : []).map(t => ({
      created: t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy h:mm a") : "—",
      type: t.type, method: t.method, source: t.source, ref: t.bookingRef ?? "—",
      reference: t.reference ?? t.notes ?? "—", amount: Number(t.amount),
    })),
  });
}

export function generateDetailedReportHTML(
  data: any[],
  title: string = "Raport i Detajuar",
  subtitle: string = "",
  opts: { agentReport?: boolean; autoAction?: "print" | "download"; filename?: string; agentCredit?: number; creditTransactions?: any[]; hideTotals?: boolean; creditLabel?: string } = {},
) {
  const { agentReport = false, autoAction, filename, agentCredit = 0, creditTransactions = [], hideTotals = false, creditLabel = "Balanca Kredit" } = opts;
  const showCredit = agentReport && agentCredit > 0;
  const creditTxns = agentReport ? (creditTransactions ?? []) : [];
  const now = format(new Date(), "dd/MM/yyyy h:mm a");
  const creditRows = creditTxns.map((t: any) => {
    const tDate = t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy h:mm a") : "-";
    const typeLabel = t.type === "deposit" ? "Depozitë" : t.type === "refund" ? "Rimbursim" : "Pagesë";
    const typeColor = t.type === "payment" ? "#ea580c" : t.type === "refund" ? "#2563eb" : "#16a34a";
    const sign = t.type === "payment" ? "-" : "+";
    const amtColor = t.type === "payment" ? "#ea580c" : "#16a34a";
    const method = t.source === "payment"
      ? (t.method === "cash" ? "Cash" : t.method === "bank" ? "Bankë" : t.method === "card" ? "Kartë" : (t.method ?? "Direkte"))
      : "Wallet";
    return `<tr>
      <td style="padding:5px 10px;font-size:10px;color:#475569">${tDate}</td>
      <td style="padding:5px 10px;font-size:10px;font-weight:600;color:${typeColor}">${typeLabel}</td>
      <td style="padding:5px 10px;font-size:10px;color:#475569">${method}</td>
      <td style="padding:5px 10px;font-size:10px;color:#475569;font-family:monospace">${t.bookingRef ?? "-"}</td>
      <td style="padding:5px 10px;font-size:10px;color:#64748b">${t.reference ?? t.notes ?? "-"}</td>
      <td style="padding:5px 10px;font-size:10px;text-align:right;font-weight:600;color:${amtColor}">${sign}€${fmtM(Number(t.amount))}</td>
    </tr>`;
  }).join("");
  const creditSection = (agentReport && creditTxns.length > 0) ? `
<div style="margin-top:24px">
  <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px">Historia e Krediteve <span style="color:#94a3b8;font-weight:500">· ${creditTxns.length} veprime</span></div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">
    <thead>
      <tr style="background:#f8fafc">
        <th style="padding:6px 10px;font-size:10px;text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0">Data</th>
        <th style="padding:6px 10px;font-size:10px;text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0">Lloji</th>
        <th style="padding:6px 10px;font-size:10px;text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0">Metoda</th>
        <th style="padding:6px 10px;font-size:10px;text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0">Rezervimi</th>
        <th style="padding:6px 10px;font-size:10px;text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0">Referenca / Shënime</th>
        <th style="padding:6px 10px;font-size:10px;text-align:right;color:#64748b;border-bottom:1px solid #e2e8f0">Shuma</th>
      </tr>
    </thead>
    <tbody>${creditRows}</tbody>
  </table>
</div>` : "";
  const totalSales = data.reduce((s, b) => s + b.totalAmount, 0);
  const totalPaid  = data.reduce((s, b) => s + b.paidAmount, 0);
  const totalDue   = data.reduce((s, b) => s + dueEuro(b.dueAmount), 0);
  const totalComm  = data.reduce((s, b) => s + (b.commissionAmount ?? 0), 0);

  const bookingRows = data.map((b, i) => {
    const bgRow = i % 2 === 0 ? "#fff" : "#f8fafc";
    const dueColor = dueEuro(b.dueAmount) > 0 ? "#dc2626" : "#16a34a";
    const createdDate = b.createdAt ? format(new Date(b.createdAt), "dd/MM/yyyy h:mm a") : "";

    const passengersList = (b.passengers ?? [])
      .map((p: any) => `${p.firstName} ${p.lastName} <span style="color:#64748b;font-size:10px">(${PASSENGER_TYPES[p.type] || p.type}${p.seatNumber ? " · Seat " + p.seatNumber : ""}${p.baggageOption && p.baggageOption !== "none" ? " · Bag" : ""})</span>`)
      .join(" &nbsp;·&nbsp; ");

    const payments: any[] = b.paymentHistory ?? [];
    const completedPayments = payments.filter(p => p.status === "completed");

    const paymentRows = completedPayments.length === 0
      ? `<tr><td colspan="5" style="color:#94a3b8;font-style:italic;padding:6px 10px">Asnjë pagesë e regjistruar</td></tr>`
      : completedPayments.map(p => {
          const pDate = p.createdAt ? format(new Date(p.createdAt), "dd/MM/yyyy h:mm a") : "-";
          const isRefund = p.isRefund;
          return `<tr>
            <td style="padding:5px 10px;font-size:10px;color:#64748b">${pDate}</td>
            <td style="padding:5px 10px;font-size:10px">${methodIcon(p.method)} ${methodLabel(p.method)}</td>
            <td style="padding:5px 10px;font-size:10px;text-align:right;font-weight:600;color:${isRefund ? "#dc2626" : "#16a34a"}">${isRefund ? "-" : "+"}€${fmtM(p.amount)}</td>
            <td style="padding:5px 10px;font-size:10px;color:#64748b">${p.reference || "—"}</td>
            <td style="padding:5px 10px;font-size:10px">${isRefund ? '<span style="background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:99px">Rimbursim</span>' : '<span style="background:#dcfce7;color:#16a34a;pading:1px 6px;border-radius:99px">Pagesë</span>'}</td>
          </tr>`;
        }).join("");

    const ticketNumbers = (b.passengers ?? []).map((p: any) => p.ticketNumber).filter(Boolean).join(", ");

    const flightCell = b.flight
      ? `<div style="font-weight:700;font-size:12px">${b.flight.fromCity} → ${b.flight.toCity}</div>
         <div style="font-size:10px;color:#64748b">${b.flight.airline} ${b.flight.flightNumber} · ${b.flight.departureDate || ""}${b.flight.departureTime ? " " + fmtAmPm(b.flight.departureTime) : ""}</div>`
      : "<div style='color:#94a3b8'>—</div>";

    const customerCell = `<div style="font-weight:600;font-size:12px">${b.customerName}</div>
      ${[b.customerPhone ? `📞 ${b.customerPhone}` : "", b.customerEmail ? `✉ ${b.customerEmail}` : ""].filter(Boolean).join(" · ") ? `<div style="font-size:10px;color:#64748b">${[b.customerPhone ? `📞 ${b.customerPhone}` : "", b.customerEmail ? `✉ ${b.customerEmail}` : ""].filter(Boolean).join(" · ")}</div>` : ""}
      ${!agentReport && b.agentName ? `<div style="font-size:10px;color:#64748b">Agjent: <strong>${b.agentName}</strong></div>` : ""}`;

    const finCell = `<div style="font-size:11px;line-height:1.5">
        <span style="color:#64748b">Total</span> <strong>€${fmtM(b.totalAmount)}</strong> &nbsp;·&nbsp;
        <span style="color:#64748b">Paguar</span> <strong style="color:#16a34a">€${fmtM(b.paidAmount)}</strong> &nbsp;·&nbsp;
        <span style="color:#64748b">Mbetet</span> <strong style="color:${dueColor}">€${fmtM(dueEuro(b.dueAmount))}</strong>
        ${!agentReport && !hideTotals && b.commissionAmount != null ? `&nbsp;·&nbsp; <span style="color:#64748b">Komisioni</span> <strong style="color:#7c3aed">€${fmtM(b.commissionAmount)}</strong>` : ""}
      </div>`;

    const paymentsInline = completedPayments.length === 0
      ? `<span style="color:#94a3b8;font-style:italic">Asnjë pagesë e regjistruar</span>`
      : completedPayments.map(p => {
          const pDate = p.createdAt ? format(new Date(p.createdAt), "dd/MM/yyyy h:mm a") : "-";
          const isRefund = p.isRefund;
          return `<span style="display:inline-block;margin-right:14px">
            <span style="color:#64748b">${pDate}</span> ·
            ${methodIcon(p.method)} ${methodLabel(p.method)} ·
            <strong style="color:${isRefund ? "#dc2626" : "#16a34a"}">${isRefund ? "-" : "+"}€${fmtM(p.amount)}</strong>
            ${p.reference ? ` · <span style="color:#64748b">${p.reference}</span>` : ""}
            ${isRefund ? ' <span style="background:#fee2e2;color:#dc2626;padding:0 5px;border-radius:99px;font-size:9px">RIMB</span>' : ""}
          </span>`;
        }).join("");

    return `
    <div style="margin-bottom:8px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;page-break-inside:avoid;background:${bgRow}">
      <div style="background:#1e3a5f;color:#fff;padding:5px 12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <span style="font-weight:700;font-size:12px">${b.bookingRef}</span>
          ${b.pnr ? `<span style="font-family:monospace;font-size:10px;background:#2d4f7c;padding:1px 7px;border-radius:4px">PNR: ${b.pnr}</span>` : ""}
          ${cpCodeOf(b) ? `<span style="font-family:monospace;font-size:10px;background:#0e7490;padding:1px 7px;border-radius:4px">CP: ${escHtml(cpCodeOf(b))}</span>` : ""}
          ${ticketNumbers ? `<span style="font-family:monospace;font-size:10px;color:#94c3ff">Biletë: ${ticketNumbers}</span>` : ""}
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          ${createdDate ? `<span style="font-size:10px;color:#cbd5e1">Krijuar: <strong style="color:#fff">${createdDate}</strong></span>` : ""}
          <span style="background:${statusColor(b.status)};padding:1px 9px;border-radius:99px;font-size:10px;font-weight:600">${STATUS_LABELS[b.status] || b.status}</span>
        </div>
      </div>

      <div style="padding:6px 12px;display:grid;grid-template-columns:1.1fr 1.1fr 1.6fr;gap:12px;align-items:center">
        ${flightCell}
        ${customerCell}
        ${finCell}
      </div>

      ${passengersList ? `<div style="padding:4px 12px;border-top:1px solid #eef2f6;font-size:11px;background:#fafafa">
        <span style="color:#64748b;font-weight:600;text-transform:uppercase;font-size:9px">Pasagjerët:</span>
        ${passengersList}
      </div>` : ""}

      <div style="padding:4px 12px;border-top:1px solid #eef2f6;font-size:10px">
        <span style="color:#64748b;font-weight:600;text-transform:uppercase;font-size:9px">Pagesat:</span>
        ${paymentsInline}
      </div>

      ${b.notes ? `<div style="padding:3px 12px 6px;font-size:10px;color:#64748b;font-style:italic;border-top:1px solid #eef2f6">📝 ${b.notes}</div>` : ""}
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 20px; }
  h1 { font-size: 22px; color: #1e40af; margin: 0 0 2px; }
  .subtitle { color: #64748b; font-size: 12px; margin-bottom: 2px; }
  .meta { color: #94a3b8; font-size: 11px; margin-bottom: 16px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
  .summary-box .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
  .summary-box .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .footer { margin-top: 20px; color: #94a3b8; font-size: 10px; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { body { padding: 0; } button { display: none; } }
  ${REPORT_TOOLBAR_CSS}
</style>
</head>
<body>
${reportToolbarHTML({ filename: filename || title, orientation: "portrait", autoAction })}
<h1>${title}</h1>
${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
<div class="meta">Gjeneruar: ${now} &nbsp;·&nbsp; ${data.length} rezervime</div>

<div class="summary" style="grid-template-columns: repeat(${(hideTotals ? 0 : 1) + 2 + (showCredit ? 1 : 0) + ((!agentReport && !hideTotals) ? 1 : 0)}, 1fr)">
  ${!hideTotals ? `<div class="summary-box"><div class="label">Shitjet Totale</div><div class="value">€${fmtM(totalSales)}</div></div>` : ""}
  <div class="summary-box"><div class="label">Total Paguar</div><div class="value" style="color:#16a34a">€${fmtM(totalPaid)}</div></div>
  <div class="summary-box"><div class="label">Total Borxh</div><div class="value" style="color:#dc2626">€${fmtM(totalDue)}</div></div>
  ${showCredit ? `<div class="summary-box"><div class="label">${creditLabel}</div><div class="value" style="color:#16a34a">+€${fmtM(agentCredit)}</div></div>` : ""}
  ${!agentReport && !hideTotals ? `<div class="summary-box"><div class="label">Total Komisioni</div><div class="value" style="color:#7c3aed">€${fmtM(totalComm)}</div></div>` : ""}
</div>

${bookingRows}

${creditSection}

<div class="footer">Kings Travel &nbsp;·&nbsp; Raport i detajuar &nbsp;·&nbsp; ${now}</div>
</body>
</html>`;
}
