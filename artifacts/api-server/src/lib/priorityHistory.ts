import { createHash, randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { storePriorityEmail } from "./priorityEmailMonitor.js";
import { priorityEmailText } from "./priorityEmailParser.js";
import { logger } from "./logger.js";

const KEY = "priorityEmail.history";
type Progress = {
  id: string; status: "running" | "completed" | "failed"; from: string; to: string;
  total: number; checked: number; created: number; existing: number; ignored: number; errors: number;
  startedAt: string; updatedAt: string; error?: string; scope?: "allMail" | "inbox";
};
export function historyRange(from: unknown, to: unknown) {
  const valid = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  if (!valid(from) || !valid(to) || from > to) throw new Error("Zgjidhni një periudhë të vlefshme.");
  if (Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new Error("Periudha maksimale është 366 ditë.");
  return { from, to };
}
export function receiptInRange(date: Date, from: string, to: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return day >= from && day <= to;
}
export async function getPriorityHistory(): Promise<Progress | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, KEY));
  if (!row?.value) return null;
  const state = JSON.parse(row.value) as Progress;
  if (state.status === "running" && Date.now() - Date.parse(state.updatedAt) > 180_000)
    return { ...state, status: "failed", error: "Kontrolli u ndërpre. Mund ta nisni përsëri pa dyfishuar njoftimet." };
  return state;
}
async function save(p: Progress) {
  p.updatedAt = new Date().toISOString();
  // Owner check prevents a late worker overwriting a newer job after interruption.
  const rows = await db.update(settingsTable).set({ value: JSON.stringify(p) })
    .where(sql`${settingsTable.key} = ${KEY} AND
      (CASE WHEN ${settingsTable.key} = ${KEY} THEN ${settingsTable.value}::jsonb ->> 'id' ELSE NULL END) = ${p.id}`).returning();
  if (!rows.length) throw new Error("Historical scan ownership lost");
}
export async function startPriorityHistory(fromInput: unknown, toInput: unknown) {
  const range = historyRange(fromInput, toInput);
  if (!process.env.ADMIN_INBOX_USER || !process.env.ADMIN_INBOX_PASS) throw new Error("Kutia e postës nuk është konfiguruar.");
  const p = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${KEY}))`);
    const [row] = await tx.select().from(settingsTable).where(eq(settingsTable.key, KEY));
    const old = row?.value ? JSON.parse(row.value) as Progress : null;
    if (old?.status === "running" && Date.now() - Date.parse(old.updatedAt) < 180_000)
      throw new Error("Një kontroll historik është ende në proces.");
    const now = new Date().toISOString();
    const state: Progress = { id: randomUUID(), status: "running", ...range, total: 0, checked: 0,
      created: 0, existing: 0, ignored: 0, errors: 0, startedAt: now, updatedAt: now };
    await tx.insert(settingsTable).values({ key: KEY, value: JSON.stringify(state) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(state) } });
    return state;
  });
  void run(p).catch(err => logger.error({ err }, "PRIORITY history persistence failure"));
  return p;
}
async function run(p: Progress) {
  const user = process.env.ADMIN_INBOX_USER!.trim();
  const account = createHash("sha256").update(user.toLowerCase()).digest("hex").slice(0, 20);
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, logger: false,
    auth: { user, pass: process.env.ADMIN_INBOX_PASS!.replace(/\s+/g, "") },
    connectionTimeout: 20_000, socketTimeout: 60_000 });
  try {
    await client.connect();
    const folders = await client.list();
    const allMail = folders.find(f => f.specialUse === "\\All");
    await client.mailboxOpen(allMail?.path || "INBOX", { readOnly: true });
    p.scope = allMail ? "allMail" : "inbox";
    const since = new Date(Date.parse(`${p.from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const before = new Date(Date.parse(`${p.to}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
    // Pad IMAP calendar boundaries, then use exact Albania receipt dates below.
    const ids = await client.search({ since, before, from: "citizenplane.com" }, { uid: true });
    const uids = ids || [];
    p.total = uids.length; await save(p);
    for (const uid of uids) {
      await save(p);
      try {
        const info = await client.fetchOne(String(uid), { size: true, envelope: true, internalDate: true }, { uid: true });
        if (!info) throw new Error("Email missing");
        const sender = info.envelope?.from?.[0]?.address?.toLowerCase() || "";
        if (!(info.internalDate instanceof Date)) throw new Error("Missing email receipt date");
        if (!receiptInRange(info.internalDate, p.from, p.to) || !/^[^@]+@(?:[a-z0-9-]+\.)*citizenplane\.com$/.test(sender)) p.ignored++;
        else {
          if ((info.size ?? Infinity) > 15 * 1024 * 1024) throw new Error("Email exceeds 15 MB");
          const mail = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!mail || !mail.source) throw new Error("Email content missing");
          const parsed = await simpleParser(mail.source);
          const outcome = await storePriorityEmail(account, typeof parsed.messageId === "string" ? parsed.messageId : createHash("sha256").update(mail.source).digest("hex"), priorityEmailText(parsed));
          p[outcome]++;
        }
      } catch (err) { p.errors++; logger.warn({ err, uid }, "PRIORITY historical email failed"); }
      p.checked++; await save(p);
    }
    p.status = "completed";
  } catch (err) {
    logger.error({ err }, "PRIORITY historical scan failed");
    p.status = "failed"; p.error = "Kontrolli nuk përfundoi. Kontrolloni lidhjen e postës dhe provoni përsëri; njoftimet e krijuara ruhen.";
  } finally {
    try { await save(p); } finally { await client.logout().catch(() => client.close()); }
  }
}
