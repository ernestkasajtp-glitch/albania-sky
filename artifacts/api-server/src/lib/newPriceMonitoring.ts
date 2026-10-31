import { db, flightsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { applyGoogleSearchScheduleAlert } from "./googleScheduleAlerts.js";
import type { fetchGoogleSeatAvailability } from "./seatCheck.js";
import { isModuleEnabled } from "./moduleControls.js";
import { notifyDataChanged } from "./liveEvents.js";
import { googleMonitoringDisabled, googleMonitoringFlights } from "./googleMonitoringPolicy.js";
import { logger } from "./logger.js";
import type { GoogleScheduleResult } from "../routes/flights.js";
import { googleScheduleSearchEvidence } from "./googleScheduleEvidence.js";

type Flight = typeof flightsTable.$inferSelect;
const norm = (value: string) => value.replace(/\s+/g, "").toUpperCase();
const identity = (f: Flight) => JSON.stringify([
  norm(f.fromCity), norm(f.toCity), norm(f.flightNumber), f.departureDate,
  f.departureTime, f.arrivalTime, f.arrivalDate, f.alertDismissedAt?.getTime() ?? null,
]);
const eligible = (f: Flight) => f.status !== "soldout" && f.status !== "cancelled" &&
  `${f.departureDate} ${f.departureTime}` > new Date().toLocaleString("sv-SE", { timeZone: "Europe/Tirane" }).slice(0, 16);

// Called ONLY by the existing candidate-price group refresh: no timer, no new
// flight selection or cadence. Never use the operational seat miss counter here:
// otherwise informational checks could advance the other worker's Sold Out rule.
export async function monitorNewPriceGroup(
  snapshots: Flight[], result: GoogleScheduleResult, startedAt: Date,
  dependencies: {
    database?: typeof db;
    fetchSeats: typeof fetchGoogleSeatAvailability;
    getConfig: () => Promise<{ minSeats: number }>;
    enabled?: typeof isModuleEnabled;
    notify?: typeof notifyDataChanged;
  },
) {
  const database = dependencies.database ?? db;
  const enabled = dependencies.enabled ?? isModuleEnabled;
  if (!await enabled("googlePrices")) return;
  const flights = await googleMonitoringFlights(snapshots.filter(eligible), database);
  if (!flights.length) return;
  let changed = false;
  try {
    for (const f of flights) {
      const code = norm(f.flightNumber);
      const relevant = result.flights.filter(g => !g.departureDate || g.departureDate === f.departureDate);
      const price = result.flightPriceMap[code] ?? null;
      const written = await applyGoogleSearchScheduleAlert(f, startedAt,
        { price, routePrice: result.routePrice, specific: price != null, error: !!result.error },
        googleScheduleSearchEvidence(relevant, f, !result.error && result.schedulesReliable !== false),
        database);
      changed ||= written != null;
    }
    if (result.error) return;
    const { minSeats } = await dependencies.getConfig();
    if (!await enabled("googlePrices")) return;
    const first = flights[0];
    const seats = await dependencies.fetchSeats(
      first.fromCity, first.toCity, first.departureDate, minSeats);
    if (seats.error || !seats.availableFlightNumbers.size || !await enabled("googlePrices")) return;
    for (const snapshot of flights) {
      await database.transaction(async tx => {
        const [current] = await tx.select().from(flightsTable).where(eq(flightsTable.id, snapshot.id)).for("update");
        if (current && await googleMonitoringDisabled(current.id, tx)) return;
        if (!current || !eligible(current) || identity(current) !== identity(snapshot) ||
            (current.alertDismissedAt && current.alertDismissedAt >= startedAt) ||
            (current.seatCheckedAt && current.seatCheckedAt >= startedAt)) return;
        const code = norm(current.flightNumber);
        const available = seats.availableFlightNumbers.has(code) && (seats.flightPriceMap[code] ?? 0) > 0;
        await tx.update(flightsTable).set({
          seatCheckedAt: new Date(),
          // Recovery does not acknowledge an existing alert. Only explicit
          // confirmation/synchronisation may remove these notifications.
          ...(!available ? {
            seatAlert: "low_seats",
            seatAlertDetail: `Nuk konfirmohen ${minSeats} vende në Google (kontrolli Çmim i Ri)`,
          } : {}),
          updatedAt: sql`${flightsTable.updatedAt}`,
        }).where(eq(flightsTable.id, current.id));
        changed = true;
      });
    }
  } catch (err) {
    // A seat-provider outage must not invalidate the successful price refresh.
    logger.error({ err }, "New-price informational monitoring failed");
  } finally {
    if (changed) (dependencies.notify ?? notifyDataChanged)("flights");
  }
}