import { parseFlightDiscount, type FlightDiscount } from "./flightDiscountMath";

export type DiscountCampaign = FlightDiscount & {
  id: string; name: string; enabled: boolean; startsAt: string; endsAt: string;
  periods: { from: string; to: string }[];
  scope: "all" | "route" | "group" | "flights";
  fromAirport: string | null; toAirport: string | null; groupId: number | null;
  flightIds: number[]; priority: number; version: number; createdAt: string;
};
export type CampaignFlight = { id: number; fromCity: string; toCity: string; departureDate: string };
export type CampaignGroupRule = { groupId: number; airport: string; direction: string; dateFrom: string | null; dateTo: string | null };

export function tiraneMinute(now = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const dateValid = (v: unknown): v is string => typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const minuteValid = (v: unknown): v is string => typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) && dateValid(v.slice(0, 10));

export function parseCampaignInput(raw: unknown): Omit<DiscountCampaign, "id" | "version" | "createdAt"> {
  if (!raw || typeof raw !== "object") throw new Error("Oferta nuk është e vlefshme.");
  const d = raw as Record<string, unknown>;
  const discount = parseFlightDiscount(d, true)!;
  if (typeof d.name !== "string" || !d.name.trim() || d.name.length > 120) throw new Error("Vendos emrin (deri 120 shkronja).");
  if (typeof d.enabled !== "boolean") throw new Error("Status i pavlefshëm.");
  if (!minuteValid(d.startsAt) || !minuteValid(d.endsAt) || d.startsAt >= d.endsAt)
    throw new Error("Afati i mbarimit duhet të jetë pas fillimit (ora e Tiranës).");
  if (!Array.isArray(d.periods) || !d.periods.length || d.periods.length > 24) throw new Error("Vendos 1–24 periudha fluturimesh.");
  const periods = d.periods.map(p => {
    if (!p || !dateValid(p.from) || !dateValid(p.to) || p.from > p.to) throw new Error("Periudhë fluturimi e pavlefshme.");
    return { from: p.from as string, to: p.to as string };
  });
  if (!["all", "route", "group", "flights"].includes(String(d.scope))) throw new Error("Përzgjedhje e pavlefshme.");
  const scope = d.scope as DiscountCampaign["scope"];
  const airport = (v: unknown) => typeof v === "string" ? v.trim().toUpperCase() : "";
  const fromAirport = airport(d.fromAirport), toAirport = airport(d.toAirport);
  if (scope === "route" && (!/^[A-Z]{3}$/.test(fromAirport) || !/^[A-Z]{3}$/.test(toAirport) || fromAirport === toAirport))
    throw new Error("Zgjidh aeroportet e nisjes dhe mbërritjes.");
  if (scope === "group" && (!Number.isSafeInteger(d.groupId) || Number(d.groupId) < 1)) throw new Error("Zgjidh grupin.");
  const flightIds = Array.isArray(d.flightIds) ? d.flightIds : [];
  if (scope === "flights" && (!flightIds.length || flightIds.length > 2000 ||
    flightIds.some(id => !Number.isSafeInteger(id) || Number(id) < 1))) throw new Error("Zgjidh 1–2000 fluturime të vlefshme.");
  if (!Number.isSafeInteger(d.priority) || Number(d.priority) < 0 || Number(d.priority) > 1000) throw new Error("Prioriteti duhet të jetë 0–1000.");
  return {
    ...discount, name: d.name.trim(), enabled: d.enabled, startsAt: d.startsAt, endsAt: d.endsAt,
    periods, scope, fromAirport: scope === "route" ? fromAirport : null, toAirport: scope === "route" ? toAirport : null,
    groupId: scope === "group" ? Number(d.groupId) : null,
    flightIds: scope === "flights" ? [...new Set(flightIds as number[])] : [], priority: Number(d.priority),
  };
}
export function campaignActive(c: DiscountCampaign, minute: string): boolean {
  return c.enabled && c.startsAt <= minute && minute < c.endsAt;
}
export function campaignMatches(c: DiscountCampaign, f: CampaignFlight, rules: CampaignGroupRule[]): boolean {
  if (!c.periods.some(p => p.from <= f.departureDate && f.departureDate <= p.to)) return false;
  if (c.scope === "all") return true;
  if (c.scope === "flights") return c.flightIds.includes(f.id);
  const from = f.fromCity.trim().toUpperCase(), to = f.toCity.trim().toUpperCase();
  if (c.scope === "route") return c.fromAirport === from && c.toAirport === to;
  return rules.some(r => r.groupId === c.groupId &&
    (!r.dateFrom || r.dateFrom <= f.departureDate) && (!r.dateTo || f.departureDate <= r.dateTo) &&
    ((["either", "from"].includes(r.direction) && r.airport === from) ||
      (["either", "to"].includes(r.direction) && r.airport === to)));
}
export function campaignOrder(a: DiscountCampaign, b: DiscountCampaign): number {
  return b.priority - a.priority || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}
