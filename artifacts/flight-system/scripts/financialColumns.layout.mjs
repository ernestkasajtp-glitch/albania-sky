// Render the real financial header/cell JSX with synthetic four-digit values.
// Uses the running dev app's CSS/fonts, without signing in or altering app data.
import { createRequire } from "node:module";
import fs from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { BOOKING_COLUMNS, BOOKING_FINANCIAL_WIDTHS as widths } from "../src/lib/bookingColumns.ts";

const require = createRequire(new URL("../package.json", import.meta.url));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ArrowUp, ArrowDown, ArrowUpDown } = require("lucide-react");
const store = new URL("../../../node_modules/.pnpm/", import.meta.url);
const playwright = fs.readdirSync(store).find(name => name.startsWith("playwright-core@"));
if (!playwright) throw new Error("playwright-core is required for this layout check.");
const { chromium } = await import(new URL(`${playwright}/node_modules/playwright-core/index.mjs`, store));
const source = fs.readFileSync(new URL("../src/pages/bookings-premium.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("table.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let header, tableClass;
const cells = {};
function visit(node) {
  if (ts.isJsxElement(node)) {
    const tag = node.openingElement.tagName.getText(ast), text = node.getText(ast);
    if (tag === "th" && text.includes("key={k}")) header = text;
    if (tag === "td") {
      const key = text.match(/^<td hidden=\{!isColumnVisible\("([^"]+)"\)\}/)?.[1];
      if (widths[key]) cells[key] = text;
    }
    if (tag === "table") tableClass = node.openingElement.attributes.properties
      .find(attribute => attribute.name?.getText(ast) === "className").initializer.text;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const base = {
  React, ArrowUp, ArrowDown, ArrowUpDown, active: false, sortDir: "asc",
  BookingColumnResize: () => null, columnState: { disabled: false, resize: () => {} },
  toggleSort: () => {}, compact: false, financial: true,
  isColumnVisible: () => true, fmt: value => String(Math.round(Number(value))),
};
function render(code, variables) {
  const env = { ...base, ...variables };
  const js = ts.transpileModule(`(${code})`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return renderToStaticMarkup(Function(...Object.keys(env), "return " + js)(...Object.values(env)));
}
const values = [
  { total: 9999, paid: 0, due: 9999, netoRaw: 9999, comm: 9999, hasNeto: true, b: { status: "confirmed", creditAmount: 9999 } },
  { total: -9999, paid: 9999, due: 0, netoRaw: 9999, comm: -9999, hasNeto: true, b: { status: "confirmed", creditAmount: 9999 } },
  { total: 150, paid: 150, due: 0, netoRaw: 0, comm: 0, hasNeto: false, b: { status: "cancelled", creditAmount: 0 } },
];
const browser = await chromium.launch({
  executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
  headless: true, args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await Promise.all(["600 10px Inter", "600 14px Inter", "700 14px Inter"].map(font => document.fonts.load(font)));
    if (!Array.from(document.fonts).some(font => font.family.includes("Inter") && font.status === "loaded"))
      throw new Error("Inter did not load.");
  });
  for (const viewport of [768, 1280, 1920]) {
    await page.setViewportSize({ width: viewport, height: 700 });
    for (const keys of [Object.keys(widths), ["financa", "neto", "commission", "due"], ["neto"]]) {
      const columns = BOOKING_COLUMNS.filter(column => keys.includes(column.k));
      const heads = columns.map(column => render(header, { ...column, financialWidth: widths[column.k] })).join("");
      const rows = values.map(value => "<tr>" + columns.map(column => render(cells[column.k], value)).join("") + "</tr>").join("");
      await page.evaluate(html => { document.body.innerHTML = html; },
        `<div style="width:100%;overflow:auto"><table class="${tableClass}"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`);
      const actual = await page.evaluate(() => ({
        widths: [...document.querySelectorAll("th")].map(cell => cell.getBoundingClientRect().width),
        overflow: [...document.querySelectorAll("td,th")].filter(cell => cell.scrollWidth > cell.clientWidth + 1).length,
      }));
      assert.deepEqual(actual.widths, columns.map(column => widths[column.k]), `${viewport}: ${keys}`);
      assert.equal(actual.overflow, 0);
      console.log(`PASS ${viewport}px / ${keys}: ${actual.widths.join(",")}px`);
    }
  }
} finally {
  await browser.close();
}