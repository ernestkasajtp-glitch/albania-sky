import { db, bookingsTable, agentsTable } from "@workspace/db";
import { and, eq, ilike, gte, lt } from "drizzle-orm";
import { getFullBooking } from "../src/routes/bookings.js";
import { generateBookingConfirmationPdf } from "../src/lib/invoicePdf.js";
import { agentBookingEmail, sendEmail } from "../src/lib/gmail.js";

type BookingStatus = "draft" | "pending" | "confirmed" | "ticketed" | "cancelled";
const KNOWN: BookingStatus[] = ["draft", "pending", "confirmed", "ticketed", "cancelled"];

const AGENT_MATCH = process.env.AGENCY_MATCH || "%771%";
const AGENT_ID = process.env.AGENT_ID ? Number(process.env.AGENT_ID) : null;
const OURS = (process.env.STATUS_EMAIL_ADMIN || "booking@albaniasky.com").trim().toLowerCase();
const TZ = process.env.TZ_NAME || "Europe/Tirane";

// Offset i zonës (në minuta) për një instant të dhënë — trajton saktë DST (verë/dimër).
function tzOffsetMinutes(date: Date, tz: string): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(date).find(p => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = s.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? "0", 10));
}

// Intervali [00:00, 24:00) i ditës lokale të zonës TZ, i kthyer në UTC.
function localDayUtcRange(tz: string): { start: Date; end: Date } {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now); // YYYY-MM-DD
  const offsetMin = tzOffsetMinutes(now, tz); // p.sh. 120 në verë, 60 në dimër
  const startMs = Date.parse(`${ymd}T00:00:00.000Z`) - offsetMin * 60_000;
  const start = new Date(startMs);
  const end = new Date(startMs + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function main() {
  const agents = await db
    .select({ id: agentsTable.id, name: agentsTable.name, email: agentsTable.email })
    .from(agentsTable)
    .where(AGENT_ID != null ? eq(agentsTable.id, AGENT_ID) : ilike(agentsTable.name, AGENT_MATCH));
  // Përzgjedhje deterministike: kërko saktësisht 1 agjent (përdor AGENT_ID nëse ka).
  if (agents.length !== 1) {
    console.error(`Pritej saktësisht 1 agjent, u gjetën ${agents.length} (filtri: ${AGENT_ID != null ? `id=${AGENT_ID}` : `name~'${AGENT_MATCH}'`}). Vendos AGENT_ID.`);
    process.exit(1);
  }
  const agent = agents[0]!;
  const agencyEmail = (agent.email || "").trim().toLowerCase();
  console.log(`Agjenti: #${agent.id} ${agent.name} <${agencyEmail || "PA EMAIL"}>`);

  const { start, end } = localDayUtcRange(TZ);
  const rows = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.agentId, agent.id),
      gte(bookingsTable.createdAt, start),
      lt(bookingsTable.createdAt, end),
    ))
    .orderBy(bookingsTable.id);

  console.log(`Rezervime sot: ${rows.length}`);

  const recipients = Array.from(new Set([agencyEmail, OURS].filter(Boolean)));
  if (recipients.length === 0) {
    console.error("Asnjë marrës (agjensia pa email dhe pa STATUS_EMAIL_ADMIN).");
    process.exit(1);
  }
  console.log(`Marrës: ${recipients.join(", ")}`);

  const DRY = process.env.DRY_RUN === "1";
  if (DRY) console.log("== DRY_RUN: nuk dërgohet asnjë email ==");

  let ok = 0, fail = 0;
  for (const { id } of rows) {
    try {
      const full: any = await getFullBooking(id);
      if (!full) { console.warn(`#${id}: s'u gjet`); fail++; continue; }
      const status: BookingStatus = KNOWN.includes(full.status) ? full.status : "confirmed";
      if (DRY) { console.log(`#${id} ${full.bookingRef} [${status}] → do dërgohej te ${recipients.join(", ")}`); ok++; continue; }
      const SUBJECTS: Record<BookingStatus, string> = {
        draft:     `Booking Update: ${full.bookingRef}`,
        pending:   `Booking Pending: ${full.bookingRef}`,
        confirmed: `Booking Confirmation: ${full.bookingRef}`,
        ticketed:  `Ticket Issued: ${full.bookingRef}`,
        cancelled: `Booking Cancelled: ${full.bookingRef}`,
      };
      const FILES: Record<BookingStatus, string> = {
        draft:     `${full.bookingRef}-booking.pdf`,
        pending:   `${full.bookingRef}-booking.pdf`,
        confirmed: `${full.bookingRef}-confirmation.pdf`,
        ticketed:  `${full.bookingRef}-ticket.pdf`,
        cancelled: `${full.bookingRef}-cancellation.pdf`,
      };
      const html = agentBookingEmail(full, status);
      let pdf: Buffer | null = null;
      try { pdf = await generateBookingConfirmationPdf(full, status); } catch (e) { pdf = null; }
      for (const to of recipients) {
        if (pdf) {
          await sendEmail(to, SUBJECTS[status], html, [{ filename: FILES[status], content: pdf, mimeType: "application/pdf" }]);
        } else {
          await sendEmail(to, SUBJECTS[status], html);
        }
      }
      console.log(`#${id} ${full.bookingRef} [${status}] → dërguar`);
      ok++;
    } catch (e) {
      console.error(`#${id}: gabim`, e);
      fail++;
    }
  }
  console.log(`PËRFUNDOI: ok=${ok} fail=${fail}`);
  process.exit(fail > 0 ? 2 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
