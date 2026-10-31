import { campaignActive, campaignMatches, campaignOrder, tiraneMinute, type DiscountCampaign, type CampaignFlight, type CampaignGroupRule } from "./discountCampaignMath";
import type { DiscountChannel } from "./flightDiscountMath";

export const DEFAULT_BANNER_COLORS = {
  background: "#BD3348", border: "#E88797", title: "#FFFFFF",
  discount: "#FFFFFF", description: "#FFFFFF", periods: "#FFFFFF",
  countdownTitle: "#FFFFFF", countdownNumbers: "#FFFFFF", countdownLabels: "#FFFFFF",
  countdownBackground: "#C95064", countdownBorder: "#DC8493", expiry: "#FFFFFF",
};
export type BannerColors = typeof DEFAULT_BANNER_COLORS;
export type BannerConfig = { enabled: boolean; version: number; colors: BannerColors };
export const defaultBanner = (): BannerConfig => ({ enabled: false, version: 0, colors: { ...DEFAULT_BANNER_COLORS } });
/** Guest banners are announcements, not grants of flight or pricing access. */
export function guestBannerCampaigns(
  campaigns: DiscountCampaign[], configs: Map<string, BannerConfig>, now = new Date(),
): DiscountCampaign[] {
  const minute = tiraneMinute(now);
  return campaigns.filter(c => configs.get(c.id)?.enabled && campaignActive(c, minute)).sort(campaignOrder);
}
export function parseBannerInput(raw: unknown): BannerConfig {
  if (!raw || typeof raw !== "object") throw new Error("Konfigurim i pavlefshëm.");
  const d = raw as Record<string, unknown>;
  if (typeof d.enabled !== "boolean" || !Number.isSafeInteger(d.version) || Number(d.version) < 0)
    throw new Error("Mungon versioni ose statusi i banerit.");
  if (!d.colors || typeof d.colors !== "object" || Array.isArray(d.colors)) throw new Error("Ngjyrat mungojnë.");
  const values = d.colors as Record<string, unknown>;
  const colors = { ...DEFAULT_BANNER_COLORS };
  for (const key of Object.keys(colors) as (keyof BannerColors)[]) {
    if (typeof values[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(values[key] as string))
      throw new Error(`Ngjyrë e pavlefshme: ${key}. Përdor #RRGGBB.`);
    colors[key] = (values[key] as string).toUpperCase();
  }
  return { enabled: d.enabled, version: Number(d.version), colors };
}

/** Earliest instant corresponding to a Tirana wall minute (DST-aware).
 * Missing spring-forward times resolve to the first valid minute after the gap,
 * matching the campaign's lexical wall-time activation rule. */
export function bannerWallTimeMs(wall: string): number {
  const guess = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(guess)) throw new Error("Invalid campaign time");
  const represented = Date.parse(`${tiraneMinute(new Date(guess))}:00Z`);
  const candidate = guess - (represented - guess);
  const matches = [candidate - 3600000, candidate, candidate + 3600000]
    .filter(t => tiraneMinute(new Date(t)) === wall);
  if (matches.length) return Math.min(...matches);
  for (let t = candidate - 3600000; t <= candidate + 3600000; t += 60000) {
    if (tiraneMinute(new Date(t)) >= wall) return t;
  }
  throw new Error("Unable to resolve campaign time");
}

/** Select winners BEFORE checking banner enablement/channel: a hidden or
 * differently-scoped winner must never advertise a lower-priority discount. */
export function eligibleBannerCampaigns(
  campaigns: DiscountCampaign[], flights: CampaignFlight[], rules: CampaignGroupRule[],
  manualFlightIds: Set<number>, configs: Map<string, BannerConfig>, channel: DiscountChannel,
  now = new Date(),
): DiscountCampaign[] {
  const active = campaigns.filter(c => campaignActive(c, tiraneMinute(now))).sort(campaignOrder);
  const winners = new Set<string>();
  for (const flight of flights) {
    if (manualFlightIds.has(flight.id)) continue;
    const winner = active.find(c => campaignMatches(c, flight, rules));
    if (winner && (winner.channels ?? ["agents", "public"]).includes(channel) && configs.get(winner.id)?.enabled)
      winners.add(winner.id);
  }
  return active.filter(c => winners.has(c.id));
}
