import { db, cpImportAlertsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger.js";

const reported = new WeakSet<object>();
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/**
 * Reuse the persistent admin alert inbox, not the mail transport, as the source
 * of truth. Serialize dedupe so concurrent SMTP failures produce one alert.
 */
export async function reportOperationalFailure(key: string, label: string, error: unknown, email = true): Promise<void> {
  if (error instanceof Error && reported.has(error)) return;
  if (error instanceof Error) reported.add(error);
  const source = `system:${key}`;
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/(password|pass|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/:\/\/[^/\s@]+@/g, "://[redacted]@").slice(0, 600);
  const reason = `${label}: ${message}\nKontrolluar: ${new Date().toLocaleString("sq-AL", { timeZone: "Europe/Tirane" })}.`;
  try {
    const created = await db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${source}))`);
      const [existing] = await tx.select({ id: cpImportAlertsTable.id }).from(cpImportAlertsTable)
        .where(and(eq(cpImportAlertsTable.source, source), isNull(cpImportAlertsTable.resolvedAt))).limit(1);
      if (existing) {
        await tx.update(cpImportAlertsTable).set({ reason }).where(eq(cpImportAlertsTable.id, existing.id));
        return false;
      }
      await tx.insert(cpImportAlertsTable).values({ kind: "connection", source, reason });
      return true;
    });
    if (created && email && process.env.NOTIFY_EMAIL) {
      // Strict sending records a separate SMTP alert on failure. No recursive
      // notification: the SMTP recorder always passes email=false.
      const { sendEmailStrict } = await import("./gmail.js");
      await sendEmailStrict(process.env.NOTIFY_EMAIL, `Dështim sistemi: ${label}`,
        `<h2>Veprimi nuk u krye</h2><p>${escapeHtml(reason)}</p><p>Kontrollo Njoftime Importi dhe Sistemi. Njoftimi mbetet aty deri në zgjidhje.</p>`);
    }
  } catch (err) {
    logger.error({ err, source }, "Operational failure notification could not be completed");
  }
}