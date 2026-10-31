import assert from "node:assert/strict";
import { bannerWallTimeMs, defaultBanner, eligibleBannerCampaigns, guestBannerCampaigns, parseBannerInput } from "../src/lib/offerBannerMath";
import { parseCampaignInput, type DiscountCampaign } from "../src/lib/discountCampaignMath";

const c: DiscountCampaign = { ...parseCampaignInput({
  name: "Offer", enabled: true, type: "percent", value: 15, channels: ["public"],
  startsAt: "2026-10-01T10:00", endsAt: "2026-10-20T10:00", periods: [{ from: "2026-11-01", to: "2026-11-30" }],
  scope: "all", priority: 0,
}), id: "one", createdAt: "2026-10-01T00:00:00Z", version: 1 };
const flight = { id: 1, fromCity: "TIA", toCity: "BER", departureDate: "2026-11-12" };
const config = { ...defaultBanner(), enabled: true, version: 1 };
const now = new Date("2026-10-15T10:00:00Z");
const configs = new Map([["one", config], ["two", config]]);
const eligible = (campaigns: DiscountCampaign[], channel: "agents" | "public" = "public", manual = new Set<number>()) =>
  eligibleBannerCampaigns(campaigns, [flight], [], manual, configs, channel, now);
assert.equal(eligible([c]).length, 1);
assert.equal(eligible([c], "agents").length, 0);
assert.equal(eligible([c], "public", new Set([1])).length, 0);
assert.equal(eligible([{ ...c, enabled: false }]).length, 0);
assert.equal(eligible([{ ...c, startsAt: "2026-10-16T00:00" }]).length, 0);
assert.equal(eligible([{ ...c, endsAt: "2026-10-15T12:00" }]).length, 0);
assert.equal(eligible([{ ...c, periods: [{ from: "2027-01-01", to: "2027-02-01" }] }]).length, 0);
assert.equal(eligible([{ ...c, scope: "flights", flightIds: [2] }]).length, 0);
const higher = { ...c, id: "two", priority: 10, channels: ["agents"] as const };
assert.equal(eligible([c, { ...higher, channels: [...higher.channels] }]).length, 0, "winning agent-only offer must suppress lower public banner");
assert.equal(eligible([c, { ...higher, channels: [...higher.channels] }], "agents")[0].id, "two");
configs.set("two", { ...config, enabled: false });
assert.equal(eligible([c, { ...higher, channels: ["public"] }]).length, 0, "disabled winning banner cannot advertise a lower offer");
assert.equal(eligibleBannerCampaigns([c], [], [], new Set(), configs, "public", now).length, 0);
assert.equal(guestBannerCampaigns([c], configs, now).length, 1, "guest announcements need no visible flights");
assert.equal(guestBannerCampaigns([{ ...c, channels: ["agents"] }], configs, now).length, 1, "agent offers can be announced before login");
assert.equal(guestBannerCampaigns([{ ...c, enabled: false }], configs, now).length, 0);
assert.equal(guestBannerCampaigns([{ ...c, startsAt: "2026-10-16T00:00" }], configs, now).length, 0);
assert.equal(guestBannerCampaigns([{ ...c, endsAt: "2026-10-15T12:00" }], configs, now).length, 0);
assert.equal(guestBannerCampaigns([c], new Map(), now).length, 0);
assert.equal(guestBannerCampaigns([c], new Map([["one", { ...config, enabled: false }]]), now).length, 0);
assert.equal(bannerWallTimeMs("2026-10-15T12:00"), Date.parse("2026-10-15T10:00:00Z"));
assert.equal(bannerWallTimeMs("2026-12-15T12:00"), Date.parse("2026-12-15T11:00:00Z"));
assert.equal(bannerWallTimeMs("2026-03-29T02:30"), Date.parse("2026-03-29T01:00:00Z"));
assert.equal(bannerWallTimeMs("2026-10-25T02:30"), Date.parse("2026-10-25T00:30:00Z"));
assert.deepEqual(parseBannerInput(defaultBanner()), defaultBanner());
assert.throws(() => parseBannerInput({ ...config, colors: { ...config.colors, background: "url(https://example.com)" } }));
assert.throws(() => parseBannerInput({ ...config, colors: {} }));
assert.throws(() => parseBannerInput({ ...config, version: -1 }));
console.log("Banner eligibility, precedence, timing/DST and safe-color checks passed.");
