// Diagnostik: ruaj HTML-në e email-it të itinerarit për një PNR në /tmp/wizz-<PNR>.html
// Përdorimi: node --env-file=./.env dist-scripts/dump-wizz-html.mjs PQ8MMQ
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "fs";

const pnr = String(process.argv[2] || "").trim().toUpperCase();
if (!/^[A-Z0-9]{5,8}$/.test(pnr)) { console.error("Jep PNR"); process.exit(1); }
const user = process.env.TICKET_INBOX_USER;
const pass = (process.env.TICKET_INBOX_PASS || "").replace(/\s+/g, "");
if (!user || !pass) { console.error("TICKET_INBOX_USER/PASS mungojnë"); process.exit(1); }

const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
await client.connect();
await client.mailboxOpen("INBOX", { readOnly: true });
const uids = await client.search({ from: "wizzair.com", subject: pnr });
for (const uid of (uids || []).slice().reverse()) {
  const msg = await client.fetchOne(String(uid), { source: true }, { uid: false });
  if (!msg || typeof msg === "boolean" || !msg.source) continue;
  const parsed = await simpleParser(msg.source);
  if (!/travel itinerary|reiseroute/i.test(parsed.subject || "")) continue;
  const html = typeof parsed.html === "string" ? parsed.html : "";
  fs.writeFileSync(`/tmp/wizz-${pnr}.html`, html);
  console.log(`OK /tmp/wizz-${pnr}.html (${html.length} bytes) subjekt: ${parsed.subject}`);
  break;
}
await client.logout();
process.exit(0);
