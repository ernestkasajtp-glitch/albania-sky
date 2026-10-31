/** Pricing policy: newly calculated/saved customer prices are whole euros. */
export function roundWholeEuro(value: number): number {
  if (!Number.isFinite(value)) throw new Error(`Invalid monetary value: ${value}`);
  return Math.round(value);
}

/** Whole-euro amount still due; sub-euro historical residue is waived. */
export function wholeEuroDue(total: number, paid: number): number {
  const raw = Number(total) - Number(paid);
  if (!Number.isFinite(raw) || raw <= 0 || raw < 1) return 0;
  return roundWholeEuro(raw);
}

/** Whole-euro excess for credit/refund decisions; sub-euro excess is waived. */
export function wholeEuroOverpay(paid: number, total: number): number {
  const raw = Number(paid) - Number(total);
  if (!Number.isFinite(raw) || raw <= 0 || raw < 1) return 0;
  return roundWholeEuro(raw);
}

export function wholeEuroString(value: number): string {
  return String(roundWholeEuro(value));
}

/** Presentation-only formatter. Historical accounting values are not changed. */
export function formatWholeEuro(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : String(value);
}

/** Normalize a user supplied flight/extra/booking price patch before persistence. */
export function normalizeMonetaryFields<T extends Record<string, any>>(value: T): T {
  const fields = [
    "adultPrice", "childPrice", "infantPrice", "citizenPrice", "netPrice",
    "tax", "checkedBaggagePrice", "seatSelectionPrice",
    "priorityBoardingPrice", "insurancePrice", "totalAmount", "paidAmount",
    "markup", "commission", "discount", "ticketPrice", "extraCost", "amount",
  ];
  const out: Record<string, any> = { ...value };
  for (const field of fields) {
    if (!(field in out) || out[field] === null || out[field] === undefined || out[field] === "") continue;
    const n = Number(out[field]);
    if (Number.isFinite(n)) out[field] = String(roundWholeEuro(n));
  }
  return out as T;
}