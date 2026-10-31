import { db, flightsTable, flightSeatHistoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { processLowSeatTasks } from "./lowSeatTasks.js";

export type SeatEventType = "created" | "total_changed" | "sold" | "cancelled" | "restored";

// Regjistron një ngjarje në historikun e vendeve të një fluturimi.
// Lexon gjendjen AKTUALE të fluturimit (pra duhet thirrur PAS ndryshimit)
// dhe ruan totalSeats/soldSeats pas ngjarjes, që historiku të tregojë "mbeten X".
// Nuk hedh kurrë gabim — historiku s'duhet të prishë asnjë rrugë shkrimi.
export async function recordSeatEvent(opts: {
  flightId: number;
  type: SeatEventType;
  seats: number;             // sa vende përfshin ngjarja (për created/total_changed = totali i ri)
  oldTotal?: number | null;  // vetëm për total_changed
  req?: any;                 // për emrin e përdoruesit nga sesioni
  userName?: string;         // mbishkruaj emrin (p.sh. "Booking Engine", "Import CP")
  note?: string | null;      // p.sh. referenca e rezervimit
}): Promise<void> {
  // The database already captured the crossing atomically with the seat write.
  // Wake delivery now; the scheduler retries if this process stops or fails.
  void processLowSeatTasks();
  try {
    const [f] = await db
      .select({ totalSeats: flightsTable.totalSeats, soldSeats: flightsTable.soldSeats })
      .from(flightsTable)
      .where(eq(flightsTable.id, opts.flightId));
    if (!f) return;
    await db.insert(flightSeatHistoryTable).values({
      flightId: opts.flightId,
      eventType: opts.type,
      seats: opts.seats,
      oldTotal: opts.oldTotal ?? null,
      totalSeats: f.totalSeats,
      soldSeats: f.soldSeats,
      userId: opts.req?.session?.userId ?? null,
      userName: opts.userName ?? opts.req?.session?.userName ?? "Sistemi",
      userRole: opts.req?.session?.role ?? null,
      note: opts.note ?? null,
    });
  } catch (err) {
    logger.error({ err, flightId: opts.flightId, type: opts.type }, "Failed to record seat history");
  }
}
