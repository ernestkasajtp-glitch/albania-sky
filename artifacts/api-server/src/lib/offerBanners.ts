import { db, settingsTable } from "@workspace/db";
import { like } from "drizzle-orm";
import { parseBannerInput, type BannerConfig } from "./offerBannerMath";

export const bannerKey = (id: string) => `offerBanner.${id}`;
let generation = 0;
let cache: { at: number; configs: Map<string, BannerConfig> } | null = null;
let pending: Promise<Map<string, BannerConfig>> | null = null;
export function invalidateBannerConfigs() { generation++; cache = null; pending = null; }
export async function readBannerConfigs(): Promise<Map<string, BannerConfig>> {
  if (cache && Date.now() - cache.at < 15000) return cache.configs;
  if (pending) return pending;
  const owner = generation;
  const load = (async () => {
    const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "offerBanner.%"));
    const configs = new Map(rows.map(row => [row.key.slice("offerBanner.".length), parseBannerInput(JSON.parse(row.value!))]));
    if (generation === owner) cache = { at: Date.now(), configs };
    return configs;
  })();
  pending = load;
  try { return await load; } finally { if (pending === load) pending = null; }
}
