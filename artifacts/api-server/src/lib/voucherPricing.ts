// Shared price breakdown for the booking voucher (PDF + HTML email).
// Mirrors recalcBookingTotalExcludingCancelled:
//   total = Σ ticketPrice(active) − discount + tax + Σ extraCost(active)  (+ booking extras)
// The per-passenger ticketPrice is the FINAL price (agent markup/discount
// already folded in per the money rule), so it is shown/charged/stored as-is.

export interface VoucherPaxLine {
  name: string;
  type: "adult" | "child" | "infant";
  cancelled: boolean;
  price: number; // effective per-person ticket price
  extraCost: number; // per-person extras (baggage/seat/etc.) folded
  pnr: string | null; // per-passenger airline PNR (own pnr or resolved group pnr)
}

export interface VoucherExtraLine {
  description: string;
  amount: number;
}

// Per-category breakdown of the per-passenger extras (seats / baggage /
// priority / insurance), so the voucher itemizes them instead of lumping
// everything into one "Seat & baggage extras" line.
export interface VoucherExtraCategory {
  key: "seats" | "baggage" | "priority" | "insurance";
  label: string;
  count: number; // active passengers that selected this extra
  amount: number; // total charged for this category (0 when free/included)
}

export interface VoucherPricing {
  pax: VoucherPaxLine[];
  activePaxCount: number;
  ticketTotal: number;
  paxExtrasTotal: number;
  paxExtrasBreakdown: VoucherExtraCategory[];
  bookingExtras: VoucherExtraLine[];
  bookingExtrasTotal: number;
  extrasTotal: number;
  tax: number;
  discount: number;
  total: number;
}

export function computeVoucherPricing(booking: any): VoucherPricing {
  const flight = booking?.flight ?? {};
  const passengers: any[] = Array.isArray(booking?.passengers) ? booking.passengers : [];

  const defPrice = (t: string): number =>
    t === "child"
      ? Number(flight.childPrice ?? 0)
      : t === "infant"
        ? Number(flight.infantPrice ?? 0)
        : Number(flight.adultPrice ?? 0);

  const pax: VoucherPaxLine[] = passengers.map((p) => {
    const type = (p?.type ?? "adult") as VoucherPaxLine["type"];
    const price = p?.ticketPrice != null ? Number(p.ticketPrice) : defPrice(type);
    return {
      name: [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "—",
      type,
      cancelled: !!p?.cancelled,
      price: isNaN(price) ? 0 : price,
      extraCost: Number(p?.extraCost ?? 0) || 0,
      pnr: (p?.pnr || p?.groupPnr || null) as string | null,
    };
  });

  const active = pax.filter((p) => !p.cancelled);
  const ticketTotal = active.reduce((s, p) => s + p.price, 0);
  const paxExtrasTotal = active.reduce((s, p) => s + p.extraCost, 0);

  // Per-category extras breakdown. Mirrors the canonical extraCost formula in
  // bookings.ts (flag × flight price). Only categories selected by at least one
  // active passenger are listed; the amount may be 0 when the extra is free.
  const checkedPrice  = Number(flight.checkedBaggagePrice   ?? 0) || 0;
  const seatPrice     = Number(flight.seatSelectionPrice    ?? 0) || 0;
  const priorityPrice = Number(flight.priorityBoardingPrice ?? 0) || 0;
  const insurancePrice = Number(flight.insurancePrice       ?? 0) || 0;
  const activeRaw = passengers.filter((p) => !p?.cancelled);
  const cat = {
    seats:     { count: 0, amount: 0 },
    baggage:   { count: 0, amount: 0 },
    priority:  { count: 0, amount: 0 },
    insurance: { count: 0, amount: 0 },
  };
  for (const p of activeRaw) {
    if (p?.baggageOption === "checked") { cat.baggage.count++;   cat.baggage.amount   += checkedPrice; }
    if (p?.hasSeatSelection)            { cat.seats.count++;     cat.seats.amount     += seatPrice; }
    if (p?.hasPriorityBoarding)         { cat.priority.count++;  cat.priority.amount  += priorityPrice; }
    if (p?.hasInsurance)                { cat.insurance.count++; cat.insurance.amount += insurancePrice; }
  }
  const breakdown: VoucherExtraCategory[] = [];
  if (cat.seats.count > 0)     breakdown.push({ key: "seats",     label: "Seats",     count: cat.seats.count,     amount: cat.seats.amount });
  if (cat.baggage.count > 0)   breakdown.push({ key: "baggage",   label: "Baggage",   count: cat.baggage.count,   amount: cat.baggage.amount });
  if (cat.priority.count > 0)  breakdown.push({ key: "priority",  label: "Priority",  count: cat.priority.count,  amount: cat.priority.amount });
  if (cat.insurance.count > 0) breakdown.push({ key: "insurance", label: "Insurance", count: cat.insurance.count, amount: cat.insurance.amount });

  // Only surface the itemized breakdown when it RECONCILES with the authoritative
  // paxExtrasTotal (the sum of stored sale-time extraCost snapshots). If flight
  // extra prices changed after the sale — or legacy/manual data drifts — the
  // recomputed rows would not add up to the charged total, so fall back to the
  // single lumped line. This guarantees the summary never shows rows that
  // disagree with what was actually charged.
  const breakdownSum = breakdown.reduce((s, c) => s + c.amount, 0);
  const paxExtrasBreakdown: VoucherExtraCategory[] =
    Math.round(breakdownSum * 100) === Math.round(paxExtrasTotal * 100) ? breakdown : [];

  const bookingExtras: VoucherExtraLine[] = Array.isArray(booking?.extras)
    ? booking.extras.map((e: any) => ({
        description: String(e?.description ?? "Extra"),
        amount: Number(e?.amount ?? 0) || 0,
      }))
    : [];
  const bookingExtrasTotal = bookingExtras.reduce((s, e) => s + e.amount, 0);

  const tax = Number(flight.tax ?? 0) || 0;
  const discount = Number(booking?.discount ?? 0) || 0;

  const total =
    booking?.totalAmount != null
      ? Number(booking.totalAmount)
      : Math.round(
          (ticketTotal - discount + tax + paxExtrasTotal + bookingExtrasTotal) * 100,
        ) / 100;

  return {
    pax,
    activePaxCount: active.length,
    ticketTotal,
    paxExtrasTotal,
    paxExtrasBreakdown,
    bookingExtras,
    bookingExtrasTotal,
    extrasTotal: paxExtrasTotal + bookingExtrasTotal,
    tax,
    discount,
    total: isNaN(total) ? 0 : total,
  };
}
