import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, settingsTable, flightsTable, agencyGroupsTable, agencyGroupRulesTable, flightActivityAuditTable } from "@workspace/db";
import { eq, inArray, like, sql } from "drizzle-orm";
import { parseCampaignInput, campaignMatches, tiraneMinute, type DiscountCampaign } from "../lib/discountCampaignMath";
import { campaignKey, campaignChanged } from "../lib/discountCampaigns";
import { bannerKey, invalidateBannerConfigs } from "../lib/offerBanners";
import { enqueueOfferEmail, offerEmailSummary } from "../lib/offerEmailQueue";

const router = Router();
router.use("/discount-campaigns", (req, res, next) => {
  if (req.session?.role !== "admin") { res.status(403).json({ error: "Vetëm administratori." }); return; }
  next();
});
router.get("/discount-campaigns", async (_req, res) => {
  const [rows, groups, flights, emailRows] = await Promise.all([
    db.select().from(settingsTable).where(like(settingsTable.key, "discountCampaign.%")),
    db.select().from(agencyGroupsTable),
    db.select({ id: flightsTable.id, fromAirport: flightsTable.fromCity, toAirport: flightsTable.toCity,
      departureDate: flightsTable.departureDate, flightNumber: flightsTable.flightNumber })
      .from(flightsTable).where(sql`${flightsTable.departureDate} >= ${tiraneMinute().slice(0, 10)}`)
      .orderBy(flightsTable.departureDate, flightsTable.id),
    db.select().from(settingsTable).where(like(settingsTable.key, "offerEmail.%")),
  ]);
  const emailStates = new Map(emailRows.map(r => [r.key.slice("offerEmail.".length), offerEmailSummary(r.value)]));
  res.json({ campaigns: rows.map(r => { const c = JSON.parse(r.value!); return { ...c, emailDelivery: emailStates.get(c.id) ?? null }; }), groups, flights });
});
class CampaignError extends Error { constructor(public status: number, message: string) { super(message); } }

router.all(["/discount-campaigns", "/discount-campaigns/:id"], async (req, res, next) => {
  if (!["POST", "PUT", "DELETE"].includes(req.method)) { next(); return; }
  const creating = req.method === "POST", removing = req.method === "DELETE";
  const id = creating ? randomUUID() : String(req.params.id);
  if ((creating && req.params.id) || (!creating && !/^[0-9a-f-]{36}$/.test(id))) {
    res.status(400).json({ error: "ID e pavlefshme." }); return;
  }
  let input: ReturnType<typeof parseCampaignInput> | undefined;
  try { if (!removing) input = parseCampaignInput(req.body); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  if (!creating && (!Number.isSafeInteger(req.body?.version) || req.body.version < 1)) {
    res.status(400).json({ error: "Mungon versioni i ofertës. Rifresko faqen." }); return;
  }
  try {
    const campaign = await db.transaction(async tx => {
      // Serialize administrative campaign writes only, never booking or pricing reads.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(4938291)`);
      const token = creating && typeof req.body?.creationToken === "string" ? req.body.creationToken : null;
      if (token && !/^[0-9a-f-]{36}$/i.test(token)) throw new CampaignError(400, "Kërkesë e pavlefshme.");
      if (token) {
        const [previous] = await tx.select().from(settingsTable).where(eq(settingsTable.key, `offerCreate.${token}`));
        if (previous?.value) {
          const previousData = JSON.parse(previous.value) as { input: unknown; id: string };
          if (JSON.stringify(previousData.input) !== JSON.stringify(input)) throw new CampaignError(409, "Kjo kërkesë është përdorur. Mbyll dhe rihap formularin.");
          const [saved] = await tx.select().from(settingsTable).where(eq(settingsTable.key, campaignKey(previousData.id)));
          if (!saved?.value) throw new CampaignError(409, "Oferta e kësaj kërkese nuk ekziston më.");
          return JSON.parse(saved.value) as DiscountCampaign;
        }
      }
      const [row] = await tx.select().from(settingsTable).where(eq(settingsTable.key, campaignKey(id)));
      const before = row ? JSON.parse(row.value!) as DiscountCampaign : null;
      if (!creating && !before) throw new CampaignError(404, "Oferta nuk ekziston.");
      if (before && before.version !== req.body.version) throw new CampaignError(409, "Oferta është ndryshuar nga dikush tjetër. Rifresko faqen.");
      if (creating) {
        const count = await tx.select({ count: sql<number>`count(*)::int` }).from(settingsTable).where(like(settingsTable.key, "discountCampaign.%"));
        if (count[0].count >= 250) throw new CampaignError(400, "Maksimumi 250 oferta. Hiq ofertat që nuk duhen.");
      }
      if (input?.scope === "group") {
        const group = await tx.select({ id: agencyGroupsTable.id }).from(agencyGroupsTable).where(eq(agencyGroupsTable.id, input.groupId!));
        if (!group.length) throw new CampaignError(400, "Grupi nuk ekziston.");
      }
      if (input?.scope === "flights") {
        const found = await tx.select({ id: flightsTable.id }).from(flightsTable).where(inArray(flightsTable.id, input.flightIds));
        if (found.length !== input.flightIds.length) throw new CampaignError(400, "Një fluturim i zgjedhur nuk ekziston.");
      }
      const after: DiscountCampaign | null = removing ? null : {
        ...input!, id, version: (before?.version ?? 0) + 1, createdAt: before?.createdAt ?? new Date().toISOString(),
      };
      if (removing) {
        await tx.delete(settingsTable).where(eq(settingsTable.key, bannerKey(id)));
        await tx.delete(settingsTable).where(eq(settingsTable.key, campaignKey(id)));
      }
      else if (creating) await tx.insert(settingsTable).values({ key: campaignKey(id), value: JSON.stringify(after) });
      else await tx.update(settingsTable).set({ value: JSON.stringify(after), updatedAt: new Date() }).where(eq(settingsTable.key, campaignKey(id)));
      // Preserve campaign configuration changes in every currently linked flight's history.
      // Bulk select + bulk insert; no per-flight SQL or background repricing writes.
      const periods = [before, after].flatMap(c => c?.periods ?? []);
      if (periods.length) {
        const from = periods.map(p => p.from).sort()[0], to = periods.map(p => p.to).sort().at(-1)!;
        const [flights, rules] = await Promise.all([
          tx.select({ id: flightsTable.id, fromCity: flightsTable.fromCity, toCity: flightsTable.toCity, departureDate: flightsTable.departureDate })
            .from(flightsTable).where(sql`${flightsTable.departureDate} BETWEEN ${from} AND ${to}`),
          [before, after].some(c => c?.scope === "group") ? tx.select().from(agencyGroupRulesTable) : Promise.resolve([]),
        ]);
        const linked = flights.filter(f => [before, after].some(c => c && campaignMatches(c, f, rules)));
        for (let i = 0; i < linked.length; i += 200) {
          await tx.insert(flightActivityAuditTable).values(linked.slice(i, i + 200).map(f => ({
            flightId: f.id, entityTable: "discount_campaigns", entityId: id,
            operation: creating ? "INSERT" : removing ? "DELETE" : "UPDATE",
            changes: [{ field: "discount_campaign", old: before, new: after }],
            reference: (after ?? before)!.name, userId: req.session!.userId,
            userName: (req.session as unknown as { userName?: string }).userName ?? null,
            userRole: "admin", origin: `${req.method} /discount-campaigns`,
          })));
        }
      }
      if (creating && after) await enqueueOfferEmail(tx, after);
      if (token && after) await tx.insert(settingsTable).values({ key: `offerCreate.${token}`, value: JSON.stringify({ input, id: after.id }) });
      return after;
    });
    campaignChanged();
    if (removing) invalidateBannerConfigs();
    res.status(creating ? 201 : 200).json(removing ? { ok: true } : { campaign });
  } catch (error) {
    if (error instanceof CampaignError) { res.status(error.status).json({ error: error.message }); return; }
    req.log.error({ err: error }, "Discount campaign save failed");
    res.status(500).json({ error: "Ruajtja dështoi. Asnjë ndryshim nuk u ruajt." });
  }
});
export default router;
