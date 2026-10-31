/** One document template for internal agency reports and emailed portal PDFs.
 * Formatting/accounting remain owned by the caller; this module only renders.
 */
export interface AgencyReportRow {
  ref: string; pnr: string; cp: string; customer: string; from: string; to: string;
  departure: string; created: string; status: string; total: number; paid: number;
  due: number; payments: string;
}
export interface AgencyReportCredit {
  created: string; type: string; method: string; source: string;
  ref: string; reference: string; amount: number;
}
export interface AgencyReportDocument {
  agent: { name?: string; company?: string | null; email?: string | null; phone?: string | null };
  rows: AgencyReportRow[];
  ledger?: AgencyReportCredit[];
  credit?: number;
  reportLabel?: string;
  creditLabel?: string;
  hideTotals?: boolean;
  generated: string;
  today: string;
  period?: string;
  toolbarHtml?: string;
  toolbarCss?: string;
}
export const paymentMethodLabel = (v: string): string => /cash/i.test(v) ? "CASH" :
  ({ bank_transfer: "Bankë", bank: "Bankë", card: "Kartë", credit: "Wallet", other: "Tjetër" }[v] || v || "?");
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (v: number) => String(Math.round(v));
const statusLabels: Record<string, string> = { draft: "Draft", pending: "Pritje", confirmed: "Konfirmuar", ticketed: "TICKETED", cancelled: "Anuluar" };
const statusColor = (s: string) => s === "ticketed" ? "#16a34a" : s === "confirmed" ? "#2563eb" : s === "cancelled" ? "#dc2626" : "#f59e0b";

export function renderAgencyReportHTML(doc: AgencyReportDocument): string {
  const { agent, rows: data, ledger = [], credit = 0, hideTotals = false,
    reportLabel = "Raport Detyrimet", creditLabel = "Kredit Gjendje (Info)" } = doc;
  const showCp = data.some(b => b.cp);
  const totalSales = data.reduce((s, b) => s + b.total, 0);
  const totalPaid = data.reduce((s, b) => s + b.paid, 0);
  const totalDue = data.reduce((s, b) => s + b.due, 0);
  const agentBits = [
    `<strong>Agjencia:</strong> ${esc(agent.name || "—")}`,
    agent.company ? `<strong>Kompania:</strong> ${esc(agent.company)}` : "",
    agent.email ? esc(agent.email) : "", agent.phone ? esc(agent.phone) : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const rows = data.map((b, i) => `<tr style="${i % 2 ? "background:#f8fafc;" : ""}border-bottom:1px solid #e5e7eb">
      <td style="padding:6px 8px;font-weight:700;white-space:nowrap">${esc(b.ref)}</td>
      <td style="padding:6px 8px;font-family:monospace;color:#64748b">${esc(b.pnr || "—")}</td>
      ${showCp ? `<td style="padding:6px 8px;font-family:monospace;font-weight:700;color:#0e7490;white-space:nowrap">${esc(b.cp || "—")}</td>` : ""}
      <td style="padding:6px 8px;white-space:nowrap">${esc(b.customer)}</td>
      <td style="padding:6px 8px;white-space:nowrap">${esc(b.from)}</td>
      <td style="padding:6px 8px;white-space:nowrap">${esc(b.to)}</td>
      <td style="padding:6px 8px;white-space:nowrap">${esc(b.departure)}</td>
      <td style="padding:6px 8px;color:#64748b;white-space:nowrap">${esc(b.created)}</td>
      <td style="padding:6px 8px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:${statusColor(b.status)};white-space:nowrap">${esc(statusLabels[b.status] || b.status)}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">€${money(b.total)}</td>
      <td style="padding:6px 8px;text-align:right;white-space:nowrap">€${money(b.paid)}</td>
      <td class="payment-summary" style="padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:-0.1px;color:#475569">${esc(b.payments)}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:${b.due > 0 ? "#dc2626" : "#16a34a"};white-space:nowrap">€${money(b.due)}</td>
    </tr>`).join("");
  const creditSection = ledger.length ? `
<div style="margin-top:20px">
  <div style="font-size:11px;font-weight:800;color:#1e3a5f;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Historia e Krediteve <span style="color:#94a3b8;font-weight:500;text-transform:none;letter-spacing:0">· ${ledger.length} veprime</span></div>
  <table>
    <thead><tr style="border-bottom:2px solid #1e293b">
      ${["Data", "Lloji", "Metoda", "Rezervimi", "Referenca / Shënime"].map(l => `<th style="padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700">${l}</th>`).join("")}
      <th style="padding:5px 8px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700">Shuma</th>
    </tr></thead>
    <tbody>${ledger.map((t, i) => `<tr style="${i % 2 ? "background:#f8fafc;" : ""}border-bottom:1px solid #e5e7eb">
      <td style="padding:5px 8px;font-size:10px;color:#64748b;white-space:nowrap">${esc(t.created)}</td>
      <td style="padding:5px 8px;font-size:10px;font-weight:700;color:${t.type === "payment" ? "#ea580c" : t.type === "refund" ? "#2563eb" : "#16a34a"}">${t.type === "deposit" ? "Depozitë" : t.type === "refund" ? "Rimbursim" : "Pagesë"}</td>
      <td style="padding:5px 8px;font-size:10px;color:#475569">${esc(t.source === "payment" ? t.method ? paymentMethodLabel(t.method) : "Direkte" : "Wallet")}</td>
      <td style="padding:5px 8px;font-size:10px;font-family:monospace;color:#475569">${esc(t.ref || "—")}</td>
      <td style="padding:5px 8px;font-size:10px;color:#64748b;overflow-wrap:anywhere">${esc(t.reference || "—")}</td>
      <td style="padding:5px 8px;font-size:10px;text-align:right;font-weight:700;color:${t.type === "payment" ? "#ea580c" : "#16a34a"};white-space:nowrap">${t.type === "payment" ? "-" : "+"}€${money(t.amount)}</td>
    </tr>`).join("")}</tbody>
  </table>
</div>` : "";
  const th = (label: string, align = "left", extra = "") =>
    `<th style="padding:6px 8px;text-align:${align};font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;${extra}">${label}</th>`;
  return `<!DOCTYPE html>
<html lang="sq"><head><meta charset="UTF-8"/>
<title>${esc(reportLabel)} – ${esc(agent.name || "")}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 20px; }
  table { width: 100%; border-collapse: collapse; }
  tbody tr { page-break-inside: avoid; }
  .payment-summary { min-width: 95px; max-width: 220px; overflow-wrap: anywhere; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  @media print { body { padding: 0; } button { display: none; } }
  ${doc.toolbarCss || ""}
</style></head><body>
${doc.toolbarHtml || ""}
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;border-bottom:1px solid #e5e7eb;padding-bottom:10px">
  <div style="display:flex;align-items:baseline;gap:10px">
    <span style="font-size:20px;font-weight:800;color:#1e3a5f;letter-spacing:0.5px">KINGS TRAVEL</span>
    <span style="font-size:13px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase">${esc(reportLabel)}</span>
  </div>
  <div style="font-size:10px;color:#475569;font-family:monospace">${agentBits}</div>
</div>
<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:1px solid #e5e7eb;padding:8px 0;margin-bottom:14px">
  <div style="font-size:10px;color:#64748b;font-family:monospace">Gjeneruar: <strong style="color:#1e293b">${esc(doc.generated)}</strong> &nbsp;·&nbsp; ${data.length} rezervime${doc.period ? `<br/>Periudha: ${esc(doc.period)}` : ""}</div>
  <div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
    ${!hideTotals ? `<div style="font-size:10px;color:#64748b;font-family:monospace">Total Shuma:<br/><strong style="font-size:13px;color:#1e293b">€${money(totalSales)}</strong></div>` : ""}
    <div style="font-size:10px;color:#64748b;font-family:monospace">Total Paguar:<br/><strong style="font-size:13px;color:#1e293b">€${money(totalPaid)}</strong></div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:5px 12px;font-size:10px;color:#dc2626;font-family:monospace;font-weight:700">Total Detyrim:<br/><span style="font-size:13px">€${money(totalDue)}</span></div>
    ${credit > 0 ? `<div style="font-size:10px;color:#64748b;font-family:monospace;text-transform:uppercase;letter-spacing:0.5px">${esc(creditLabel)}: <span style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:3px 10px;color:#16a34a;font-weight:700;font-size:12px">+€${money(credit)}</span></div>` : ""}
  </div>
</div>
<table><thead><tr style="border-bottom:2px solid #1e293b">
  ${th("Rezervimi")}${th("PNR")}${showCp ? th("Kodi CP") : ""}${th("Klienti")}${th("Nisja")}${th("Mbërritja")}${th("Data Nisjes")}${th("Krijuar")}${th("Statusi")}${th("Total €", "right")}${th("Paguar €", "right")}${th("Pagesa")}${th("Detyrim €", "right", "color:#dc2626;")}
</tr></thead><tbody>${rows}</tbody>
<tfoot><tr style="border-top:2px solid #1e293b">
  <td colspan="${showCp ? 9 : 8}" style="padding:8px;text-align:right;font-weight:800">TOTALI:</td>
  <td style="padding:8px;text-align:right;font-weight:800;white-space:nowrap">${hideTotals ? "" : `€${money(totalSales)}`}</td>
  <td style="padding:8px;text-align:right;font-weight:800;white-space:nowrap">€${money(totalPaid)}</td>
  <td></td><td style="padding:8px;text-align:right;font-weight:800;color:#dc2626;white-space:nowrap">€${money(totalDue)}</td>
</tr></tfoot></table>
${creditSection}
<div style="margin-top:26px;border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:9px;color:#94a3b8;font-family:monospace;letter-spacing:1px">KINGS TRAVEL &nbsp;·&nbsp; ${esc(reportLabel.toUpperCase())} &nbsp;·&nbsp; ${esc(doc.today)}</div>
</body></html>`;
}
