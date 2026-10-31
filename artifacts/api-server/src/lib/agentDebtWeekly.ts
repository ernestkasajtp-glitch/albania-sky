// ── Raporti javor i detyrimeve për agjentët ─────────────────────────────────
// Çdo të hënë 07:00 (ora e Shqipërisë) u dërgohet me email agjentëve:
//   • që admini i ka selektuar (agents.weekly_debt_report = true), DHE
//   • që kanë detyrim real > 0 (shitje − paguar − krediti i portofolit).
// Email-i është në stilin kompakt "zebra" (vetëm tabela, si faturat e pagesave):
// një rresht për çdo rezervim me pagesë të mangët + totali.
// Nuk prek asgjë tjetër — vetëm lexon dhe dërgon email.

import { db, bookingsTable, flightsTable, agentsTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { sendEmail } from "./gmail.js";
import { formatWholeEuro, wholeEuroDue } from "./money.js";

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtMoney(n: number): string {
  return formatWholeEuro(n);
}
function fmtDateAL(d: Date): string {
  return d.toLocaleDateString("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Tirane" });
}

interface DebtRow {
  bookingRef: string;
  pnr: string | null;
  customerName: string;
  route: string;
  flightInfo: string;
  total: number;
  paid: number;
  due: number;
}

function debtReportEmailHtml(opts: {
  agentName: string;
  agentCompany: string | null;
  rows: DebtRow[];
  walletBalance: number;
}): string {
  const { agentName, agentCompany, rows, walletBalance } = opts;
  const today = fmtDateAL(new Date());
  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const agentBits = [agentName, agentCompany].filter(Boolean).map(s => esc(String(s))).join(" &nbsp;·&nbsp; ");

  const th = (label: string, align: "left" | "right" = "left") =>
    `<th style="padding:6px 8px;text-align:${align};font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;border-bottom:2px solid #1e293b">${label}</th>`;

  const bodyRows = rows.map((r, i) => {
    const zebra = i % 2 === 1 ? "background:#f8fafc;" : "";
    return `<tr style="${zebra}">
      <td style="padding:6px 8px;font-weight:700;font-size:11px;white-space:nowrap;border-bottom:1px solid #e5e7eb">${esc(r.bookingRef)}</td>
      <td style="padding:6px 8px;font-family:monospace;font-size:11px;color:#64748b;border-bottom:1px solid #e5e7eb">${esc(r.pnr || "—")}</td>
      <td style="padding:6px 8px;font-size:11px;white-space:nowrap;border-bottom:1px solid #e5e7eb">${esc(r.customerName || "—")}</td>
      <td style="padding:6px 8px;font-size:11px;border-bottom:1px solid #e5e7eb">${esc(r.route)}${r.flightInfo ? `<br/><span style="font-size:9px;color:#94a3b8">${esc(r.flightInfo)}</span>` : ""}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;white-space:nowrap;border-bottom:1px solid #e5e7eb">€${fmtMoney(r.total)}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;white-space:nowrap;border-bottom:1px solid #e5e7eb">€${fmtMoney(r.paid)}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;font-weight:700;color:#dc2626;white-space:nowrap;border-bottom:1px solid #e5e7eb">€${fmtMoney(r.due)}</td>
    </tr>`;
  }).join("");

  const totalsFoot = `<tfoot>
    <tr style="background:#1e293b">
      <td colspan="6" style="padding:7px 8px;color:#fff;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:1px">TOTALI I DETYRIMEVE</td>
      <td style="padding:7px 8px;text-align:right;color:#fca5a5;font-weight:800;font-size:11px;white-space:nowrap">€${fmtMoney(totalDue)}</td>
    </tr>
  </tfoot>`;

  // Krediti i portofolit shfaqet si gjendje informuese (si te raporti i detyrimeve në sistem).
  const walletNote = walletBalance > 0
    ? `<p style="font-size:11px;color:#475569;margin:10px 0 0">Kredit në portofol: <strong style="color:#16a34a">€${fmtMoney(walletBalance)}</strong> (gjendje informuese)</p>`
    : "";

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:0 auto;color:#1e293b;padding:8px">
  <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #e5e7eb">
    <tr>
      <td style="padding:0 0 10px">
        <span style="font-size:19px;font-weight:800;color:#1e3a5f;letter-spacing:0.5px">KINGS TRAVEL</span>
        <span style="font-size:12px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase">&nbsp;&nbsp;Raport Javor Detyrimesh</span>
      </td>
      <td style="padding:0 0 10px;text-align:right;font-size:10px;color:#475569;font-family:monospace">${agentBits}</td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin:10px 0 14px">
    <tr>
      <td style="font-size:10px;color:#64748b;font-family:monospace">
        Data: <strong style="color:#1e293b">${today}</strong>
        &nbsp;·&nbsp; ${rows.length} rezervim${rows.length === 1 ? "" : "e"} me detyrim
      </td>
      <td style="text-align:right">
        <span style="font-size:10px;color:#64748b;font-family:monospace">Detyrimi total:&nbsp;</span>
        <span style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:3px 10px;color:#dc2626;font-weight:700;font-size:13px">€${fmtMoney(totalDue)}</span>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>
        ${th("Rezervimi")}${th("PNR")}${th("Klienti")}${th("Fluturimi")}${th("Total", "right")}${th("Paguar", "right")}${th("Detyrim", "right")}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    ${totalsFoot}
  </table>
  ${walletNote}
  <p style="font-size:10px;color:#94a3b8;margin:16px 0 0">Ky është një raport automatik javor. Për çdo paqartësi kontaktoni zyrën.</p>
</div>`;
}

/** Dërgon raportin javor te agjentët e selektuar që kanë detyrim > 0. */
export async function sendWeeklyAgentDebtReports(): Promise<void> {
  const agents = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.weeklyDebtReport, true), eq(agentsTable.status, "active")));
  if (agents.length === 0) return;

  for (const agent of agents) {
    try {
      // Rezervimet jo-të-anuluara me pagesë të mangët (pa mbipagesat: LEAST si te lista e agjentëve)
      const rows = await db
        .select({
          bookingRef: bookingsTable.bookingRef,
          pnr: bookingsTable.pnr,
          customerName: bookingsTable.customerName,
          total: bookingsTable.totalAmount,
          paid: bookingsTable.paidAmount,
          fromCity: flightsTable.fromCity,
          toCity: flightsTable.toCity,
          departureDate: flightsTable.departureDate,
          departureTime: flightsTable.departureTime,
          flightNumber: flightsTable.flightNumber,
        })
        .from(bookingsTable)
        .innerJoin(flightsTable, eq(bookingsTable.flightId, flightsTable.id))
        .where(and(
          eq(bookingsTable.agentId, agent.id),
          ne(bookingsTable.status, "cancelled"),
          sql`${bookingsTable.totalAmount}::numeric > ${bookingsTable.paidAmount}::numeric`,
        ))
        .orderBy(flightsTable.departureDate);

      const debtRows: DebtRow[] = rows.map(r => ({
        bookingRef: r.bookingRef,
        pnr: r.pnr,
        customerName: r.customerName,
        route: `${r.fromCity} → ${r.toCity}`,
        flightInfo: `${r.flightNumber} · ${r.departureDate} ${r.departureTime}`,
        total: Number(r.total),
        paid: Number(r.paid),
        due: wholeEuroDue(Number(r.total), Number(r.paid)),
      })).filter(r => r.due > 0);

      const grossDebt = debtRows.reduce((s, r) => s + r.due, 0);
      const walletBalance = Number(agent.walletBalance) || 0;
      const netDebt = Math.max(0, grossDebt - walletBalance);
      // Vetëm debitorët realë — kush s'ka detyrim (ose e mbulon portofoli) nuk merr email.
      if (netDebt <= 0 || debtRows.length === 0) continue;

      const to = [agent.email, agent.financeEmail].filter((e): e is string => !!e && e.includes("@"));
      if (to.length === 0) continue;

      const html = debtReportEmailHtml({
        agentName: agent.name,
        agentCompany: agent.company,
        rows: debtRows,
        walletBalance,
      });
      const subject = `Raport Javor Detyrimesh — €${formatWholeEuro(grossDebt)} (${debtRows.length} rezervime) — ${fmtDateAL(new Date())}`;
      await sendEmail(to.join(", "), subject, html);
      console.log(`[debt-weekly] Dërguar te ${agent.name} (${to.join(", ")}) — €${fmtMoney(grossDebt)}, ${debtRows.length} rezervime`);
    } catch (e) {
      console.error(`[debt-weekly] Dështoi për agjentin ${agent.name}:`, e);
    }
  }
}
