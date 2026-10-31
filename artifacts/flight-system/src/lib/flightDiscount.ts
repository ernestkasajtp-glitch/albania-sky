export const FLIGHT_DISCOUNT_CHANNELS = ["offline", "api", "agents", "public"] as const;
export type FlightDiscountChannel = typeof FLIGHT_DISCOUNT_CHANNELS[number];
/** Legacy discounts (no channels) apply only to agents + public — never silently API/offline. */
export const LEGACY_FLIGHT_DISCOUNT_CHANNELS: FlightDiscountChannel[] = ["agents", "public"];
export const DEFAULT_FLIGHT_DISCOUNT_CHANNELS: FlightDiscountChannel[] = [...FLIGHT_DISCOUNT_CHANNELS];
export const FLIGHT_DISCOUNT_CHANNEL_LABELS: Record<FlightDiscountChannel, string> = {
  offline: "OFFLINE", api: "API", agents: "TË GJITHË AGJENTËT", public: "PUBLIC",
};

export type FlightDiscount = { type: "percent" | "fixed"; value: number; channels: FlightDiscountChannel[] };
export type FlightDiscountInput = { type: "percent" | "fixed"; value: number; channels: FlightDiscountChannel[] };

/** Canonical order. ONLY missing (undefined) -> legacy [agents, public].
 *  null / non-array / empty / unknown / duplicate entries -> null (fail closed). */
export function parseFlightDiscountChannels(raw: unknown): FlightDiscountChannel[] | null {
  if (raw === undefined) return [...LEGACY_FLIGHT_DISCOUNT_CHANNELS];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!raw.every(c => typeof c === "string" && (FLIGHT_DISCOUNT_CHANNELS as readonly string[]).includes(c))) return null;
  const set = new Set(raw as string[]);
  if (set.size !== raw.length) return null;
  return FLIGHT_DISCOUNT_CHANNELS.filter(c => set.has(c));
}

/** True when the flight carries a discount object whose channels are malformed. */
export function hasInvalidFlightDiscountChannels(flight: unknown): boolean {
  const d = (flight as any)?.flightDiscount;
  return !!d && typeof d === "object" && parseFlightDiscountChannels(d.channels) === null;
}

export function sameChannelSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a), sb = new Set(b);
  return sa.size === sb.size && [...sa].every(c => sb.has(c));
}

export function flightDiscountChannelsLabel(channels: readonly FlightDiscountChannel[]): string {
  return FLIGHT_DISCOUNT_CHANNELS.filter(c => channels.includes(c)).map(c => FLIGHT_DISCOUNT_CHANNEL_LABELS[c]).join(" · ");
}

/** Internal booking channel: agency selected -> agents, otherwise (null/NaN/missing) -> public. */
export function bookingDiscountChannel(selectedAgent: unknown): FlightDiscountChannel {
  return selectedAgent ? "agents" : "public";
}

/** Returns the flight discount; if `channel` is given, null unless the discount applies to it. */
export function getFlightDiscount(flight: unknown, channel?: FlightDiscountChannel): FlightDiscount | null {
  const d = (flight as any)?.flightDiscount;
  if (!d || (d.type !== "percent" && d.type !== "fixed")) return null;
  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const channels = parseFlightDiscountChannels(d.channels);
  if (!channels) return null;
  if (channel && !channels.includes(channel)) return null;
  return { type: d.type, value, channels };
}

/** Mirrors backend applyFlightDiscount: whole euro, floored at 0. New sales only. */
export function applyFlightDiscount(price: number, d: FlightDiscount | null): number {
  if (!d) return price;
  return Math.round(Math.max(0, d.type === "percent" ? price * (1 - d.value / 100) : price - d.value));
}

export function flightDiscountLabel(d: { type: "percent" | "fixed"; value: number }): string {
  return d.type === "percent" ? `−${d.value}%` : `−€${d.value}`;
}

/** Returns error message (Albanian) or null. */
export function validateFlightDiscount(type: string, raw: string): string | null {
  const v = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(v) || v <= 0) return "Vlera duhet të jetë numër pozitiv";
  if (type === "percent" && v > 100) return "Përqindja nuk mund të kalojë 100";
  return null;
}

export function validateFlightDiscountChannels(channels: readonly string[]): string | null {
  return channels.length === 0 ? "Zgjidh të paktën një kanal" : null;
}
