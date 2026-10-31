import { db, flightsTable, settingsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { triggerCpExportSoon } from "./cpExport.js";
import { recordAutoSoldOut } from "./autoFlightHistory.js";

// ── Auto sold-out by sell cutoff (event-driven, precise) ─────────────────────
// Once a flight enters the sell-cutoff window (N hours before departure, in
// Albania time) it is flipped from "open" to "soldout" so it leaves the
// Bookable tab and surfaces under Sold Out — matching the public sell-cutoff.
//
// Instead of polling on a fixed interval, we arm a SINGLE precise timer for the
// exact moment the next flight reaches its cutoff, and recompute it whenever a
// flight is created/edited/imported or the cutoff setting changes. A long
// safety re-arm covers restarts and any un-hooked write path.

export async function getSellCutoffHours(): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "sell_cutoff_hours"));
    const n = parseFloat(rows[0]?.value ?? "");
    return isNaN(n) || n < 0 ? 3 : n;
  } catch {
    return 3;
  }
}

export async function getConfirmedSellCutoffHours(): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "confirmed_sell_cutoff_hours"));
    const n = parseFloat(rows[0]?.value ?? "");
    return isNaN(n) || n < 0 ? 4 : n;
  } catch {
    return 4;
  }
}

// Momenti i mbylljes së shitjes për një fluturim (SQL, kohë Shqipërie):
// - i konfirmuar (⭐): nisja − confirmed_sell_cutoff_hours; nëse bie kur zyra
//   është mbyllur (00:30–09:00), zhvendoset në 00:30 të asaj dite;
// - i pakonfirmuar: nisja − COALESCE(kufiri për-fluturim, kufiri global).
export function closeTsSql(cutoffHours: number, confirmedHours: number) {
  const depTs = sql`((${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime})::timestamp)`;
  // Kufiri MANUAL për-fluturim ka përparësi edhe te të konfirmuarat (⭐).
  // KUJDES: parametrat e Drizzle vijnë si tekst pa tip — pa ::numeric te secili
  // parametër, COALESCE(integer, text) hedh gabim SQL dhe flip-i dështon në heshtje.
  const effHours = sql`COALESCE(${flightsTable.sellCutoffHours}::numeric, CASE WHEN ${flightsTable.isConfirmed} THEN ${confirmedHours}::numeric ELSE ${cutoffHours}::numeric END)`;
  const baseClose = sql`(${depTs} - (${effHours} * interval '1 hour'))`;
  return sql`(CASE WHEN ${flightsTable.isConfirmed} AND ${baseClose}::time > time '00:30' AND ${baseClose}::time < time '09:00' THEN date_trunc('day', ${baseClose}) + interval '30 minutes' ELSE ${baseClose} END)`;
}

// Flip any "open" flight that is already inside the sell-cutoff window.
async function flipDueSoldOut(cutoffHours: number, confirmedHours: number): Promise<number> {
  const tiraneNow = sql`(now() AT TIME ZONE 'Europe/Tirane')`;
  const nowStr = sql`to_char(${tiraneNow}, 'YYYY-MM-DD HH24:MI')`;
  const closeStr = sql`to_char(${closeTsSql(cutoffHours, confirmedHours)}, 'YYYY-MM-DD HH24:MI')`;
  // SHËNIM: flip-i vlen edhe për fluturime që tashmë janë NISUR — një fluturim
  // "open" i nisur sot rri gabimisht te tabi Bookable deri në mesnatë nëse nuk
  // kalon në soldout (kushti i vjetër "dep >= now" i linte hapur përgjithmonë).
  const flipped = await db
    .update(flightsTable)
    .set({ status: "soldout", updatedAt: new Date() })
    .where(
      and(
        eq(flightsTable.status, "open"),
        sql`${flightsTable.departureDate} >= to_char(${tiraneNow}, 'YYYY-MM-DD')`, // sot ose në të ardhmen — mos prek historikun e vjetër
        sql`${closeStr} <= ${nowStr}`, // cutoff moment already reached
      ),
    )
    .returning({ id: flightsTable.id });
  if (flipped.length > 0) {
    void recordAutoSoldOut(flipped.map((r) => r.id), "Sold Out automatik: kaloi afati i shitjes (sell cutoff)");
  }
  return flipped.length;
}

// Rikontroll sigurie: kap çdo fluturim "open" me vendet e mbushura (sold >= total)
// që s'u kthye dot në soldout në momentin e shitjes — p.sh. kur serveri rrëzohet
// PIKËRISHT mes rritjes së soldSeats dhe flipSoldOutIfFull (ndodhi 22.08.2026 me
// fluturimin W45031). Ekzekutohet në çdo kalim të scheduleNextAutoSoldOut
// (ndezje serveri + pas çdo shkrimi fluturimi + re-arm ≤6h). Vetëm fluturime të
// sotme/të ardhshme (mos prek historikun) dhe me total > 0.
async function flipSeatFullSoldOut(): Promise<number> {
  const tiraneNow = sql`(now() AT TIME ZONE 'Europe/Tirane')`;
  const flipped = await db
    .update(flightsTable)
    .set({ status: "soldout", updatedAt: new Date() })
    .where(
      and(
        eq(flightsTable.status, "open"),
        sql`${flightsTable.totalSeats} > 0`,
        sql`${flightsTable.soldSeats} >= ${flightsTable.totalSeats}`,
        sql`${flightsTable.departureDate} >= to_char(${tiraneNow}, 'YYYY-MM-DD')`,
      ),
    )
    .returning({ id: flightsTable.id });
  if (flipped.length > 0) {
    void recordAutoSoldOut(
      flipped.map((r) => r.id),
      "Sold Out automatik: u mbushën të gjitha vendet (rikontroll sigurie)",
    );
  }
  return flipped.length;
}

// Milliseconds until the next "open" flight will ENTER the cutoff window.
// Returns null when no upcoming flight needs flipping.
async function msUntilNextCutoff(cutoffHours: number, confirmedHours: number): Promise<number | null> {
  const tiraneNow = sql`(now() AT TIME ZONE 'Europe/Tirane')`;
  const depTs = sql`((${flightsTable.departureDate} || ' ' || ${flightsTable.departureTime})::timestamp)`;
  const closeTs = closeTsSql(cutoffHours, confirmedHours);
  const rows = await db
    .select({
      secs: sql<string | null>`EXTRACT(EPOCH FROM (MIN(${closeTs}) - ${tiraneNow}))`,
    })
    .from(flightsTable)
    .where(
      and(
        eq(flightsTable.status, "open"),
        sql`${depTs} > ${tiraneNow}`, // not yet departed
        sql`${closeTs} > ${tiraneNow}`, // cutoff still in the future
      ),
    );
  const secs = rows[0]?.secs;
  if (secs == null) return null;
  const n = Number(secs);
  if (isNaN(n)) return null;
  return Math.max(0, n * 1000);
}

// ── Auto sold-out by seat fill (event-driven) ───────────────────────────────
// When our own sold-seat count reaches the flight's total seats (i.e. no seats
// left to sell), flip an "open" flight to "soldout" so it drops out of the
// Bookable/Të Afërta/Të Konfirmuara tabs and surfaces under Sold Out. This is
// deterministic (we know exactly how many seats we sold), so no retry guard is
// needed — unlike the Google-availability detector. Infants are already excluded
// upstream because they never increment soldSeats. Runs after every seat
// increment (booking create, booking restore, passenger add, passenger restore).
// It only ever moves open → soldout; it never re-opens a flight.
export async function flipSoldOutIfFull(flightId: number): Promise<boolean> {
  try {
    const flipped = await db
      .update(flightsTable)
      .set({ status: "soldout", updatedAt: new Date() })
      .where(
        and(
          eq(flightsTable.id, flightId),
          eq(flightsTable.status, "open"),
          sql`${flightsTable.soldSeats} >= ${flightsTable.totalSeats}`,
        ),
      )
      .returning({ id: flightsTable.id });
    if (flipped.length > 0) {
      logger.info(
        { flightId },
        "Auto sold-out: flight reached 0 available seats",
      );
      void recordAutoSoldOut([flightId], "Sold Out automatik: u mbushën të gjitha vendet");
      triggerCpExportSoon();
      return true;
    }
  } catch (e) {
    logger.error({ err: e, flightId }, "flipSoldOutIfFull failed");
  }
  return false;
}

// Bulk variant of flipSoldOutIfFull for endpoints that change seats on many
// flights at once (e.g. manual "set available seats" over a selection). Same
// guard: only open flights whose sold seats reached total seats are flipped.
export async function flipSoldOutIfFullBulk(flightIds: number[]): Promise<number> {
  if (!flightIds.length) return 0;
  try {
    const flipped = await db
      .update(flightsTable)
      .set({ status: "soldout", updatedAt: new Date() })
      .where(
        and(
          inArray(flightsTable.id, flightIds),
          eq(flightsTable.status, "open"),
          sql`${flightsTable.soldSeats} >= ${flightsTable.totalSeats}`,
        ),
      )
      .returning({ id: flightsTable.id });
    if (flipped.length > 0) {
      logger.info(
        { count: flipped.length },
        "Auto sold-out: flights reached 0 available seats (bulk)",
      );
      void recordAutoSoldOut(flipped.map((r) => r.id), "Sold Out automatik: u mbushën të gjitha vendet");
      triggerCpExportSoon();
    }
    return flipped.length;
  } catch (e) {
    logger.error({ err: e }, "flipSoldOutIfFullBulk failed");
    return 0;
  }
}

// 6h safety re-arm: covers process restarts and any write path we didn't hook.
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let running = false;
let pending = false;

// Recompute and arm the single precise timer for the next sell-cutoff moment.
// Safe to call repeatedly (concurrent calls coalesce); call on startup and after
// any flight create/edit/import or cutoff-setting change.
export async function scheduleNextAutoSoldOut(): Promise<void> {
  if (running) {
    pending = true; // re-run once after the current pass so latest data is used
    return;
  }
  running = true;
  try {
    do {
      pending = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const cutoffHours = await getSellCutoffHours();
      const confirmedHours = await getConfirmedSellCutoffHours();
      const flipped = await flipDueSoldOut(cutoffHours, confirmedHours);
      if (flipped > 0) {
        logger.info(
          { count: flipped, cutoffHours },
          "Auto sold-out: flipped flights past sell cutoff",
        );
        triggerCpExportSoon();
      }
      const seatFull = await flipSeatFullSoldOut();
      if (seatFull > 0) {
        logger.info(
          { count: seatFull },
          "Auto sold-out: flipped seat-full flights missed at sale time (safety recheck)",
        );
        triggerCpExportSoon();
      }
      const ms = await msUntilNextCutoff(cutoffHours, confirmedHours);
      const delay =
        ms == null ? MAX_DELAY_MS : Math.max(1000, Math.min(ms, MAX_DELAY_MS));
      timer = setTimeout(() => {
        void scheduleNextAutoSoldOut();
      }, delay);
    } while (pending);
  } catch (e) {
    logger.error({ err: e }, "scheduleNextAutoSoldOut failed");
    if (!timer) {
      timer = setTimeout(() => {
        void scheduleNextAutoSoldOut();
      }, MAX_DELAY_MS);
    }
  } finally {
    running = false;
  }
}
