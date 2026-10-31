import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db, cpImportAlertsTable as alerts, settingsTable as settings } from "@workspace/db";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export interface RetryEmail {
  to: string; subject: string; htmlBody: string;
  attachments?: { filename: string; content: string | Buffer; mimeType?: string }[];
}
type Meta = {
  subject: string; to: string; references: string[]; attachments: string[];
  file: string | null; status: "failed" | "uncertain" | "sending" | "sent";
  error: string; attempts: number; lastAttemptAt: string; sentAt?: string;
};
const key = (id: number) => `failedEmail.${id}`;
const active = new Set<number>();
export class RetryEmailError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function emailOutcomeUncertain(error: any) {
  if (Number(error?.responseCode) >= 400) return false;
  return !["EAUTH", "EENVELOPE", "EMESSAGE", "ECONNECTION", "EDNS", "SMTP_NOT_CONFIGURED"].includes(error?.code);
}
function message(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(password|pass|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/:\/\/[^/\s@]+@/g, "://[redacted]@").slice(0, 600);
}
function parse(value: string | null | undefined): Meta | null {
  try { const m = JSON.parse(value || "null"); return m && typeof m.to === "string" && typeof m.subject === "string" ? m : null; }
  catch { return null; }
}
function reason(m: Meta) {
  return `Email: ${m.subject}\nMarrësi: ${m.to}\n${m.references.length ? `Rezervimi: ${m.references.join(", ")}\n` : ""}Bashkëngjitje: ${m.attachments.join(", ") || "Asnjë"}\nGabimi: ${m.error}`;
}

/** Uses the VPS's existing filesystem persistence, outside every public/static directory.
 * The DB stores metadata only; HTML and attachment bytes never appear in API responses.
 */
export class FailedEmailStore {
  constructor(private client = db, private directory = path.resolve(__dirname, "..", "private", "failed-emails")) {}
  private file(name: string) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) throw new Error("Invalid private email file");
    return path.join(this.directory, name);
  }
  async record(payload: RetryEmail, error: unknown) {
    const retryTo = (error as any)?.retryTo;
    if (typeof retryTo === "string" && retryTo) payload = { ...payload, to: retryTo };
    const encoded = JSON.stringify({ ...payload, attachments: payload.attachments?.map(a => ({
      filename: a.filename, mimeType: a.mimeType,
      base64: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content, "utf8")).toString("base64"),
    })) });
    const fingerprint = createHash("sha256").update(encoded).digest("hex");
    let file: string | null = `${randomUUID()}.json`;
    try {
      if (Buffer.byteLength(encoded) > 50 * 1024 * 1024) throw new Error("Email recovery copy exceeds 50MB");
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(this.file(file), encoded, { mode: 0o600, flag: "wx" });
    } catch (err) {
      logger.error({ err }, "Could not persist private email recovery copy");
      file = null;
    }
    const meta: Meta = {
      subject: payload.subject, to: payload.to,
      references: [...new Set((payload.subject + " " + payload.htmlBody).match(/\bKTF\d+\b/g) || [])].slice(0, 100),
      attachments: payload.attachments?.map(a => a.filename) ?? [], file,
      status: emailOutcomeUncertain(error) ? "uncertain" : "failed",
      error: message(error), attempts: 1, lastAttemptAt: new Date().toISOString(),
    };
    let usedFile = false;
    try {
      return await this.client.transaction(async tx => {
        const source = `system:email:${fingerprint}`;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${source}))`);
        const [existing] = await tx.select().from(alerts).where(and(eq(alerts.source, source), isNull(alerts.resolvedAt))).limit(1);
        if (existing) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key(existing.id)}))`);
          const [row] = await tx.select().from(settings).where(eq(settings.key, key(existing.id)));
          const old = parse(row?.value);
          if (old?.status === "sending" || old?.status === "sent") return existing.id;
          if (old) {
            meta.attempts = old.attempts + 1;
            if (old.file) meta.file = old.file;
            // Never erase ambiguity from a previous attempt.
            if (old.status === "uncertain") meta.status = "uncertain";
          }
          await tx.update(alerts).set({ reason: reason(meta) }).where(eq(alerts.id, existing.id));
          await tx.insert(settings).values({ key: key(existing.id), value: JSON.stringify(meta) })
            .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(meta) } });
          usedFile = meta.file === file;
          return existing.id;
        }
        const [created] = await tx.insert(alerts).values({ kind: "connection", source, reason: reason(meta) }).returning({ id: alerts.id });
        await tx.insert(settings).values({ key: key(created.id), value: JSON.stringify(meta) });
        usedFile = true;
        return created.id;
      });
    } finally {
      if (!usedFile && file) await unlink(this.file(file)).catch(() => {});
    }
  }
  async details(ids: number[]) {
    const result = new Map<number, Omit<Meta, "file"> & { canRetry: boolean }>();
    if (!ids.length) return result;
    const rows = await this.client.select().from(settings).where(inArray(settings.key, ids.map(key)));
    for (const row of rows) {
      const m = parse(row.value); if (!m) continue;
      const { file, ...safe } = m;
      if (safe.status === "sending" && Date.now() - Date.parse(safe.lastAttemptAt) > 10 * 60_000) safe.status = "uncertain";
      result.set(Number(row.key.slice("failedEmail.".length)), { ...safe, canRetry: !!file && ["failed", "uncertain"].includes(safe.status) });
    }
    return result;
  }
  async retry(id: number, confirmUncertain: boolean, send: (payload: RetryEmail) => Promise<void>) {
    if (active.has(id)) throw new RetryEmailError("Ky email po ridërgohet. Prisni përfundimin.");
    active.add(id);
    let meta: Meta | null = null;
    let smtpAccepted = false;
    let smtpAttempted = false;
    try {
      meta = await this.client.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key(id)}))`);
        const [alert] = await tx.select().from(alerts).where(eq(alerts.id, id));
        const [row] = await tx.select().from(settings).where(eq(settings.key, key(id)));
        const m = parse(row?.value);
        if (!alert || !alert.source.startsWith("system:email:") || !m || !m.file) throw new RetryEmailError("Për këtë njoftim nuk ka email të ruajtur për ridërgim.", 404);
        if (alert.resolvedAt || m.status === "sent") throw new RetryEmailError("Ky njoftim është mbyllur ose email-i është ridërguar tashmë.");
        const stale = Date.now() - Date.parse(m.lastAttemptAt) > 10 * 60_000;
        if (m.status === "sending" && !stale) throw new RetryEmailError("Ky email po ridërgohet. Prisni përfundimin.");
        if ((m.status === "uncertain" || m.status === "sending") && !confirmUncertain) throw new RetryEmailError("Dërgimi i mëparshëm ka rezultat të paqartë. Ridërgimi mund të krijojë një kopje të dytë.");
        m.status = "sending"; m.attempts++; m.lastAttemptAt = new Date().toISOString();
        await tx.update(settings).set({ value: JSON.stringify(m) }).where(eq(settings.key, key(id)));
        return m;
      });
      const encoded = JSON.parse(await readFile(this.file(meta.file!), "utf8"));
      const payload: RetryEmail = { to: meta.to, subject: encoded.subject, htmlBody: encoded.htmlBody,
        attachments: encoded.attachments?.map((a: any) => ({ filename: a.filename, mimeType: a.mimeType, content: Buffer.from(a.base64, "base64") })) };
      // No DB transaction or row lock is held while contacting SMTP.
      smtpAttempted = true;
      await send(payload);
      smtpAccepted = true;
      meta.status = "sent"; meta.sentAt = new Date().toISOString(); meta.error = "";
      await this.client.transaction(async tx => {
        await tx.update(settings).set({ value: JSON.stringify(meta) }).where(eq(settings.key, key(id)));
        await tx.update(alerts).set({ resolvedAt: new Date(), reason: `Email-i u pranua nga serveri i email-it më ${meta!.sentAt}.\n${reason(meta!)}` }).where(eq(alerts.id, id));
      });
      await unlink(this.file(meta.file!)).catch(() => {});
    } catch (err) {
      if (meta) {
        meta.status = smtpAccepted || (smtpAttempted && emailOutcomeUncertain(err)) ? "uncertain" : "failed";
        meta.error = message(err);
        if (typeof (err as any)?.retryTo === "string") meta.to = (err as any).retryTo;
        await this.client.transaction(async tx => {
          await tx.update(settings).set({ value: JSON.stringify(meta) }).where(eq(settings.key, key(id)));
          await tx.update(alerts).set({ reason: reason(meta!) }).where(eq(alerts.id, id));
        }).catch(e => logger.error({ err: e, id }, "Could not record retry outcome; sending state retained"));
      }
      throw err;
    } finally { active.delete(id); }
  }
}
export const failedEmails = new FailedEmailStore();
