import { db, settingsTable, agentsTable } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";
import { type DiscountCampaign, tiraneMinute } from "./discountCampaignMath";
import { offerEmailTemplate } from "./offerEmailTemplate";
import { sendEmailStrict } from "./gmail";
import { reportOperationalFailure } from "./operationalFailures";
import { notifyDataChanged } from "./liveEvents";
import { logger } from "./logger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Delivery = { email: string; state: "pending" | "sending" | "sent" | "failed" | "uncertain" | "cancelled"; at?: number };
type Queue = { campaign: DiscountCampaign; deliveries: Delivery[]; done: boolean; reason?: string };
export const offerEmailKey = (id: string) => `offerEmail.${id}`;

export function offerRecipients(rows: { email: string; status: string; notifyByEmail: boolean }[]) {
  return [...new Set(rows.filter(r => r.status === "active" && r.notifyByEmail)
    .map(r => r.email.trim().toLowerCase()).filter(email => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)))];
}
/** Called only from POST, inside the campaign transaction. Never backfills old campaigns. */
export async function enqueueOfferEmail(tx: Tx, campaign: DiscountCampaign) {
  const eligible = campaign.enabled && campaign.endsAt > tiraneMinute() && campaign.channels?.includes("agents");
  const recipients = eligible ? offerRecipients(await tx.select({
    email: agentsTable.email, status: agentsTable.status, notifyByEmail: agentsTable.notifyByEmail,
  }).from(agentsTable)) : [];
  const queue: Queue = { campaign, deliveries: recipients.map(email => ({ email, state: "pending" })), done: !recipients.length,
    reason: !eligible ? "Oferta joaktive, e përfunduar ose pa kanalin Agjentët." : !recipients.length ? "Nuk ka agjentë aktivë me email dhe njoftime të lejuara." : undefined };
  await tx.insert(settingsTable).values({ key: offerEmailKey(campaign.id), value: JSON.stringify(queue) }).onConflictDoNothing();
}
export function offerEmailSummary(value: string | null) {
  if (!value) return null;
  const q = JSON.parse(value) as Queue;
  const count = (state: Delivery["state"]) => q.deliveries.filter(d => d.state === state).length;
  return { total: q.deliveries.length, sent: count("sent"), pending: count("pending") + count("sending"),
    failed: count("failed") + count("uncertain"), cancelled: count("cancelled"), reason: q.reason ?? null };
}
let running = false;
let started = false;
async function save(key: string, old: string, queue: Queue) {
  return (await db.update(settingsTable).set({ value: JSON.stringify(queue), updatedAt: new Date() })
    .where(and(eq(settingsTable.key, key), eq(settingsTable.value, old))).returning({ key: settingsTable.key })).length > 0;
}
export async function processOfferEmails() {
  if (running) return;
  running = true;
  try {
    const jobs = await db.select().from(settingsTable).where(like(settingsTable.key, "offerEmail.%"));
    for (const row of jobs) {
      if (!row.value) continue;
      const q = JSON.parse(row.value) as Queue;
      if (q.done) continue;
      // SMTP outcome after a crash is unknowable. Never automatically repeat it.
      const stale = q.deliveries.find(d => d.state === "sending" && Date.now() - (d.at ?? 0) > 600_000);
      if (stale) {
        stale.state = "uncertain";
        q.done = !q.deliveries.some(d => d.state === "pending" || d.state === "sending");
        if (await save(row.key, row.value, q)) {
          await reportOperationalFailure(`offer-email-${q.campaign.id}`, "Email oferte me rezultat të panjohur", new Error("Dërgimi u ndërpre; kontrollo marrësit para çdo ridërgimi."), false);
          notifyDataChanged("discounts");
        }
        continue;
      }
      if (q.deliveries.some(d => d.state === "sending")) continue;
      const delivery = q.deliveries.find(d => d.state === "pending");
      if (!delivery) continue;
      const [live] = await db.select().from(settingsTable).where(eq(settingsTable.key, `discountCampaign.${q.campaign.id}`));
      const current = live?.value ? JSON.parse(live.value) as DiscountCampaign : null;
      // Never announce a deleted, disabled, expired or changed offer using stale terms.
      if (!current?.enabled || current.version !== q.campaign.version || current.endsAt <= tiraneMinute()) {
        q.deliveries.forEach(d => { if (d.state === "pending") d.state = "cancelled"; });
        q.done = true; q.reason = "Dërgimet e mbetura u ndalën sepse oferta ndryshoi, u çaktivizua ose përfundoi.";
        await save(row.key, row.value, q); notifyDataChanged("discounts"); continue;
      }
      // Recheck recipient consent immediately before sending.
      const active = offerRecipients(await db.select({
        email: agentsTable.email, status: agentsTable.status, notifyByEmail: agentsTable.notifyByEmail,
      }).from(agentsTable));
      if (!active.includes(delivery.email)) {
        delivery.state = "cancelled";
        q.done = !q.deliveries.some(d => d.state === "pending");
        await save(row.key, row.value, q); continue;
      }
      delivery.state = "sending"; delivery.at = Date.now();
      if (!await save(row.key, row.value, q)) continue;
      const claimed = JSON.stringify(q);
      try {
        const message = offerEmailTemplate(q.campaign);
        // Strict sender persists failures in the existing admin email recovery list.
        await sendEmailStrict(delivery.email, message.subject, message.htmlBody);
        delivery.state = "sent";
      } catch {
        delivery.state = "failed";
      }
      q.done = !q.deliveries.some(d => d.state === "pending");
      await save(row.key, claimed, q);
      notifyDataChanged("discounts");
      // One recipient per tick: bounded SMTP load, never block campaign creation.
      break;
    }
  } catch (error) {
    logger.error({ err: error }, "Offer email worker failed");
    await reportOperationalFailure("offer-email-worker", "Dërgimi i ofertave", error, false);
  } finally { running = false; }
}
export function startOfferEmailWorker() {
  if (started) return;
  started = true;
  setInterval(() => { void processOfferEmails(); }, 5000).unref();
}
