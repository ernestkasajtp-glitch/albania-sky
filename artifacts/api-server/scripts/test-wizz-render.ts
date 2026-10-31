// Test në VPS: rendero PDF nga HTML reale me filtrim pax + pa numër sedile.
import fs from "fs";
import { filterWizzPaxForPdf, renderEmailHtmlToPdf } from "../src/lib/wizzTicket.js";

const html = fs.readFileSync(process.argv[2] || "/tmp/wizz-PQ8MMQ.html", "utf8");
const allowed = [{ firstName: "Elmendina", lastName: "LJIKA" }];
const pdf = await renderEmailHtmlToPdf(html, allowed);
fs.writeFileSync("/tmp/test-filtered.pdf", pdf);
console.log(`OK /tmp/test-filtered.pdf (${pdf.length} bytes)`);
// kontroll i shpejtë i filtrit në nivel HTML
const f = filterWizzPaxForPdf(html, allowed).replace(/<[^>]+>/g, "|");
console.log("Eriola ne HTML e filtruar?", f.includes("Eriola"));
process.exit(0);
