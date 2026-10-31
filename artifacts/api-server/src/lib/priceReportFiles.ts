// Price-change report files (Excel + PDF) for the Google price refresh.
//
// Whenever a Google price refresh (manual "Rifresko Tani", the daily 02:00
// forced refresh, or the 30-min warmer) actually rewrites at least one flight's
// sale price, we email a report with the old price, the Google price and our new
// price — plus a PDF and an Excel attachment of the same data.
//
// Pure-JS generators (exceljs + pdf-lib) so they bundle cleanly with esbuild and
// need no system binaries on the VPS. pdf-lib StandardFonts use WinAnsi (CP1252)
// which covers € and Albanian ë/ç.
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sendEmail, priceSyncEmail, type PriceSyncRow } from "./gmail.js";

export type { PriceSyncRow };

function nowLabel(): string {
  // Data si më parë; ora shfaqet 12-orëshe me AM/PM (vetëm paraqitje).
  const now = new Date();
  return now.toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane", dateStyle: "full" })
    + ", " + now.toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true });
}

function numOrNull(n: number | null | undefined): number | null {
  return n == null || isNaN(Number(n)) ? null : Number(n);
}

// ─── Excel ───────────────────────────────────────────────────────────────────
export async function buildPriceChangeExcel(rows: PriceSyncRow[], source: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ndryshimet e Çmimeve");

  ws.mergeCells("A1:H1");
  const title = ws.getCell("A1");
  title.value = `Raport Ndryshimi Çmimesh — ${source}`;
  title.font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };

  ws.mergeCells("A2:H2");
  const sub = ws.getCell("A2");
  sub.value = `${nowLabel()}  ·  Gjithsej ndryshime: ${rows.length}`;
  sub.font = { size: 10, color: { argb: "FF64748B" } };

  ws.addRow([]);

  const header = ws.addRow([
    "Rruga", "Fluturimi", "Data", "Google Vjetër", "Google Ri", "Çmimi Ynë Vjetër", "Çmimi Ynë i Ri", "Ndryshimi",
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  for (const r of rows) {
    const oldP = numOrNull(r.oldPrice);
    const newP = numOrNull(r.newPrice);
    const diff = (newP ?? 0) - (oldP ?? 0);
    const row = ws.addRow([
      r.route,
      r.flightNumber || "",
      r.departureDate || "",
      numOrNull(r.oldGooglePrice),
      numOrNull(r.googlePrice),
      oldP,
      newP,
      diff,
    ]);
    for (const ci of [4, 5, 6, 7, 8]) {
      const cell = row.getCell(ci);
      if (typeof cell.value === "number") cell.numFmt = "#,##0.00 €";
      cell.alignment = { horizontal: "right" };
    }
    const diffCell = row.getCell(8);
    diffCell.font = { bold: true, color: { argb: diff <= 0 ? "FF16A34A" : "FFDC2626" } };
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
    });
  }

  ws.columns = [
    { width: 22 }, { width: 14 }, { width: 14 },
    { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 16 },
  ];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── PDF (A4 landscape table, paginated) ─────────────────────────────────────
export async function buildPriceChangePdf(rows: PriceSyncRow[], source: string): Promise<Buffer> {
  const PW = 842, PH = 595, M = 30;
  const W = PW - 2 * M; // 782

  const pdfDoc = await PDFDocument.create();
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const c = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  // Keep € (U+20AC, WinAnsi-encodable), turn the route arrow into "->", drop other
  // non-WinAnsi chars so encodeText never throws.
  const safe = (s: string) => (s ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ") // eslint-disable-line no-control-regex
    .replace(/\u2192/g, "->")
    .replace(/[\u2012-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF\u20AC]/g, "?");

  const cols = [120, 78, 80, 96, 96, 100, 100, 100]; // sum 770 ≤ W
  const hdrs = ["Rruga", "Fluturimi", "Data", "Google Vjt.", "Google i Ri", "Yni Vjt.", "Yni i Ri", "Ndryshimi"];
  const rightCols = new Set([3, 4, 5, 6, 7]);

  let page = pdfDoc.addPage([PW, PH]);

  const drawHeader = (pg: typeof page): number => {
    pg.drawRectangle({ x: M, y: PH - M - 40, width: W, height: 40, color: c("#1E3A5F") });
    pg.drawText(safe("Raport Ndryshimi Cmimesh"), {
      x: M + 10, y: PH - M - 20, size: 14, font: fontB, color: c("#FFFFFF"),
    });
    pg.drawText(
      safe(`${source}  |  ${new Date().toLocaleDateString("sq-AL", { timeZone: "Europe/Tirane", dateStyle: "medium" })}, ${new Date().toLocaleTimeString("en-US", { timeZone: "Europe/Tirane", hour: "numeric", minute: "2-digit", hour12: true })}  |  Gjithsej: ${rows.length}`),
      { x: M + 10, y: PH - M - 34, size: 8, font: fontR, color: c("#BFDBFE") },
    );

    const thY = PH - M - 40 - 22;
    pg.drawRectangle({ x: M, y: thY, width: W, height: 18, color: c("#334155") });
    let hx = M + 4;
    hdrs.forEach((h, i) => {
      const s = safe(h);
      const x = rightCols.has(i) ? hx + cols[i] - 6 - fontB.widthOfTextAtSize(s, 8) : hx;
      pg.drawText(s, { x, y: thY + 5, size: 8, font: fontB, color: c("#FFFFFF") });
      hx += cols[i];
    });
    return thY;
  };

  let topY = drawHeader(page);
  let curY = topY;
  const rowH = 16;

  rows.forEach((r, idx) => {
    if (curY - rowH < M + 10) {
      page = pdfDoc.addPage([PW, PH]);
      topY = drawHeader(page);
      curY = topY;
    }
    const rowY = curY - rowH;
    const oldP = numOrNull(r.oldPrice);
    const newP = numOrNull(r.newPrice);
    const diff = (newP ?? 0) - (oldP ?? 0);

    if (idx % 2 === 1) {
      page.drawRectangle({ x: M, y: rowY, width: W, height: rowH, color: c("#F8FAFC") });
    }

    const cells = [
      r.route,
      r.flightNumber || "-",
      r.departureDate || "-",
      r.oldGooglePrice != null ? `${Math.round(Number(r.oldGooglePrice))} €` : "-",
      r.googlePrice != null ? `${Math.round(Number(r.googlePrice))} €` : "-",
      oldP != null ? `${Math.round(oldP)} €` : "-",
      newP != null ? `${Math.round(newP)} €` : "-",
      `${diff > 0 ? "+" : ""}${Math.round(diff)} €`,
    ];
    let cx = M + 4;
    cells.forEach((val, i) => {
      const s = safe(String(val));
      const font = i === 7 ? fontB : fontR;
      const color = i === 7 ? (diff <= 0 ? c("#16A34A") : c("#DC2626")) : c("#1E293B");
      const x = rightCols.has(i) ? cx + cols[i] - 6 - font.widthOfTextAtSize(s, 8) : cx;
      page.drawText(s, { x, y: rowY + 4, size: 8, font, color, maxWidth: cols[i] - 6 });
      cx += cols[i];
    });
    page.drawLine({ start: { x: M, y: rowY }, end: { x: M + W, y: rowY }, thickness: 0.5, color: c("#E5E7EB") });
    curY -= rowH;
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// ─── Send the full report (HTML body + PDF + Excel) ──────────────────────────
export async function sendPriceRefreshReport(rows: PriceSyncRow[], source: string): Promise<void> {
  const notifyTo = process.env.NOTIFY_EMAIL;
  if (!notifyTo || rows.length === 0) return;

  const html = priceSyncEmail(rows, source);
  const [pdf, xlsx] = await Promise.all([
    buildPriceChangePdf(rows, source),
    buildPriceChangeExcel(rows, source),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);

  await sendEmail(
    notifyTo,
    `✈ Raport Ndryshimi Çmimesh — ${rows.length} fluturime (${source})`,
    html,
    [
      { filename: `ndryshimi-cmimeve-${stamp}.pdf`, content: pdf, mimeType: "application/pdf" },
      {
        filename: `ndryshimi-cmimeve-${stamp}.xlsx`,
        content: xlsx,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  );
}
