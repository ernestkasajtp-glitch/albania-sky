// Exercise the real PDF handler with synthetic data, including optional columns.
import fs from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fitPdfCellToOneLine } from "../src/lib/pdfSingleLine.ts";

const require = createRequire(new URL("../package.json", import.meta.url));
const { jsPDF } = require("jspdf");
const { autoTable } = require("jspdf-autotable");
const source = fs.readFileSync(new URL("../src/pages/bookings-premium.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let code;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleExportPdf")
    code = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const exportRows = Array.from({ length: 65 }, (_, index) => ({
  created: "03/10/2026 1:13 PM", ref: "KTF3038", pnr: "UVK8UE", cp: "CPQP37PP",
  client: index === 1 ? "ALEXANDER LONGSURNAME EXAMPLE" : "SAMPLE PASSENGER",
  agency: index === 2 ? "ONLINE TRAVEL AGENCY INTERNATIONAL" : "SAMPLE TRAVEL",
  from: "TIA", to: "HAM", flightDate: "04/01/2027", pax: 5,
  total: 9999, paid: 150, due: 9849, comm: index === 2 ? -500 : 88, status: "Ticketed",
}));
for (const hasCpCol of [false, true]) for (const canCommissionCol of [false, true]) {
  let doc;
  function PDF(options) {
    doc = new jsPDF(options);
    doc.save = () => {};
    return doc;
  }
  const checkedTable = (document, options) => {
    autoTable(document, options);
    const table = document.lastAutoTable;
    assert.equal(table.columns.length, 14 + Number(hasCpCol) + Number(canCommissionCol));
    for (const row of [...table.head, ...table.body, ...table.foot]) {
      assert.ok(Math.abs(row.height - 6.2) < 0.01);
      for (const cell of Object.values(row.cells)) {
        assert.equal(cell.text.length, 1);
        assert.ok(cell.x + cell.width <= 287.2);
        if (!cell.text[0]) continue;
        document.setFont(cell.styles.font, cell.styles.fontStyle);
        document.setFontSize(cell.styles.fontSize);
        assert.ok(document.getTextWidth(cell.text[0]) <= cell.width - cell.padding("horizontal") + 0.3);
      }
    }
    const timeIndex = hasCpCol ? 9 : 8;
    assert.equal(table.head[0].cells[timeIndex].text[0], "Ora Flut.");
    assert.equal(table.body[0].cells[timeIndex].text[0], "12:55");
    assert.equal(table.body[1].cells[timeIndex].text[0], "—");
    assert.equal(table.foot[0].cells[timeIndex + 1].text[0], "325");
    assert.equal(table.foot[0].cells[timeIndex + 2].text[0], "649935");
    assert.equal(table.foot[0].cells[timeIndex + 3].text[0], "9750");
    assert.equal(table.foot[0].cells[timeIndex + 4].text[0], "640185");
  };
  const env = {
    setExportMenuOpen: () => {}, format: () => "2026-10-03", jsPDF: PDF,
    fmtDateTimeAmPm: () => "03/10/2026 4:48 PM", exportRows,
    sortedBookings: exportRows.map((_, i) => ({ flight: { departureTime: i === 1 ? null : "12:55" } })),
    fmtAmPm: value => value, fmt: value => String(Math.round(value)),
    hasCpCol, canCommissionCol, autoTable: checkedTable, fitPdfCellToOneLine,
  };
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/;\s*$/, "");
  Function(...Object.keys(env), `return (${js})`)(...Object.values(env))();
  if (hasCpCol && canCommissionCol)
    fs.writeFileSync("/tmp/booking-report-preview.pdf", Buffer.from(doc.output("arraybuffer")));
  console.log("PASS: single-line PDF, full text, time, equal row heights, totals, page bounds", {
    hasCpCol, canCommissionCol, pages: doc.getNumberOfPages(),
  });
}