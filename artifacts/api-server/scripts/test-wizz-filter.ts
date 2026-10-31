// Test lokal: verifikon filterWizzPaxForPdf mbi HTML reale të email-it.
import fs from "fs";
import { filterWizzPaxForPdf } from "../src/lib/wizzTicket.js";

const html = fs.readFileSync(process.argv[2] || "/tmp/wizz.html", "utf8");
const flat = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, "|").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");

const cases: { name: string; allowed: { firstName: string; lastName: string }[]; expectGone: string[]; expectStay: string[] }[] = [
  {
    name: "vetem Elmendina",
    allowed: [{ firstName: "Elmendina", lastName: "LJIKA" }],
    expectGone: ["Eriola", "Erion", "ERINA"],
    expectStay: ["Elmendina", "Flight details", "PQ8MMQ"],
  },
  {
    name: "emra te permbysur",
    allowed: [{ firstName: "ASANI", lastName: "Eriola" }],
    expectGone: ["Elmendina", "Erion"],
    expectStay: ["Eriola"],
  },
  {
    name: "asnje perputhje -> origjinal i paprekur",
    allowed: [{ firstName: "X", lastName: "Y" }],
    expectGone: [],
    expectStay: ["Elmendina", "Eriola", "Erion", "ERINA"],
  },
];

let fail = 0;
for (const c of cases) {
  const out = filterWizzPaxForPdf(html, c.allowed);
  const f = flat(out);
  for (const g of c.expectGone) if (f.includes(g)) { console.log(`FAIL [${c.name}]: "${g}" duhej hequr`); fail++; }
  for (const s of c.expectStay) if (!f.includes(s)) { console.log(`FAIL [${c.name}]: "${s}" duhej mbajtur`); fail++; }
  // Seat: header i zbrazur dhe pa vlera "-" në kolonën e fundit kur u filtrua
  if (c.expectGone.length > 0 && /\|\s*Seat\s*\|/.test(f.slice(f.search(/Passenger info/i), f.search(/Flight details/i)))) {
    console.log(`FAIL [${c.name}]: etiketa "Seat" duhej zbrazur`); fail++;
  }
  console.log(`${fail === 0 ? "OK" : "--"} [${c.name}]`);
}
console.log(fail === 0 ? "TE GJITHA OK" : `${fail} deshtime`);
process.exit(fail === 0 ? 0 : 1);
