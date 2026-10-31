/**
 * One-off whole-euro backfill.
 *
 * This is intentionally DRY-RUN by default. It only writes when BOTH
 * --apply and --confirm-whole-euro are supplied. It never reads or writes
 * payments, wallet balances, debts, commissions, or historical bookings.
 *
 * Build/run only after review:
 *   node --env-file=./.env dist-scripts/backfill-whole-euro-prices.mjs
 *   node --env-file=./.env dist-scripts/backfill-whole-euro-prices.mjs --apply --confirm-whole-euro
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, flightsTable, bookingsTable, passengersTable, bookingExtrasTable, paymentsTable } from "@workspace/db";
import { roundWholeEuro, wholeEuroDue, wholeEuroOverpay } from "../src/lib/money.js";
import { logger } from "../src/lib/logger.js";

export const ACTIVE_BOOKING_STATUSES = ["draft", "pending", "confirmed", "ticketed"] as const;
export const ACTIVE_FLIGHT_STATUSES = ["open"] as const;

export function isApplyMode(args: string[]): boolean {
  return args.includes("--apply") && args.includes("--confirm-whole-euro");
}

export function canonicalBookingTotal(
  booking: { discount: unknown },
  pax: Array<{ type: string; ticketPrice: unknown; extraCost: unknown }>,
  extras: Array<{ amount: unknown }>,
  flight: { adultPrice: unknown; childPrice: unknown; infantPrice: unknown; tax: unknown },
): number {
  const tickets = pax.reduce((sum, p) => {
    const fallback = p.type === "child" ? flight.childPrice : p.type === "infant" ? flight.infantPrice : flight.adultPrice;
    return sum + roundWholeEuro(Number(p.ticketPrice ?? fallback)) + roundWholeEuro(Number(p.extraCost ?? 0));
  }, 0);
  return roundWholeEuro(tickets + extras.reduce((s, e) => s + roundWholeEuro(Number(e.amount)), 0)
    + roundWholeEuro(Number(flight.tax)) - roundWholeEuro(Number(booking.discount ?? 0)));
}

async function main(): Promise<void> {
  const apply = isApplyMode(process.argv.slice(2));
  const allActiveBookings = await db.select().from(bookingsTable).where(inArray(bookingsTable.status, [...ACTIVE_BOOKING_STATUSES]));
  const referencedFlightIds = [...new Set(allActiveBookings.map(b => b.flightId))];
  const flights = await db.select().from(flightsTable).where(inArray(flightsTable.status, ["open"]));
  const referencedClosedFlights = referencedFlightIds.length
    ? await db.select().from(flightsTable).where(inArray(flightsTable.id, referencedFlightIds))
    : [];
  const flightById = new Map([...flights, ...referencedClosedFlights].map(f => [f.id, f]));
  // Historical bookings attached to closed/non-open flights are intentionally
  // read-only and excluded from both the report's active scope and writes.
  const bookings = allActiveBookings.filter(b => flightById.get(b.flightId)?.status === "open");
  const bookingIds = bookings.map(b => b.id);
  const passengers = bookingIds.length
    ? await db.select().from(passengersTable).where(and(inArray(passengersTable.bookingId, bookingIds), ne(passengersTable.cancelled, true)))
    : [];

  const paidRows = bookingIds.length
    ? await db.select({ bookingId: paymentsTable.bookingId, amount: paymentsTable.amount, isRefund: paymentsTable.isRefund }).from(paymentsTable)
      .where(and(inArray(paymentsTable.bookingId, bookingIds), eq(paymentsTable.status, "completed")))
    : [];
  const paidBookingIds = new Set(paidRows.map(p => p.bookingId));
  const paidByBooking = new Map<number, number>();
  for (const p of paidRows) paidByBooking.set(p.bookingId, (paidByBooking.get(p.bookingId) ?? 0) + (p.isRefund ? -1 : 1) * Number(p.amount));
  const extras = bookingIds.length
    ? await db.select().from(bookingExtrasTable).where(inArray(bookingExtrasTable.bookingId, bookingIds))
    : [];
  const monetaryFields = ["adultPrice", "childPrice", "infantPrice", "tax", "checkedBaggagePrice", "seatSelectionPrice", "priorityBoardingPrice", "insurancePrice"];
  const flightDeltas = flights.reduce((n, f) => n + monetaryFields.filter(k => {
    const value = (f as any)[k]; return value != null && Number(value) !== Math.round(Number(value));
  }).length, 0);
  const bookingReports = bookings.map(booking => {
    const pax = passengers.filter(p => p.bookingId === booking.id);
    const ex = extras.filter(e => e.bookingId === booking.id);
    const flight = flightById.get(booking.flightId);
    const oldTotal = Number(booking.totalAmount);
    const newTotal = flight ? canonicalBookingTotal(booking, pax, ex, flight) : oldTotal;
    const paid = paidByBooking.get(booking.id) ?? 0;
    const rawDue = newTotal - paid;
    const rawOverpay = Math.max(0, paid - newTotal);
    return { id: booking.id, oldTotal, newTotal, delta: newTotal - oldTotal, paid: paidBookingIds.has(booking.id),
      rawDue, due: wholeEuroDue(newTotal, paid), waivedSubEuroDue: rawDue > 0 && rawDue < 1,
      rawOverpay, overpay: wholeEuroOverpay(paid, newTotal) };
  });
  const componentNames = ["adultPrice", "childPrice", "infantPrice", "tax", "checkedBaggagePrice", "seatSelectionPrice", "priorityBoardingPrice", "insurancePrice"] as const;
  const fractionalComponents = (flight: any, bookingId?: number) => componentNames.filter(name => {
    const value = flight?.[name];
    if (value == null || Number(value) === roundWholeEuro(Number(value))) return false;
    if (!bookingId || !["checkedBaggagePrice", "seatSelectionPrice", "priorityBoardingPrice", "insurancePrice"].includes(name)) return true;
    return passengers.some(p => p.bookingId === bookingId && (
      (name === "checkedBaggagePrice" && p.baggageOption === "checked") ||
      (name === "seatSelectionPrice" && p.hasSeatSelection) ||
      (name === "priorityBoardingPrice" && p.hasPriorityBoarding) ||
      (name === "insurancePrice" && p.hasInsurance)
    ));
  });
  const aggregateDelta = bookingReports.filter(r => !r.paid).reduce((s, r) => s + r.delta, 0);
  const paidOverpayDeltas = bookingReports.filter(r => r.paid).map(r => ({
    id: r.id, paid: paidByBooking.get(r.id) ?? 0,
    oldOverpay: Math.max(0, (paidByBooking.get(r.id) ?? 0) - r.oldTotal),
    newOverpay: Math.max(0, (paidByBooking.get(r.id) ?? 0) - r.newTotal),
  }));
  const blockers = bookings.flatMap(b => {
    const flight = flightById.get(b.flightId);
    const components = fractionalComponents(flight, b.id);
    const nullFare = !!flight && passengers.some(p => p.bookingId === b.id && p.ticketPrice == null && (
      Number(p.type === "child" ? flight?.childPrice : p.type === "infant" ? flight?.infantPrice : flight?.adultPrice) !==
      roundWholeEuro(Number(p.type === "child" ? flight?.childPrice : p.type === "infant" ? flight?.infantPrice : flight?.adultPrice))
    ));
    const nonOpen = flight && flight.status !== "open";
    if (!flight || !Number.isFinite(Number(flight.tax)) || components.some(name => !Number.isFinite(Number((flight as any)[name])))) {
      return [{ bookingId: b.id, flightId: b.flightId, paid: paidBookingIds.has(b.id), nonOpen, components: [...components, ...(nullFare ? ["null-ticket-fallback"] : [])] }];
    }
    return [];
  });
  logger.info({ dryRun: !apply, activeFlights: flights.length, referencedNonOpenReadOnly: referencedClosedFlights.filter(f => f.status !== "open").map(f => f.id),
    activeBookings: bookings.length, excludedHistoricalBookings: allActiveBookings.length - bookings.length,
    activePassengers: passengers.length,
    paidBookings: paidBookingIds.size, paidWouldBeOverpayDeltas: paidOverpayDeltas,
    fieldLevelFlightDeltas: flightDeltas, bookingTotalDeltas: bookingReports,
    aggregateUnpaidBookingDelta: aggregateDelta,
    waivedSubEuroDueBookings: bookingReports.filter(r => r.waivedSubEuroDue).map(r => r.id),
    blockers },
    apply ? "[whole-euro] APPLY backfill starting" : "[whole-euro] DRY RUN (no writes)");
  if (!apply) return;
  if (blockers.length) {
    logger.error({ blockers }, "[whole-euro] REFUSING APPLY: active booking price snapshots are unsafe");
    return;
  }

  await db.transaction(async tx => {
    for (const flight of flights) {
      await tx.update(flightsTable).set({
        adultPrice: String(roundWholeEuro(Number(flight.adultPrice))),
        childPrice: String(roundWholeEuro(Number(flight.childPrice))),
        infantPrice: String(roundWholeEuro(Number(flight.infantPrice))),
        checkedBaggagePrice: flight.checkedBaggagePrice == null ? null : String(roundWholeEuro(Number(flight.checkedBaggagePrice))),
        seatSelectionPrice: flight.seatSelectionPrice == null ? null : String(roundWholeEuro(Number(flight.seatSelectionPrice))),
        priorityBoardingPrice: flight.priorityBoardingPrice == null ? null : String(roundWholeEuro(Number(flight.priorityBoardingPrice))),
        insurancePrice: flight.insurancePrice == null ? null : String(roundWholeEuro(Number(flight.insurancePrice))),
        tax: String(roundWholeEuro(Number(flight.tax))),
      }).where(eq(flightsTable.id, flight.id));
    }
    // Only active sale prices are normalized. Existing payments and accounting
    // records are deliberately not queried or changed.
    for (const passenger of passengers) {
      const flight = flightById.get(bookings.find(b => b.id === passenger.bookingId)?.flightId ?? -1);
      const fallback = passenger.type === "child" ? flight?.childPrice : passenger.type === "infant" ? flight?.infantPrice : flight?.adultPrice;
      await tx.update(passengersTable).set({ ticketPrice: String(roundWholeEuro(Number(passenger.ticketPrice ?? fallback))) })
        .where(eq(passengersTable.id, passenger.id));
      await tx.update(passengersTable).set({ extraCost: String(roundWholeEuro(Number(passenger.extraCost))) })
        .where(eq(passengersTable.id, passenger.id));
    }
    for (const booking of bookings) {
      const pax = passengers.filter(p => p.bookingId === booking.id);
      const ex = extras.filter(e => e.bookingId === booking.id);
      const flight = flightById.get(booking.flightId);
      if (!flight) continue;
      for (const extra of ex) await tx.update(bookingExtrasTable)
        .set({ amount: String(roundWholeEuro(Number(extra.amount))) }).where(eq(bookingExtrasTable.id, extra.id));
      const canonical = canonicalBookingTotal(booking, pax, ex, flight);
      await tx.update(bookingsTable).set({
        discount: String(roundWholeEuro(Number(booking.discount))),
        markup: String(roundWholeEuro(Number(booking.markup))),
        netPrice: booking.netPrice == null ? null : String(roundWholeEuro(Number(booking.netPrice))),
      }).where(eq(bookingsTable.id, booking.id));
      await tx.update(bookingsTable).set({ totalAmount: String(canonical) }).where(eq(bookingsTable.id, booking.id));
    }
  });
  logger.info("[whole-euro] APPLY backfill complete");
}

if (process.argv[1]?.includes("backfill-whole-euro-prices")) {
  main().catch(err => {
    logger.error({ err }, "[whole-euro] backfill failed");
    process.exitCode = 1;
  });
}