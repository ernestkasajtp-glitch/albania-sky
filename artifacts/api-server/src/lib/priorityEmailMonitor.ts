import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, settingsTable, cpImportAlertsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { reportOperationalFailure } from "./operationalFailures.js";
import { parsePriorityEmail, priorityEmailText } from "./priorityEmailParser.js";

let running = false;

export async function storePriorityEmail(account: string, identity: string, text: string, database = db) {
  const result = parsePriorityEmail(text);
  if (!result) return "ignored" as const;
  const source = `priority:${createHash("sha256").update(`${account}:${identity}`).digest("hex")}`;
  return database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${source}))`);
    const [old] = await tx.select({ id: cpImportAlertsTable.id }).from(cpImportAlertsTable).where(eq(cpImportAlertsTable.source, source)).limit(1);
    if (old) return "existing" as const;
    await tx.insert(cpImportAlertsTable).values({
      kind: "booking", source, cpCode: result.reference,
      reason: `PRIORITY — Bagazh kabine\nReferenca: ${result.reference} · Booking ID: ${result.bookingId}\n${result.flight} · ${result.from} → ${result.to}\nNisja: ${result.date}\n${result.items.map(i => `Cabin luggage: ${i.quantity} × €${i.price}`).join("\n")}`,
    });
    return "created" as const;
  });
}
async function tick() {
  if (running) return;
  running = true;
  let client: ImapFlow | undefined;
  try {
    const user = process.env.ADMIN_INBOX_USER?.trim();
    const pass = process.env.ADMIN_INBOX_PASS?.replace(/\s+/g, "");
    if (!user || !pass) throw new Error("Kutia e postës për PRIORITY nuk është konfiguruar (ADMIN_INBOX_USER/PASS).");
    client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true,
      auth: { user, pass }, logger: false, connectionTimeout: 20_000, socketTimeout: 60_000 });
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
    const account = createHash("sha256").update(user.toLowerCase()).digest("hex").slice(0, 20);
    const key = `priorityEmail.cursor.${account}`;
    const validity = String(mailbox.uidValidity);
    const [stored] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    const cursor = stored?.value ? JSON.parse(stored.value) as { validity: string; uid: number } : null;
    const saveCursor = async (uid: number) => {
      const value = JSON.stringify({ validity, uid });
      await db.insert(settingsTable).values({ key, value }).onConflictDoUpdate({ target: settingsTable.key, set: { value } });
    };
    // Begin with new arrivals only. Never scan old bookings silently on first activation.
    if (!cursor || cursor.validity !== validity) {
      await saveCursor(Math.max(0, mailbox.uidNext - 1));
      return;
    }
    const upper = mailbox.uidNext - 1;
    if (upper <= cursor.uid) return;
    // Bounded batches; all messages advance the cursor, including unrelated mail.
    const ids = await client.search({ uid: `${cursor.uid + 1}:${upper}` }, { uid: true });
    if (!ids) return;
    for (const uid of ids.filter(n => n > cursor.uid && n <= upper).sort((a, b) => a - b).slice(0, 50)) {
      const info = await client.fetchOne(String(uid), { size: true, envelope: true }, { uid: true });
      if (!info) throw new Error("Email disappeared during PRIORITY scan");
      const sender = info.envelope?.from?.[0]?.address?.toLowerCase() || "";
      if (!/^[^@]+@(?:[a-z0-9-]+\.)*citizenplane\.com$/.test(sender)) { await saveCursor(uid); continue; }
      if ((info.size ?? Infinity) > 15 * 1024 * 1024) {
        await reportOperationalFailure(`priority-email-size:${uid}`, "PRIORITY: email shumë i madh për kontroll", new Error(`UID ${uid}: kufiri 15 MB`), false);
        await saveCursor(uid); continue;
      }
      const mail = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!mail || !mail.source) throw new Error("Missing email content during PRIORITY scan");
      const parsed = await simpleParser(mail.source);
      await storePriorityEmail(account, typeof parsed.messageId === "string" ? parsed.messageId : createHash("sha256").update(mail.source).digest("hex"), priorityEmailText(parsed));
      await saveCursor(uid);
    }
  } catch (err) {
    logger.error({ err }, "PRIORITY email scan failed");
    await reportOperationalFailure("priority-email-monitor", "Kontrolli i email-eve PRIORITY", err, false);
  } finally {
    if (client) await client.logout().catch(() => { client?.close(); });
    running = false;
  }
}
export function startPriorityEmailMonitor() {
  setTimeout(() => void tick(), 20_000).unref();
  setInterval(() => void tick(), 60_000).unref();
}
