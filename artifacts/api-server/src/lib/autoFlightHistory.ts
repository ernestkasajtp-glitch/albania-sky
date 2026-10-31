import { db, flightChangeHistoryTable } from "@workspace/db";
import { logger } from "./logger.js";

// Shënon në Historikun e Ndryshimeve kur SISTEMI e kalon vetë një fluturim në
// "soldout" (asnjë përdorues i loguar): mbushja e vendeve, afati i shitjes,
// ose kontrolli i vendeve në Google. userName = "Sistemi", source = "auto".
export async function recordAutoSoldOut(flightIds: number[], note: string, oldStatus: string = "open"): Promise<void> {
  if (!flightIds.length) return;
  try {
    await db.insert(flightChangeHistoryTable).values(flightIds.map((flightId) => ({
      flightId,
      source: "auto",
      changes: [{ field: "status", old: oldStatus, new: "soldout" }],
      note,
      userId: null,
      userName: "Sistemi",
      userRole: null,
    })));
  } catch (err) {
    logger.error({ err, flightIds }, "Failed to record auto sold-out history");
  }
}
