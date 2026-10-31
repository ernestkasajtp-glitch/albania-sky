import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { parsePriorityEmail, priorityEmailText } from "../src/lib/priorityEmailParser.js";
import { readFileSync } from "node:fs";
const sample = `Booking details
PNR Reference
CPTEST99
Booking ID
9999999
Date and schedule
January 3rd 2027, 11:30
Flight Number
W95003
From
TIA
To
LTN
Cabin luggage
55 × 40 × 23 cm, 10kg – €30 (×1)
Luggage in the hold
0 x luggage selected
1 passenger(s)`;
assert.deepEqual(parsePriorityEmail(sample)?.items, [{price:"30",quantity:1}]);
assert.deepEqual(parsePriorityEmail(sample.replace("€30 (×1)", "€45.50 (x3)"))?.items, [{price:"45.50",quantity:3}]);
assert.deepEqual(parsePriorityEmail(sample.replace("€30 (×1)", "75,00 € (×2)"))?.items, [{price:"75,00",quantity:2}]);
assert.deepEqual(parsePriorityEmail(sample.replace("€30 (×1)", "€0 (×2)"))?.items, [{price:"0",quantity:2}]);
assert.equal(parsePriorityEmail(sample.replace("€30 (×1)", "€30 (×0)")), null);
assert.equal(parsePriorityEmail(sample.replace("55 × 40 × 23 cm, 10kg – €30 (×1)", "0 x luggage selected").replace("0 x luggage selected\n1 passenger", "€40 (×2)\n1 passenger")), null);
assert.equal(parsePriorityEmail("Cabin luggage\n€30 (×1)"), null);
assert.equal(parsePriorityEmail(sample.replace("Cabin luggage", "Other")), null);
assert.equal(parsePriorityEmail(sample.replaceAll("\n", "\r\n"))?.bookingId, "9999999");
const html = `<html><body>${sample.split("\n").map(s => `<div>${s}</div>`).join("")}</body></html>`;
const parsed = await simpleParser(Buffer.from(`From: fixture@citizenplane.com\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`));
assert.equal(parsePriorityEmail(parsed.text || "")?.items[0].quantity, 1);
console.log("PRIORITY parser: prices, quantities, zero/no cabin, hold isolation, CRLF and HTML email passed.");
const incompleteText = sample.replace(/Cabin luggage[\s\S]*?Luggage in the hold/, "Luggage in the hold");
assert.equal(parsePriorityEmail(incompleteText), null);
assert.equal(parsePriorityEmail(priorityEmailText({ text: incompleteText, html }))?.items[0].quantity, 1);
const tableHtml = `<table>${sample.split("\n").map(s => `<tr><td>${s.replaceAll("€", "&euro;").replaceAll("×", "&times;")}</td></tr>`).join("")}</table>`;
assert.equal(parsePriorityEmail(priorityEmailText({ text: incompleteText, html: tableHtml }))?.bookingId, "9999999");
assert.equal(parsePriorityEmail(priorityEmailText({ text: sample, html: false }))?.items[0].quantity, 1);
assert.equal(parsePriorityEmail(priorityEmailText({ text: "", html: tableHtml.replace("(×1)", "(×0)").replace("(&times;1)", "(&times;0)") })), null);
assert.equal(parsePriorityEmail(priorityEmailText({ text: "", html: "<p>Cabin luggage &euro;30 (&times;1)</p>" })), null);
const mime = await simpleParser(Buffer.from(`MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=test\r\n\r\n--test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${incompleteText}\r\n--test\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${tableHtml}\r\n--test--`));
assert.equal(parsePriorityEmail(priorityEmailText(mime))?.items[0].quantity, 1);
for (const file of ["src/lib/priorityHistory.ts", "src/lib/priorityEmailMonitor.ts"]) {
  const source = readFileSync(file, "utf8");
  assert.ok(source.includes("priorityEmailText(parsed)"));
  assert.ok(!/priorityEmailEnabled|admin_email_enabled|isModuleEnabled\("adminEmail"\)/.test(source));
}
console.log("PRIORITY multipart HTML, entity decoding, table fields, text fallback and independent module gates passed.");
