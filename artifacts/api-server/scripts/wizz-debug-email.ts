// Skript diagnostik: gjej email-in "Your travel itinerary: <PNR>" dhe trego
// çfarë segmentesh + pasagjerësh përmban realisht (pa ruajtur asgjë).
// Përdorimi: node --env-file=./.env dist-scripts/wizz-debug-email.mjs NN1VHZ
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseWizzairItinerary } from "../src/lib/wizzTicket.js";

const pnr = String(process.argv[2] || process.env.PNR || "").trim().toUpperCase();
if (!/^[A-Z0-9]{5,8}$/.test(pnr)) {
  console.error("Jep një PNR të vlefshëm si argument");
  process.exit(1);
}

const user = process.env.TICKET_INBOX_USER;
const pass = process.env.TICKET_INBOX_PASS;
if (!user || !pass) {
  console.error("TICKET_INBOX_USER/PASS mungojnë");
  process.exit(1);
}

const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user, pass },
  logger: false,
});

await client.connect();
await client.mailboxOpen("INBOX", { readOnly: true });
const uids = await client.search({ from: "wizzair.com", subject: pnr });
console.log(`Email-e me subjekt që përmban "${pnr}" nga wizzair.com: ${Array.isArray(uids) ? uids.length : 0}`);

for (const uid of (uids || []).slice().reverse()) {
  const msg = await client.fetchOne(String(uid), { source: true }, { uid: false });
  if (!msg || typeof msg === "boolean" || !msg.source) continue;
  const parsed = await simpleParser(msg.source);
  console.log(`\n── Email: "${parsed.subject}" | nga: ${parsed.from?.value?.[0]?.address} | data: ${parsed.date?.toISOString?.() ?? "?"}`);
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const itin = parseWizzairItinerary(html);
  if (!itin) {
    console.log("   (nuk u parsua si itinerar Wizzair) — dump diagnostik:");
    const flat = html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, "|")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .replace(/\|(\s*\|)+/g, "|");
    const dumpAround = (label: string, re: RegExp, span: number) => {
      const m = flat.match(re);
      if (!m || m.index == null) { console.log(`   [${label}] NUK u gjet`); return; }
      console.log(`   [${label}] ...${flat.slice(Math.max(0, m.index - 80), m.index + span)}...`);
    };
    dumpAround("confirmation code", /Flight confirmation code/i, 200);
    dumpAround("passenger info", /Passenger info/i, 500);
    dumpAround("GOING OUT", /GOING OUT/i, 700);
    dumpAround("Flight details", /Flight details/i, 700);
    dumpAround("Departs from", /Departs from/i, 500);
    continue;
  }
  console.log(`   PNR në email: ${itin.pnr}`);
  console.log("   Segmentet:");
  for (const l of itin.legs) {
    console.log(`     ${l.flightNumber}: ${l.fromName}(${l.fromCode}) → ${l.toName}(${l.toCode})  nisja ${l.depDate} ${l.depTime}, mbërritja ${l.arrDate} ${l.arrTime}`);
  }
  console.log("   Pasagjerët:");
  for (const p of itin.passengers) console.log(`     ${p.first} ${p.last}`);
}

await client.logout();
process.exit(0);
