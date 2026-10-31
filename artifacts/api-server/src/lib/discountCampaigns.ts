import { db, settingsTable, agencyGroupRulesTable } from "@workspace/db";
import { like } from "drizzle-orm";
import { campaignActive, tiraneMinute, type DiscountCampaign } from "./discountCampaignMath";
import { notifyDataChanged } from "./liveEvents";
import { triggerCpExportSoon } from "./cpExport";
import { logger } from "./logger";

export const campaignKey = (id: string) => `discountCampaign.${id}`;
let generation = 0;
type Snapshot = { at: number; campaigns: DiscountCampaign[]; rules: (typeof agencyGroupRulesTable.$inferSelect)[] };
let cache: Snapshot | null = null;
let pending: Promise<Snapshot> | null = null;
export function invalidateCampaigns(): void { generation++; cache = null; pending = null; }
export async function readCampaignSnapshot() {
  if (cache && Date.now() - cache.at < 15_000) return cache;
  if (pending) return pending;
  const owner = generation;
  const load = (async () => {
    const rows = await db.select().from(settingsTable).where(like(settingsTable.key, "discountCampaign.%"));
    const campaigns = rows.map(r => JSON.parse(r.value!) as DiscountCampaign);
    const rules = campaigns.some(c => c.scope === "group")
      ? await db.select().from(agencyGroupRulesTable) : [];
    const result = { at: Date.now(), campaigns, rules };
    if (owner === generation) cache = result;
    return result;
  })();
  pending = load;
  try { return await load; } finally { if (pending === load) pending = null; }
}
export function campaignChanged(): void {
  invalidateCampaigns();
  notifyDataChanged("discounts");
  notifyDataChanged("flights");
  triggerCpExportSoon();
}
let timer: ReturnType<typeof setInterval> | undefined;
/** One bounded snapshot read per minute, never per flight. Pricing checks actual time on every read. */
export function startDiscountCampaignClock(): void {
  if (timer) return;
  let signature: string | undefined;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const { campaigns } = await readCampaignSnapshot();
      const now = tiraneMinute();
      const next = campaigns.filter(c => campaignActive(c, now)).map(c => `${c.id}:${c.version}`).sort().join(",");
      if (signature !== next) {
        notifyDataChanged("discounts"); notifyDataChanged("flights");
        // On boot reconcile exports too: an offer may have expired while offline.
        if (campaigns.length || signature) triggerCpExportSoon();
        signature = next;
      }
    } catch (err) { logger.error({ err }, "Discount campaign clock failed"); }
    finally { busy = false; }
  };
  timer = setInterval(() => void tick(), 30_000);
  timer.unref();
  void tick();
}
