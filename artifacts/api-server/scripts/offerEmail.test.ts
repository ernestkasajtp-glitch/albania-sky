import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { db, state } from "./offerEmailDoubles";
import { enqueueOfferEmail, offerEmailKey, offerEmailSummary, processOfferEmails, offerRecipients } from "../src/lib/offerEmailQueue";
import { offerEmailTemplate } from "../src/lib/offerEmailTemplate";
import { tiraneMinute, type DiscountCampaign } from "../src/lib/discountCampaignMath";

const c: DiscountCampaign = { id: "test-offer", name: "<script>alert(1)</script>\r\nTest", enabled: true, type: "percent", value: 5,
  channels: ["agents"], startsAt: "2020-01-01T00:00", endsAt: "2099-10-27T23:59", periods: [{ from: "2026-10-27", to: "2027-01-31" }],
  scope: "all", fromAirport: null, toAirport: null, groupId: null, flightIds: [], priority: 0, version: 1, createdAt: new Date().toISOString() };
function reset() {
  state.rows.clear(); state.sent = []; state.alerts = []; state.fail = false;
  state.agents = [
    { email: "Agency@Example.com", status: "active", notifyByEmail: true },
    { email: "agency@example.com", status: "active", notifyByEmail: true },
    { email: "blocked@example.com", status: "inactive", notifyByEmail: true },
    { email: "optout@example.com", status: "active", notifyByEmail: false },
    { email: "bad@example.com,other@example.com", status: "active", notifyByEmail: true },
  ];
  state.rows.set(`discountCampaign.${c.id}`, { key: `discountCampaign.${c.id}`, value: JSON.stringify(c) });
}
const queue = () => JSON.parse(state.rows.get(offerEmailKey(c.id)).value);
assert.deepEqual(offerRecipients([
  { email: " Test@Example.com ", status: "active", notifyByEmail: true },
  { email: "test@example.com", status: "active", notifyByEmail: true },
]), ["test@example.com"]);
const msg = offerEmailTemplate(c);
assert.match(msg.subject, /5% ulje/);
assert.match(msg.htmlBody, /27 tetor 2026/);
assert.match(msg.htmlBody, /31 janar 2027/);
assert.match(msg.htmlBody, /&lt;script&gt;/);
assert.doesNotMatch(msg.htmlBody, /<script>/);
assert.match(msg.htmlBody, /images\/offers\/flight-offer.jpg/);
assert.doesNotMatch(msg.htmlBody, /Portali B2B|Oferta e nëntorit|10%/);
assert.match(offerEmailTemplate({ ...c, type: "fixed", value: 20 }).subject, /20 € ulje/);
assert.doesNotMatch(msg.subject, /[\r\n]/);

reset();
// Existing campaigns are never scanned into announcements.
await processOfferEmails(); assert.equal(state.sent.length, 0);
await enqueueOfferEmail(db, c);
await enqueueOfferEmail(db, c);
assert.equal(queue().deliveries.length, 1);
await Promise.all([processOfferEmails(), processOfferEmails()]);
assert.equal(state.sent.length, 1);
assert.equal(queue().deliveries[0].state, "sent");
await processOfferEmails(); assert.equal(state.sent.length, 1);
assert.equal(offerEmailSummary(state.rows.get(offerEmailKey(c.id)).value)?.sent, 1);

reset(); await enqueueOfferEmail(db, c); state.fail = true;
await processOfferEmails(); assert.equal(queue().deliveries[0].state, "failed");
state.fail = false; await processOfferEmails(); assert.equal(state.sent.length, 0);

for (const mutation of ["disabled", "deleted", "edited", "expired"]) {
  reset(); await enqueueOfferEmail(db, c);
  const key = `discountCampaign.${c.id}`;
  if (mutation === "deleted") state.rows.delete(key);
  else state.rows.set(key, { key, value: JSON.stringify({ ...c, ...(mutation === "disabled" ? { enabled: false } : mutation === "edited" ? { version: 2 } : { endsAt: "2020-01-02T00:00" }) }) });
  await processOfferEmails(); assert.equal(state.sent.length, 0, mutation); assert.equal(queue().deliveries[0].state, "cancelled");
}
reset(); await enqueueOfferEmail(db, c); state.agents[0].notifyByEmail = false; state.agents[1].notifyByEmail = false;
await processOfferEmails(); assert.equal(state.sent.length, 0); assert.equal(queue().deliveries[0].state, "cancelled");

reset(); await enqueueOfferEmail(db, c);
const q = queue(); q.deliveries[0] = { email: "agency@example.com", state: "sending", at: 1 };
state.rows.get(offerEmailKey(c.id)).value = JSON.stringify(q);
await processOfferEmails(); assert.equal(queue().deliveries[0].state, "uncertain"); assert.equal(state.sent.length, 0); assert.equal(state.alerts.length, 1);

for (const patch of [{ enabled: false }, { channels: ["public"] as any }, { endsAt: tiraneMinute() }]) {
  reset(); await enqueueOfferEmail(db, { ...c, ...patch }); assert.equal(queue().deliveries.length, 0); await processOfferEmails(); assert.equal(state.sent.length, 0);
}
const route = readFileSync("src/routes/discountCampaigns.ts", "utf8");
assert.match(route, /if \(creating && after\) await enqueueOfferEmail\(tx, after\)/);
assert.match(route, /pg_advisory_xact_lock/);
assert.match(route, /offerCreate\.\$\{token\}/);
console.log("Offer email tests passed: template, safety, dedupe, concurrency, failures, cancellation, restart, consent, no backfill.");
