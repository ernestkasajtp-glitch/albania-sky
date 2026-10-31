type NumericValue = number | string | null | undefined;

export interface FlightSalesAggregate {
  bookingCount: NumericValue;
  netCount: NumericValue;
  totalSales: NumericValue;
  totalNet: NumericValue;
  totalCommission: NumericValue;
}

export interface FlightSalesSummary {
  salesBookingCount: number;
  salesTotal: number;
  salesNetTotal: number | null;
  salesCommissionTotal: number;
}

const money = (value: NumericValue): number =>
  Math.round((Number(value) || 0) * 100) / 100;

export function formatFlightSalesSummary(
  aggregate: FlightSalesAggregate | null | undefined,
): FlightSalesSummary {
  if (!aggregate) {
    return {
      salesBookingCount: 0,
      salesTotal: 0,
      salesNetTotal: null,
      salesCommissionTotal: 0,
    };
  }

  const bookingCount = Number(aggregate.bookingCount) || 0;
  const netCount = Number(aggregate.netCount) || 0;
  const hasCompleteNet = bookingCount > 0 && netCount === bookingCount;

  return {
    salesBookingCount: bookingCount,
    salesTotal: money(aggregate.totalSales),
    salesNetTotal: hasCompleteNet ? money(aggregate.totalNet) : null,
    salesCommissionTotal: money(aggregate.totalCommission),
  };
}