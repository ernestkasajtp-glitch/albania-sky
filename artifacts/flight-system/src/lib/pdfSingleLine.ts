import type jsPDF from "jspdf";
import type { CellHookData } from "jspdf-autotable";

/** Preserve complete values; fit before AutoTable calculates line wrapping. */
export function fitPdfCellToOneLine(doc: jsPDF, data: CellHookData) {
  const cell = data.cell;
  const text = cell.text.join(" ").replace(/\s+/g, " ").trim();
  cell.text = [text];
  const available = Number(cell.styles.cellWidth) - cell.padding("horizontal");
  if (!(available > 0) || !text) return;
  doc.setFont(cell.styles.font, cell.styles.fontStyle);
  doc.setFontSize(cell.styles.fontSize);
  const measured = doc.getTextWidth(text);
  if (measured > available) cell.styles.fontSize *= (available - 0.2) / measured;
  cell.styles.overflow = "visible";
}