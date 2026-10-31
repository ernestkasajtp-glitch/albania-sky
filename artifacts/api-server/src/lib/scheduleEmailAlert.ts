// Njoftimet e ndryshimit të fluturimit nga email-i.
//
// Kompania ajrore dërgon email me subjektin "Important changes to your flight"
// kur një fluturim ndryshon. Ky skaner (thirret nga i njëjti cikël 30-minutësh
// i kontrollit të biletave) kërkon në inbox-in e biletave (TICKET_INBOX_USER/PASS)
// email-e të tillë, nxjerr PNR-të nga trupi i email-it dhe i krahason me PNR-të
// e sistemit (bookings.pnr + passengers.pnr + PNR-të e grupeve). Kur gjendet
// përputhje:
//   - email-i ruhet si PDF te rezervimi (uploads/alerts/…)
//   - krijohet një rresht në booking_email_alerts (alarmi i kuq në listë)
//   - lihet gjurmë në Historikun e rezervimit
// Çdo email përpunohet VETËM NJË herë (dedupe me Message-ID).
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  db, bookingsTable, passengersTable, bookingChangeLogsTable,
  bookingEmailAlertsTable, groupTicketSalesTable, groupTicketsTable,
} from "@workspace/db";
import { logger } from "./logger.js";
import { getInboxConfig, renderEmailHtmlToPdf, extractPnrTokens } from "./wizzTicket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const alertsUploadDir = path.join(__dirname, "..", "uploads", "alerts");

const SUBJECT_MARKER = "Important changes to your flight";
// Sa ditë prapa kontrollohen email-et (mjafton — çdo email dedupohet me Message-ID)
const LOOKBACK_DAYS = 30;

/**
 * Gjen, me një grup kërkimesh për skanim, rezervimet që kanë secilin PNR.
 * bookings.pnr verifikohet përsëri lokalisht sepse është fushë e lirë.
 */
async function findBookingIdsForPnrs(pnrs: Iterable<string>): Promise<Map<string, Set<number>>> {
  const tokens = [...new Set([...pnrs].map(pnr => pnr.trim().toUpperCase()))];
  const tokenSet = new Set(tokens);
  const idsByPnr = new Map(tokens.map(pnr => [pnr, new Set<number>()]));
  const add = (pnr: string | null, bookingId: number | null) => {
    const token = (pnr || "").trim().toUpperCase();
    if (bookingId != null && tokenSet.has(token)) idsByPnr.get(token)!.add(bookingId);
  };
  if (tokens.length === 0) return idsByPnr;

  // bookings.pnr — fushë e lirë, mund të përmbajë disa token-e
  const bkRows = await db.select({ id: bookingsTable.id, pnr: bookingsTable.pnr })
    .from(bookingsTable)
    .where(isNotNull(bookingsTable.pnr));
  for (const r of bkRows) {
    for (const token of extractPnrTokens(r.pnr)) add(token, r.id);
  }

  // passengers.pnr
  const paxRows = await db.select({ bookingId: passengersTable.bookingId, pnr: passengersTable.pnr })
    .from(passengersTable)
    .where(inArray(sql<string>`UPPER(TRIM(${passengersTable.pnr}))`, tokens));
  for (const r of paxRows) add(r.pnr, r.bookingId);

  // PNR grupi (pnr_new / pnr_original) → bookingPassengerId → rezervimi
  const saleRows = await db.select({
    pnrNew: groupTicketSalesTable.pnrNew,
    pnrOriginal: groupTicketsTable.pnrOriginal,
    bookingId: passengersTable.bookingId,
  })
    .from(groupTicketSalesTable)
    .leftJoin(groupTicketsTable, eq(groupTicketSalesTable.groupTicketId, groupTicketsTable.id))
    .leftJoin(passengersTable, eq(groupTicketSalesTable.bookingPassengerId, passengersTable.id))
    .where(or(
      inArray(sql<string>`UPPER(TRIM(COALESCE(${groupTicketSalesTable.pnrNew}, '')))`, tokens),
      inArray(sql<string>`UPPER(TRIM(COALESCE(${groupTicketsTable.pnrOriginal}, '')))`, tokens),
    ));
  for (const r of saleRows) {
    add(r.pnrNew, r.bookingId);
    add(r.pnrOriginal, r.bookingId);
  }

  return idsByPnr;
}

let scanRunning = false;

/**
 * Skanon inbox-in për email-e "Important changes to your flight" dhe krijon
 * njoftime për rezervimet përkatëse. E sigurt fire-and-forget.
 */
export async function scanScheduleChangeEmails(): Promise<void> {
  if (scanRunning) return;
  const config = getInboxConfig();
  if (!config) return;
  scanRunning = true;
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // Dedupe për ÇIFT (bookingId, messageId) — jo vetëm messageId, që një ndërprerje
    // në mes të përpunimit të mos lërë rezervime të tjera pa njoftim.
    const known = await db.select({
      bookingId: bookingEmailAlertsTable.bookingId,
      messageId: bookingEmailAlertsTable.messageId,
      pdfUrl: bookingEmailAlertsTable.pdfUrl,
    }).from(bookingEmailAlertsTable);
    const knownPairs = new Set(known.map(r => `${r.messageId}|${r.bookingId}`));
    // PDF ekzistuese për messageId (ripërdoret për çifte të reja të të njëjtit email)
    const existingPdfByMsg = new Map<string, string>();
    for (const r of known) if (r.pdfUrl) existingPdfByMsg.set(r.messageId, r.pdfUrl);

    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });

    type Hit = { messageId: string; subject: string; date: Date | null; html: string; pnrs: string[] };
    const hits: Hit[] = [];
    try {
      await client.connect();
      await client.mailboxOpen("INBOX", { readOnly: true });
      const uids = await client.search({ subject: SUBJECT_MARKER, since });
      if (Array.isArray(uids) && uids.length > 0) {
        // nga më i riu — maksimum 40 email-e për cikël
        for (const uid of uids.slice().reverse().slice(0, 40)) {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: false });
          if (!msg || typeof msg === "boolean" || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const subject = parsed.subject || "";
          if (!new RegExp(SUBJECT_MARKER, "i").test(subject)) continue;
          const messageId = String(parsed.messageId || "").trim();
          if (!messageId) continue;
          const html = typeof parsed.html === "string" ? parsed.html : "";
          const text = parsed.text || "";
          // PNR-të: nga subjekti + trupi (token 6-shkronjësh me të paktën një shkronjë)
          const pnrs = [...new Set([...extractPnrTokens(subject), ...extractPnrTokens(html.replace(/<[^>]+>/g, " ")), ...extractPnrTokens(text)])];
          if (pnrs.length === 0) continue;
          hits.push({ messageId, subject, date: parsed.date ?? null, html: html || `<pre>${text}</pre>`, pnrs });
        }
      }
      await client.logout();
    } catch (imapErr) {
      try { await client.logout(); } catch { /* ignore */ }
      logger.error({ err: imapErr }, "ScheduleEmailAlert: gabim IMAP");
      return;
    }

    // Të gjithë PNR-të mblidhen para lookup-ut: email-et e njohura nuk
    // anashkalohen, që rezervimet e reja të të njëjtit Message-ID të gjenden.
    const bookingIdsByPnr = await findBookingIdsForPnrs(hits.flatMap(hit => hit.pnrs));
    const matchesByHit = hits.map(hit => {
      const matched = new Map<number, string>(); // bookingId → pnr
      for (const pnr of hit.pnrs) {
        for (const id of bookingIdsByPnr.get(pnr) ?? []) {
          if (!matched.has(id)) matched.set(id, pnr);
        }
      }
      return matched;
    });
    const candidateBookingIds = new Set<number>();
    for (const matched of matchesByHit) {
      for (const bookingId of matched.keys()) candidateBookingIds.add(bookingId);
    }
    // Referencat nevojiten vetëm për emrin e PDF-së; i ngarkojmë një herë.
    const bookingRefsById = new Map<number, string>();
    if (candidateBookingIds.size > 0) {
      const bookingRows = await db.select({ id: bookingsTable.id, bookingRef: bookingsTable.bookingRef })
        .from(bookingsTable)
        .where(inArray(bookingsTable.id, [...candidateBookingIds]));
      for (const booking of bookingRows) bookingRefsById.set(booking.id, booking.bookingRef);
    }

    for (const [hitIndex, hit] of hits.entries()) {
      // Gjej rezervimet që kanë ndonjë nga PNR-të e email-it
      const matched = matchesByHit[hitIndex];
      // Vetëm çiftet e reja (rezervim, email) — të tjerat janë përpunuar tashmë
      for (const bookingId of [...matched.keys()]) {
        if (knownPairs.has(`${hit.messageId}|${bookingId}`)) matched.delete(bookingId);
      }
      if (matched.size === 0) continue;

      // Rendero PDF-në një herë për email (ripërdor atë ekzistues nëse ka)
      const existingPdf = existingPdfByMsg.get(hit.messageId) ?? null;
      let pdfBuf: Buffer | null = null;
      if (!existingPdf) {
        try {
          pdfBuf = await renderEmailHtmlToPdf(hit.html);
        } catch (err) {
          logger.error({ err, messageId: hit.messageId }, "ScheduleEmailAlert: PDF s'u gjenerua dot — njoftimi krijohet pa PDF");
        }
      }

      let sharedPdfUrl: string | null = existingPdf;
      for (const [bookingId, pnr] of matched) {
        const bookingRef = bookingRefsById.get(bookingId);
        if (!bookingRef) continue;

        // PDF ruhet NJË herë për email dhe shërbehet VETËM me auth
        // (rruga /api/bookings/:id/email-alerts/pdf/:file — jo static publik).
        if (!sharedPdfUrl && pdfBuf) {
          try {
            fs.mkdirSync(alertsUploadDir, { recursive: true });
            const safeRef = bookingRef.replace(/[^A-Za-z0-9-]/g, "");
            const fileName = `${safeRef}-ndryshim-${Date.now()}.pdf`;
            fs.writeFileSync(path.join(alertsUploadDir, fileName), pdfBuf);
            sharedPdfUrl = `/api/uploads/alerts/${fileName}`;
            existingPdfByMsg.set(hit.messageId, sharedPdfUrl);
          } catch (err) {
            logger.error({ err, bookingId }, "ScheduleEmailAlert: ruajtja e PDF-së dështoi");
          }
        }
        const pdfUrl = sharedPdfUrl;

        await db.insert(bookingEmailAlertsTable).values({
          bookingId,
          pnr,
          messageId: hit.messageId,
          subject: hit.subject,
          emailDate: hit.date,
          pdfUrl,
        }).onConflictDoNothing();
        knownPairs.add(`${hit.messageId}|${bookingId}`);

        await db.insert(bookingChangeLogsTable).values({
          bookingId,
          userId: null,
          userName: "Sistemi",
          userRole: null,
          action: "updated",
          fieldName: "Njoftim ndryshimi fluturimi",
          oldValue: null,
          newValue: pnr,
          note: `Erdhi email "${hit.subject}" me PNR ${pnr} — email-i u ruajt si PDF te rezervimi`,
          // updatedAt i rezervimit NUK preket (shkrim metadata)
        }).catch(() => {});

        logger.info({ bookingId, pnr, messageId: hit.messageId, pdfUrl }, "ScheduleEmailAlert: njoftim i ri ndryshimi");
      }
    }
  } catch (err) {
    logger.error({ err }, "ScheduleEmailAlert: skanimi dështoi");
  } finally {
    scanRunning = false;
  }
}
