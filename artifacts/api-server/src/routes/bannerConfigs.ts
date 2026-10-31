import { Router } from "express";
import { db, settingsTable, flightsTable, agencyGroupRulesTable, flightActivityAuditTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { readCampaignSnapshot, campaignKey } from "../lib/discountCampaigns";
import { campaignMatches, type DiscountCampaign } from "../lib/discountCampaignMath";
import { bannerKey, readBannerConfigs, invalidateBannerConfigs } from "../lib/offerBanners";
import { bannerWallTimeMs, defaultBanner, parseBannerInput } from "../lib/offerBannerMath";
import { notifyDataChanged } from "../lib/liveEvents";

const router = Router();
router.use("/banner-configs", (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm administratori." }); return; }
  next();
});
router.get("/banner-configs", async (_req, res) => {
  const [{ campaigns }, configs] = await Promise.all([readCampaignSnapshot(), readBannerConfigs()]);
  res.json({ serverNow: Date.now(), campaigns: campaigns.map(c => ({
    ...c, startsAtMs: bannerWallTimeMs(c.startsAt), endsAtMs: bannerWallTimeMs(c.endsAt),
    banner: configs.get(c.id) ?? defaultBanner(),
  })) });
});
router.put("/banner-configs/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/.test(id)) { res.status(400).json({ error: "ID e pavlefshme." }); return; }
  let input;
  try { input = parseBannerInput(req.body); }
  catch (err) { res.status(400).json({ error: (err as Error).message }); return; }
  const result = await db.transaction(async tx => {
    // Same lock as campaign edit/delete, so a banner cannot be saved against a deleted offer.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(4938291)`);
    const [campaignRow] = await tx.select().from(settingsTable).where(eq(settingsTable.key, campaignKey(id)));
    if (!campaignRow) return { error: "Oferta nuk ekziston.", status: 404 } as const;
    const [row] = await tx.select().from(settingsTable).where(eq(settingsTable.key, bannerKey(id)));
    const before = row ? parseBannerInput(JSON.parse(row.value!)) : defaultBanner();
    if (before.version !== input.version) return { error: "Baneri u ndryshua nga dikush tjetër. Rifresko para se të ruash.", status: 409 } as const;
    const banner = { ...input, version: input.version + 1 };
    await tx.insert(settingsTable).values({ key: bannerKey(id), value: JSON.stringify(banner) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(banner), updatedAt: new Date() } });
    const campaign = JSON.parse(campaignRow.value!) as DiscountCampaign;
    const from = campaign.periods.map(p => p.from).sort()[0];
    const to = campaign.periods.map(p => p.to).sort().at(-1)!;
    const [flights, rules] = await Promise.all([
      tx.select({ id: flightsTable.id, fromCity: flightsTable.fromCity, toCity: flightsTable.toCity, departureDate: flightsTable.departureDate })
        .from(flightsTable).where(sql`${flightsTable.departureDate} BETWEEN ${from} AND ${to}`),
      campaign.scope === "group" ? tx.select().from(agencyGroupRulesTable) : Promise.resolve([]),
    ]);
    const linked = flights.filter(f => campaignMatches(campaign, f, rules));
    for (let i = 0; i < linked.length; i += 200) await tx.insert(flightActivityAuditTable).values(linked.slice(i, i + 200).map(f => ({
      flightId: f.id, entityTable: "offer_banners", entityId: id, operation: row ? "UPDATE" : "INSERT",
      changes: [{ field: "banner", old: before, new: banner }], reference: campaign.name,
      userId: req.session!.userId, userName: (req.session as unknown as { userName?: string }).userName ?? null,
      userRole: "admin", origin: "PUT /banner-configs",
    })));
    return { banner } as const;
  });
  if ("error" in result) { res.status(result.status!).json({ error: result.error }); return; }
  invalidateBannerConfigs(); notifyDataChanged("banners");
  res.json({ banner: result.banner });
});
export default router;
