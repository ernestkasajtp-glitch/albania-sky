import { db, bookingsTable, flightsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger.js";

// ── MBISHITJE marker auto-clear ──────────────────────────────────────────────
// CP imports on a full flight add an "[MBISHITJE: …]" marker to booking notes
// (see pnlImport). When the admin later ADDS seats so the flight is no longer
// oversold (soldSeats <= totalSeats), those markers must disappear — the red
// badge in the bookings list keys off the "[MBISHITJE" substring in notes.
// Called after every write path that can increase totalSeats.

const STRIP_MARKER = sql`TRIM(regexp_replace(${bookingsTable.notes}, '\\s*\\[MBISHITJE:[^\\]]*\\]', '', 'g'))`;

export async function clearOversellIfResolved(flightId: number): Promise<number> {
  try {
    const [f] = await db
      .select({ totalSeats: flightsTable.totalSeats, soldSeats: flightsTable.soldSeats })
      .from(flightsTable)
      .where(eq(flightsTable.id, flightId));
    if (!f || f.soldSeats > f.totalSeats) return 0;

    const cleared = await db
      .update(bookingsTable)
      .set({ notes: STRIP_MARKER })
      .where(and(eq(bookingsTable.flightId, flightId), sql`${bookingsTable.notes} LIKE '%[MBISHITJE%'`))
      .returning({ id: bookingsTable.id });
    if (cleared.length > 0) {
      logger.info({ flightId, bookings: cleared.map(c => c.id) }, "MBISHITJE: mbishitja u zgjidh — shënimi u hoq nga rezervimet");
    }
    return cleared.length;
  } catch (e) {
    logger.error({ err: e, flightId }, "clearOversellIfResolved failed");
    return 0;
  }
}

// Bulk variant for endpoints that change seats on many flights at once.
export async function clearOversellIfResolvedBulk(flightIds: number[]): Promise<number> {
  if (!flightIds.length) return 0;
  try {
    const resolved = await db
      .select({ id: flightsTable.id })
      .from(flightsTable)
      .where(and(inArray(flightsTable.id, flightIds), sql`${flightsTable.soldSeats} <= ${flightsTable.totalSeats}`));
    const okIds = resolved.map(r => r.id);
    if (!okIds.length) return 0;

    const cleared = await db
      .update(bookingsTable)
      .set({ notes: STRIP_MARKER })
      .where(and(inArray(bookingsTable.flightId, okIds), sql`${bookingsTable.notes} LIKE '%[MBISHITJE%'`))
      .returning({ id: bookingsTable.id });
    if (cleared.length > 0) {
      logger.info({ count: cleared.length }, "MBISHITJE: mbishitja u zgjidh (bulk) — shënimet u hoqën");
    }
    return cleared.length;
  } catch (e) {
    logger.error({ err: e }, "clearOversellIfResolvedBulk failed");
    return 0;
  }
}
