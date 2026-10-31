import { db, flightChangeHistoryTable, flightsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { googleMonitoringDisabled } from "./googleMonitoringPolicy.js";
import {
  deriveSeatCheckState,
  SEAT_MISS_THRESHOLD,
  seatCheckSkipReason,
  type SeatCheckFlightSnapshot,
  type SeatCheckSkipReason,
} from "./seatCheckState.js";

export type SeatCheckWriteResult = {
  applied: boolean;
  skipReason: SeatCheckSkipReason | null;
  updated: boolean;
  previousSeatAlert: string | null;
  seatAlert: string | null;
  seatMissCount: number;
  seatMissLastAt: Date | null;
  seatGooglePrice: number | null;
  status: string | null;
  oldStatus: string | null;
  transitionedToSoldOut: boolean;
};

export type SeatCheckWriteOptions = {
  flightId: number;
  available: boolean;
  minSeats: number;
  autoSoldOut: boolean;
  checkedAt: Date;
  googlePrice: number | null;
  snapshot: SeatCheckFlightSnapshot;
};

export type SeatCheckDatabase = Pick<typeof db, "transaction">;

/**
 * Atomically persist one valid observation and its sold-out history row.
 * The caller must perform upstream validity checks; this function guards the
 * locked row against edits, date-window drift and stale overlapping requests.
 */
export async function applySeatCheckResultTransaction(
  opts: SeatCheckWriteOptions,
  database: SeatCheckDatabase = db,
): Promise<SeatCheckWriteResult> {
  return database.transaction(async tx => {
    const [current] = await tx.select().from(flightsTable)
      .where(eq(flightsTable.id, opts.flightId))
      .for("update");
    if (!current || await googleMonitoringDisabled(current.id, tx)) {
      return {
        applied: false,
        skipReason: null,
        updated: false,
        previousSeatAlert: null,
        seatAlert: null,
        seatMissCount: 0,
        seatMissLastAt: null,
        seatGooglePrice: null,
        status: null,
        oldStatus: null,
        transitionedToSoldOut: false,
      };
    }

    const skipReason = seatCheckSkipReason(current, opts.snapshot);
    if (skipReason) {
      return {
        applied: false,
        skipReason,
        updated: false,
        previousSeatAlert: current.seatAlert ?? null,
        seatAlert: current.seatAlert ?? null,
        seatMissCount: current.seatMissCount ?? 0,
        seatMissLastAt: current.seatMissLastAt ?? null,
        seatGooglePrice: current.seatGooglePrice != null ? Number(current.seatGooglePrice) : null,
        status: current.status,
        oldStatus: current.status,
        transitionedToSoldOut: false,
      };
    }

    const next = deriveSeatCheckState({
      status: current.status,
      seatMissCount: current.seatMissCount,
      available: opts.available,
      valid: true,
      autoSoldOut: opts.autoSoldOut,
      // Read exclusion from the locked row, never from a stale caller snapshot.
      excluded: current.excludeFromGoogleRule === true,
      minSeats: opts.minSeats,
      threshold: SEAT_MISS_THRESHOLD,
      checkedAt: opts.checkedAt,
      googlePrice: opts.googlePrice,
    });
    const [updated] = await tx.update(flightsTable)
      .set({
        seatAlert: next.seatAlert,
        seatAlertDetail: next.seatAlertDetail,
        seatMissCount: next.seatMissCount,
        seatMissLastAt: next.seatMissLastAt,
        seatGooglePrice: next.seatGooglePrice != null ? String(next.seatGooglePrice) : null,
        seatCheckedAt: opts.checkedAt,
        ...(next.transitionedToSoldOut ? { status: "soldout" as const } : {}),
      })
      .where(eq(flightsTable.id, opts.flightId))
      .returning();

    const transitionedToSoldOut = next.transitionedToSoldOut && !!updated;
    if (transitionedToSoldOut) {
      // This insert is in the same transaction as the status update. A
      // history failure therefore rolls the sold-out transition back.
      await tx.insert(flightChangeHistoryTable).values({
        flightId: opts.flightId,
        source: "auto",
        changes: [{ field: "status", old: current.status, new: "soldout" }],
        note: `Sold Out automatik: nuk u gjetën ${opts.minSeats} vende në Google (${next.seatMissCount} kontrolle radhazi)`,
        userId: null,
        userName: "Sistemi",
        userRole: null,
      });
    }

    return {
      applied: true,
      skipReason: null,
      updated: !!updated,
      previousSeatAlert: current.seatAlert ?? null,
      seatAlert: next.seatAlert,
      seatMissCount: next.seatMissCount,
      seatMissLastAt: next.seatMissLastAt,
      seatGooglePrice: next.seatGooglePrice,
      status: updated?.status ?? next.status,
      oldStatus: current.status,
      transitionedToSoldOut,
    };
  });
}