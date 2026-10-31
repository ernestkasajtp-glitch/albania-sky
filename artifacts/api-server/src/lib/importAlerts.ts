import { db, cpImportAlertsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger.js";

type ImportAlertInput = {
  kind: "booking" | "connection";
  source?: string; // 'sftp' | 'email' | 'citizenplane'
  cpCode?: string | null;
  fileName?: string | null;
  reason: string;
  // Full CSV content of the failed file (recovery copy — source file is
  // deleted from SFTP after processing). Capped at ~300KB by callers.
  rawCsv?: string | null;
};

// Record an admin-facing, in-system notification about a failed CitizenPlane
// import. De-duplicates against still-unresolved alerts so a permanently broken
// channel (e.g. IMAP down) does not spam a new row on every cron cycle:
//   - connection alerts collapse per (kind, source) while unresolved
//   - booking alerts collapse per (kind, source, cpCode) while unresolved
export async function recordImportAlert(a: ImportAlertInput): Promise<void> {
  try {
    const source = a.source || "citizenplane";
    const conds = [
      eq(cpImportAlertsTable.kind, a.kind),
      eq(cpImportAlertsTable.source, source),
      isNull(cpImportAlertsTable.resolvedAt),
    ];
    if (a.cpCode) {
      conds.push(eq(cpImportAlertsTable.cpCode, a.cpCode));
    } else {
      conds.push(isNull(cpImportAlertsTable.cpCode));
      // Without a CP code, collapse per distinct (fileName, reason) so unrelated
      // file-level failures each surface instead of hiding behind one bucket.
      if (a.kind === "booking") {
        if (a.fileName) conds.push(eq(cpImportAlertsTable.fileName, a.fileName));
        else conds.push(isNull(cpImportAlertsTable.fileName));
        conds.push(eq(cpImportAlertsTable.reason, (a.reason || "").slice(0, 2000)));
      }
    }

    const existing = await db
      .select({ id: cpImportAlertsTable.id })
      .from(cpImportAlertsTable)
      .where(and(...conds))
      .limit(1);
    if (existing.length > 0) return;

    await db.insert(cpImportAlertsTable).values({
      kind: a.kind,
      source,
      cpCode: a.cpCode ?? null,
      fileName: a.fileName ?? null,
      reason: (a.reason || "").slice(0, 2000),
      rawCsv: a.rawCsv ? a.rawCsv.slice(0, 300_000) : null,
    });
  } catch (err) {
    logger.error({ err }, "recordImportAlert failed");
  }
}
