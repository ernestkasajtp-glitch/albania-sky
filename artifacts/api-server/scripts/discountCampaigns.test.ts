import assert from "node:assert/strict";
import { campaignActive, campaignMatches, campaignOrder, parseCampaignInput, tiraneMinute, type DiscountCampaign } from "../src/lib/discountCampaignMath";
import { applyFlightDiscount, discountForChannel } from "../src/lib/flightDiscountMath";

const base = {
  name: "Oferta", enabled: true, type: "percent", value: 10, channels: ["agents", "public"],
  startsAt: "2026-10-14T10:00", endsAt: "2026-10-20T10:00",
  periods: [{ from: "2026-12-01", to: "2026-12-31" }, { from: "2027-02-01", to: "2027-02-28" }],
  scope: "all", fromAirport: null, toAirport: null, groupId: null, flightIds: [], priority: 0,
};
const campaign: DiscountCampaign = { ...parseCampaignInput(base), id: "test", version: 1, createdAt: "2026-10-14T07:00:00Z" };
const flight = { id: 5, fromCity: "TIA", toCity: "BER", departureDate: "2026-12-01" };
assert.equal(campaignActive(campaign, "2026-10-14T09:59"), false);
assert.equal(campaignActive(campaign, "2026-10-14T10:00"), true);
assert.equal(campaignActive(campaign, "2026-10-20T10:00"), false);
assert.equal(campaignActive({ ...campaign, enabled: false }, "2026-10-15T10:00"), false);
assert.equal(tiraneMinute(new Date("2026-10-14T08:00:00Z")), "2026-10-14T10:00");
assert.equal(tiraneMinute(new Date("2026-12-14T08:00:00Z")), "2026-12-14T09:00");
assert.equal(campaignMatches(campaign, flight, []), true);
assert.equal(campaignMatches(campaign, { ...flight, departureDate: "2026-12-31" }, []), true);
assert.equal(campaignMatches(campaign, { ...flight, departureDate: "2027-01-01" }, []), false);
assert.equal(campaignMatches(campaign, { ...flight, departureDate: "2027-02-10" }, []), true);
assert.equal(campaignMatches({ ...campaign, scope: "route", fromAirport: "TIA", toAirport: "BER" }, flight, []), true);
assert.equal(campaignMatches({ ...campaign, scope: "route", fromAirport: "BER", toAirport: "TIA" }, flight, []), false);
assert.equal(campaignMatches({ ...campaign, scope: "flights", flightIds: [5] }, flight, []), true);
assert.equal(campaignMatches({ ...campaign, scope: "flights", flightIds: [6] }, flight, []), false);
const grouped = { ...campaign, scope: "group" as const, groupId: 9 };
const rule = { groupId: 9, airport: "TIA", direction: "from", dateFrom: "2026-12-01", dateTo: "2026-12-31" };
assert.equal(campaignMatches(grouped, flight, [rule]), true);
assert.equal(campaignMatches(grouped, flight, [{ ...rule, direction: "to" }]), false);
assert.equal(campaignMatches(grouped, flight, [{ ...rule, dateFrom: "2026-12-02" }]), false);
assert.equal(campaignMatches(grouped, flight, [{ ...rule, groupId: 8 }]), false);
assert.ok(campaignOrder({ ...campaign, priority: 10 }, campaign) < 0);
assert.ok(campaignOrder({ ...campaign, createdAt: "2026-10-15T07:00:00Z" }, campaign) < 0);
assert.equal(applyFlightDiscount(105, discountForChannel(campaign, "agents")), 95);
assert.equal(applyFlightDiscount(105, discountForChannel(campaign, "api")), 105);
assert.equal(applyFlightDiscount(5, { ...campaign, type: "fixed", value: 10 }), 0);
for (const bad of [
  { endsAt: base.startsAt }, { startsAt: "2026-02-30T12:00" }, { channels: [] },
  { value: 101 }, { periods: [] }, { periods: [{ from: "2027-02-30", to: "2027-03-01" }] },
  { scope: "group", groupId: null }, { scope: "flights", flightIds: [] },
  { scope: "route", fromAirport: "TIA", toAirport: "TIA" }, { priority: -1 },
]) assert.throws(() => parseCampaignInput({ ...base, ...bad }));
console.log("Discount campaign boundary, matching, validation and money assertions passed.");
