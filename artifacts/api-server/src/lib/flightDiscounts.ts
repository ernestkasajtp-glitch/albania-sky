import { db, settingsTable, flightsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { parseFlightDiscount, type FlightDiscount } from "./flightDiscountMath";
import { readCampaignSnapshot } from "./discountCampaigns";
import { campaignActive, campaignMatches, campaignOrder, tiraneMinute } from "./discountCampaignMath";
export { applyFlightDiscount, parseFlightDiscount, discountForChannel, type FlightDiscount } from "./flightDiscountMath";
export const flightDiscountKey = (id: number) => `flightDiscount.${id}`;
export async function readManualFlightDiscounts(ids: number[]): Promise<Map<number, FlightDiscount>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, unique.map(flightDiscountKey)));
  return new Map(rows.flatMap(row => {
    const d = parseFlightDiscount(JSON.parse(row.value ?? "null"));
    return d ? [[Number(row.key.slice("flightDiscount.".length)), d] as const] : [];
  }));
}
export async function readFlightDiscounts(ids: number[]): Promise<Map<number, FlightDiscount>> {
  const result = await readManualFlightDiscounts(ids);
  const remaining = [...new Set(ids)].filter(id => !result.has(id));
  if (!remaining.length) return result;
  const { campaigns, rules } = await readCampaignSnapshot();
  const now = tiraneMinute();
  const active = campaigns.filter(c => campaignActive(c, now)).sort(campaignOrder);
  if (!active.length) return result;
  const flights = await db.select({
    id: flightsTable.id, fromCity: flightsTable.fromCity, toCity: flightsTable.toCity,
    departureDate: flightsTable.departureDate,
  }).from(flightsTable).where(inArray(flightsTable.id, remaining));
  for (const flight of flights) {
    const campaign = active.find(c => campaignMatches(c, flight, rules));
    if (campaign) result.set(flight.id, { type: campaign.type, value: campaign.value, channels: campaign.channels });
  }
  return result;
}
export async function readFlightDiscount(id: number) {
  return (await readFlightDiscounts([id])).get(id) ?? null;
}
