import { eq, sql, inArray } from "drizzle-orm";
import {
  db, bookingsTable, flightsTable, passengersTable,
  paymentsTable, agentsTable, bookingExtrasTable,
} from "@workspace/db";
import { wholeEuroDue } from "./money.js";

/**
 * Deprecated: split feature was removed. Returns empty map. Kept for back-compat with callers.
 */
export async function getSplitNetTotalsMap(_bookingIds: number[]): Promise<Map<number, number>> {
  return new Map<number, number>();
}

/**
 * Calculates commission for a booking given its totalAmount and main netPrice.
 * The splitNetTotal parameter is kept for back-compat but is effectively always 0.
 */
export function calcCombinedNetAndCommission(
  totalAmount: number,
  mainNetPrice: number | null | undefined,
  _splitNetTotal: number,
  fallbackMarkup: number
): { combinedNet: number | null; commission: number } {
  if (mainNetPrice == null) {
    return { combinedNet: null, commission: fallbackMarkup };
  }
  if (mainNetPrice <= 0) {
    return { combinedNet: mainNetPrice, commission: 0 };
  }
  // Komisioni mund të dalë NEGATIV kur neto > shitja (humbja llogaritet realisht,
  // zgjedhje e përdoruesit 2026-07-12); mos e prit në 0.
  return { combinedNet: mainNetPrice, commission: totalAmount - mainNetPrice };
}

export async function getFullBooking(id: number) {
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!booking) return null;

  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, booking.flightId));
  const passengers = await db.select().from(passengersTable).where(eq(passengersTable.bookingId, id));
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.bookingId, id));
  const extras = await db.select().from(bookingExtrasTable).where(eq(bookingExtrasTable.bookingId, id));

  let agentName: string | null = null;
  if (booking.agentId) {
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, booking.agentId));
    agentName = agent?.name ?? null;
  }

  const formattedFlight = flight ? {
    ...flight,
    netPrice: undefined, // çmimi neto informativ i fluturimit — vetëm te lista e fluturimeve (admin)
    adultPrice: Number(flight.adultPrice),
    childPrice: Number(flight.childPrice),
    infantPrice: Number(flight.infantPrice),
    tax: Number(flight.tax),
    cabinBaggageKg: flight.cabinBaggageKg != null ? Number(flight.cabinBaggageKg) : null,
    checkedBaggageKg: flight.checkedBaggageKg != null ? Number(flight.checkedBaggageKg) : null,
    checkedBaggagePrice: flight.checkedBaggagePrice != null ? Number(flight.checkedBaggagePrice) : null,
    seatSelectionPrice: flight.seatSelectionPrice != null ? Number(flight.seatSelectionPrice) : null,
    priorityBoardingPrice: flight.priorityBoardingPrice != null ? Number(flight.priorityBoardingPrice) : null,
    insurancePrice: flight.insurancePrice != null ? Number(flight.insurancePrice) : null,
    availableSeats: flight.totalSeats - flight.soldSeats,
    createdAt: flight.createdAt.toISOString(),
    updatedAt: flight.updatedAt.toISOString(),
  } : null;

  const totalPaid = payments
    .filter(p => p.status === "completed" && !p.isRefund)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const totalRefunded = payments
    .filter(p => p.status === "completed" && p.isRefund)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const paidAmount = Math.max(0, totalPaid - totalRefunded);
  const totalAmount = Number(booking.totalAmount);

  return {
    ...booking,
    totalAmount,
    paidAmount,
    dueAmount: wholeEuroDue(totalAmount, paidAmount),
    markup: Number(booking.markup),
    commission: Number(booking.commission),
    discount: Number((booking as any).discount ?? 0),
    pnr: booking.pnr ?? null,
    netPrice: booking.netPrice != null ? Number(booking.netPrice) : null,
    commissionAmount: booking.netPrice != null
      ? (Number(booking.netPrice) <= 0 ? 0 : Math.round((totalAmount - Number(booking.netPrice)) * 100) / 100)
      : null,
    agentName,
    flight: formattedFlight,
    passengers: passengers.map(p => ({
      ...p,
      extraCost: Number(p.extraCost),
      ticketPrice: p.ticketPrice != null ? Number(p.ticketPrice) : null,
      cancelled: (p as any).cancelled ?? false,
      createdAt: p.createdAt.toISOString(),
    })),
    payments: payments.map(p => ({
      ...p,
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString(),
    })),
    extras: extras.map(e => ({
      ...e,
      amount: Number(e.amount),
      createdAt: e.createdAt.toISOString(),
    })),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}
