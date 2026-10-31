export const DISCOUNT_CHANNELS = ["offline", "api", "agents", "public"] as const;
export type DiscountChannel = typeof DISCOUNT_CHANNELS[number];
export type FlightDiscount = { type: "percent" | "fixed"; value: number; channels?: DiscountChannel[] };
// Existing discounts keep their original audience; never opt partners in retroactively.
export const LEGACY_DISCOUNT_CHANNELS: DiscountChannel[] = ["agents", "public"];
export function discountForChannel(discount: FlightDiscount | null, channel: DiscountChannel): FlightDiscount | null {
  return discount && (discount.channels ?? LEGACY_DISCOUNT_CHANNELS).includes(channel) ? discount : null;
}
export function parseFlightDiscount(value: unknown, requireChannels = false): FlightDiscount | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("Invalid discount");
  const d = value as Record<string, unknown>;
  if ((d.type !== "percent" && d.type !== "fixed") || typeof d.value !== "number" ||
      !Number.isFinite(d.value) || d.value <= 0 || (d.type === "percent" && d.value > 100))
    throw new Error("Discount must be positive; percent cannot exceed 100");
  if (d.channels === undefined && !requireChannels) return { type: d.type, value: d.value };
  if (!Array.isArray(d.channels) || d.channels.length === 0 ||
      new Set(d.channels).size !== d.channels.length ||
      d.channels.some(c => !DISCOUNT_CHANNELS.includes(c as DiscountChannel))) {
    throw new Error("Zgjidh të paktën një kanal të vlefshëm për discount-in.");
  }
  return { type: d.type, value: d.value, channels: DISCOUNT_CHANNELS.filter(c => (d.channels as unknown[]).includes(c)) };
}
/** New sales only. Never call when recalculating existing ticket snapshots. */
export function applyFlightDiscount(price: number, discount: FlightDiscount | null): number {
  if (!discount) return price;
  return Math.round(Math.max(0, discount.type === "percent"
    ? price * (1 - discount.value / 100) : price - discount.value));
}
