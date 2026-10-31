import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { logger } from "./logger.js";
import { importCpBookingsFromText, buildLuggageMap, type ImportResult } from "./pnlImport.js";
import { isModuleEnabled } from "./moduleControls.js";

// Parse plain-text email body for Priority (10kg cabin luggage) mention
// Pattern: "1x, 10kg" or "1x, 10 kg" with quantity > 0
function bodyHasPriorityLuggage(body: string): boolean {
  const match = body.match(/(\d+)\s*x[,\s]+10\s*kg/i);
  if (match && parseInt(match[1], 10) > 0) return true;
  // Also check HTML body stripped of tags
  const stripped = body.replace(/<[^>]*>/g, " ");
  const match2 = stripped.match(/(\d+)\s*x[,\s]+10\s*kg/i);
  return !!(match2 && parseInt(match2[1], 10) > 0);
}

interface EmailImportConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromFilter?: string;
}

function getEmailConfig(): EmailImportConfig | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return {
    host: "imap.gmail.com",
    port: 993,
    user,
    pass,
    fromFilter: process.env.CITIZENPLANE_EMAIL_FROM || "citizenplane.com",
  };
}

export async function runCitizenPlaneEmailImport(automatic = false): Promise<ImportResult> {
  const result: ImportResult = { ok: true, filesProcessed: 0, bookingsCreated: 0, bookingsSkipped: 0, errors: [] };

  const config = getEmailConfig();
  if (!config) {
    logger.warn("Email Import: SMTP_USER/SMTP_PASS mungojnë, duke anashkaluar import email");
    return result;
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  try {
    await client.connect();
    logger.info({ user: config.user }, "Email Import: u lidh me Gmail IMAP");

    await client.mailboxOpen("INBOX");

    // Search for emails with CSV attachments from CitizenPlane since Jan 2026
    // FORCE_ALL_EMAILS=1 → process all emails (read + unread), used after full re-import
    const forceAll = process.env.FORCE_ALL_EMAILS === "1";
    const searchCriteria: any = { since: new Date("2025-10-01") };
    if (!forceAll) searchCriteria.unseen = true;
    if (config.fromFilter) {
      searchCriteria.from = config.fromFilter;
    }

    const messages = (await client.search(searchCriteria)) || [];
    if (messages.length === 0) {
      logger.debug("Email Import: nuk ka emaile të reja nga importi Offline");
      await client.logout();
      return result;
    }

    logger.info({ count: messages.length }, "Email Import: duke procesuar emaile");

    for (const uid of messages) {
      if (automatic && !(await isModuleEnabled("offlineFlights"))) break;
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: false });
        if (!msg || typeof msg === "boolean" || !msg.source) continue;

        const parsed = await simpleParser(msg.source);

        const allAttachments = parsed.attachments || [];

        // Find PNL CSV attachments (pnl_*.csv)
        const pnlAttachments = allAttachments.filter(att => {
          const name = String(att.filename ?? "").toLowerCase();
          return name.endsWith(".csv") && name.startsWith("pnl_") && !!att.content;
        });

        // Find luggage CSV attachments (luggages_*.csv)
        const luggageCsvTexts = allAttachments
          .filter(att => {
            const name = String(att.filename ?? "").toLowerCase();
            return name.endsWith(".csv") && name.startsWith("luggages_") && !!att.content;
          })
          .map(att => att.content!.toString("utf-8"));

        // Build luggage map from all luggage files in this email
        const luggageMap = luggageCsvTexts.length > 0 ? buildLuggageMap(luggageCsvTexts) : undefined;

        // Check email body (plain text) for Priority 10kg mention
        const bodyText = parsed.text || "";
        const hasPriority = bodyHasPriorityLuggage(bodyText);
        if (hasPriority) {
          logger.info({ subject: parsed.subject }, "Email Import: Priority 10kg u gjet në body");
        }

        if (pnlAttachments.length === 0) {
          // Mark as seen even if no CSV — don't re-process
          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
          continue;
        }

        for (const att of pnlAttachments) {
          // Leave this message unread when interrupted; the next enabled run
          // will safely deduplicate any bookings already imported.
          if (automatic && !(await isModuleEnabled("offlineFlights"))) break;
          const csvText = att.content!.toString("utf-8");
          const fileName = String(att.filename || `email_pnl_${uid}.csv`);

          logger.info({ fileName, subject: parsed.subject }, "Email Import: duke procesuar CSV");

          try {
            const subResult = await importCpBookingsFromText(csvText, fileName, luggageMap, hasPriority);
            result.filesProcessed++;
            result.bookingsCreated += subResult.bookingsCreated;
            result.bookingsSkipped += subResult.bookingsSkipped;
            result.errors.push(...subResult.errors);
            if (subResult.failedFileRaw && Object.keys(subResult.failedFileRaw).length > 0) {
              result.failedFileRaw = { ...(result.failedFileRaw ?? {}), ...subResult.failedFileRaw };
            }
          } catch (err: any) {
            logger.error({ err, fileName }, "Email Import: gabim gjatë importimit të CSV");
            result.errors.push(`${fileName}: ${err.message}`);
            result.filesProcessed++;
          }
        }

        // Mark email as read after processing
        if (automatic && !(await isModuleEnabled("offlineFlights"))) break;
        await client.messageFlagsAdd(String(uid), ["\\Seen"]);

      } catch (err: any) {
        logger.error({ err, uid }, "Email Import: gabim gjatë leximit të emailit");
        result.errors.push(`Email UID ${uid}: ${err.message}`);
      }
    }

    await client.logout();
  } catch (err: any) {
    logger.error({ err }, "Email Import: gabim lidhje IMAP");
    result.ok = false;
    result.errors.push(`IMAP lidhje dështoi: ${err.message}`);
    try { await client.logout(); } catch {}
  }

  return result;
}
