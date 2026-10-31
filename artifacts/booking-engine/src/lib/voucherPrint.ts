import { fmtAmPm } from "@/lib/utils";

type TFunc = (key: string, opts?: any) => string;

const PAX_TYPE: Record<string, string> = { adult: "I Rritur", child: "Fëmijë", infant: "Foshnjë" };
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending: "Në Pritje", confirmed: "Konfirmuar", ticketed: "Ticketed", cancelled: "Anuluar",
};
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  draft:     { bg: "#fef3c7", fg: "#b45309" },
  pending:   { bg: "#ffedd5", fg: "#c2410c" },
  confirmed: { bg: "#dbeafe", fg: "#1d4ed8" },
  ticketed:  { bg: "#d1fae5", fg: "#047857" },
  cancelled: { bg: "#fee2e2", fg: "#b91c1c" },
};

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

export function printVoucher(booking: any, t: TFunc, lang: string) {
  const fl = booking.flight;
  const locale = lang === "en" ? "en-GB" : "sq-AL";
  const passengers: any[] = (booking.passengers ?? []).filter((p: any) => !p.cancelled);
  const sc = STATUS_COLOR[booking.status] ?? { bg: "#f3f4f6", fg: "#374151" };
  const statusLabel = t(STATUS_LABEL[booking.status] ?? booking.status);

  const dateLine = (() => {
    if (!fl?.departureDate) return "—";
    const d = new Date(fl.departureDate);
    const datePart = isNaN(d.getTime())
      ? fl.departureDate
      : d.toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "short" });
    const times = [fl.departureTime, fl.arrivalTime].filter(Boolean).map((x: any) => fmtAmPm(x)).join(" – ");
    return times ? `${datePart}, ${times}` : datePart;
  })();

  const checkedCount = passengers.filter((p: any) => p.baggageOption === "checked").length;

  const paxRows = passengers.length === 0
    ? `<div class="row"><span class="muted">${esc(t("Asnjë pasagjer"))}</span></div>`
    : passengers.map((p: any) => {
        const sub = [
          p.passportNumber ? `${esc(t("Pasaporta"))}: <span class="mono">${esc(p.passportNumber)}</span>` : "",
          p.seatNumber ? `${esc(t("Vendi"))}: ${esc(p.seatNumber)}` : "",
        ].filter(Boolean).join(" &nbsp;·&nbsp; ");
        return `<div class="row">
          <div><div class="row-title">${esc(p.firstName)} ${esc(p.lastName)}</div>${sub ? `<div class="row-sub">${sub}</div>` : ""}</div>
          <div class="muted">${esc(t(PAX_TYPE[p.type] ?? p.type))}</div>
        </div>`;
      }).join("");

  const html = `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="UTF-8"/>
<title>${esc(t("Konfirmim Rezervimi"))} – ${esc(booking.bookingRef)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #1e293b; padding: 24px; }
  .doc { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .accent { height: 6px; background: linear-gradient(90deg,#0b1f3a,#1a3a6b); }
  .inner { padding: 28px 36px 34px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  h1 { font-size: 22px; color: #0f172a; }
  .badge { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; background: ${sc.bg}; color: ${sc.fg}; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .brand .sq { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg,#0b1f3a,#1a3a6b); color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px; }
  .brand .name { font-weight: 800; color: #0b1f3a; font-size: 14px; line-height: 1.1; }
  .brand .url { font-size: 10px; color: #94a3b8; }
  .note { margin-top: 20px; display:flex; align-items:center; gap: 8px; background: #eef2ff; color: #3730a3; border-radius: 12px; padding: 10px 16px; font-size: 13px; }
  .card { margin-top: 22px; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; }
  .card .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 20px; background: #f9fafb; }
  .card .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 16px 20px; border-top: 1px solid #e5e7eb; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 4px; }
  .value { font-size: 15px; font-weight: 700; color: #111827; }
  .mono { font-family: monospace; }
  .section { margin-top: 26px; }
  .section-h { display:flex; align-items:center; gap: 8px; font-size: 15px; font-weight: 600; color: #1f2937; margin-bottom: 12px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 16px; margin-bottom: 8px; }
  .row-title { font-size: 14px; font-weight: 600; color: #111827; }
  .row-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
  .muted { font-size: 12px; color: #9ca3af; }
  @media print {
    body { background: #fff; padding: 0; }
    .doc { box-shadow: none; border-radius: 0; max-width: 100%; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="doc">
    <div class="accent"></div>
    <div class="inner">
      <div class="top">
        <div>
          <h1>${esc(t("Konfirmim Rezervimi"))}</h1>
          <div class="badge">${esc(statusLabel)}</div>
        </div>
        <div class="brand">
          <div class="sq">&#9992;</div>
          <div><div class="name">Albania Sky</div><div class="url">albaniasky.com</div></div>
        </div>
      </div>

      <div class="note">&#9432; ${esc(t("Ky dokument nuk është karta juaj e hipjes (boarding pass)."))}</div>

      <div class="card">
        <div class="grid2">
          <div><div class="label">${esc(t("Referenca e Rezervimit"))}</div><div class="value mono">${esc(booking.bookingRef)}</div></div>
          <div><div class="label">${esc(t("PNR i Linjës"))} · ${esc(t("për check-in"))}</div><div class="value mono">${esc(booking.pnr || "—")}</div></div>
        </div>
        <div class="grid3">
          <div><div class="label">${esc(t("Fluturimi"))}</div><div class="value" style="font-size:14px">&#9992; ${esc(fl?.airline)} ${esc(fl?.flightNumber)}</div></div>
          <div><div class="label">${esc(t("Rruga"))}</div><div class="value" style="font-size:14px">${esc(fl?.fromCity)} &#8594; ${esc(fl?.toCity)}</div></div>
          <div><div class="label">${esc(t("Data"))}</div><div class="value" style="font-size:14px">${esc(dateLine)}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-h">&#128100; ${esc(t("Kush udhëton?"))}</div>
        ${paxRows}
      </div>

      <div class="section">
        <div class="section-h">&#129523; ${esc(t("Bagazhi"))}</div>
        <div class="row"><div class="row-title">${esc(t("Bagazh kabine"))}</div><div class="muted">${fl?.cabinBaggageKg ? `${esc(fl.cabinBaggageKg)} Kg` : esc(t("Përfshirë"))}</div></div>
        <div class="row"><div class="row-title">${checkedCount} × ${esc(t("Bagazh i Regjistruar"))}</div><div class="muted">${fl?.checkedBaggageKg ? `${esc(fl.checkedBaggageKg)} Kg` : "—"}</div></div>
      </div>
    </div>
  </div>
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
