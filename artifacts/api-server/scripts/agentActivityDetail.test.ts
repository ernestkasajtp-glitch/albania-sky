import assert from "node:assert/strict";
import { agentActivityEvent } from "../src/lib/agentActivityEvent";
import { activityApiDescription, activityResponse } from "../src/lib/activityDescription";
import { activityDayRange, previousActivityDay, renderActivityPdf } from "../src/lib/agentActivityReport";
import { PDFDocument } from "pdf-lib";

async function main() {
  const search = { from: "SKP", to: "BGY", date: "2027-01-05", adults: 1, children: 0, infants: 0 };
  assert.match(agentActivityEvent({ type: "search_result", search, count: 3 })!.description, /U gjetën 3/);
  assert.equal(agentActivityEvent({ type: "search_result", search, count: -1 }), null);
  assert.equal(agentActivityEvent({ type: "search", search: { ...search, date: "2027-02-30" } }), null);
  assert.match(agentActivityEvent({ type: "search", search: { ...search, date: "", from: "", to: "" } })!.description, /Të gjitha/);
  assert.match(agentActivityEvent({ path: "/booking-engine/my-bookings/KTF3009" })!.description, /Detajet e rezervimit KTF3009/);
  assert.equal(agentActivityEvent({ type: "password", value: "secret" }), null);
  const link = activityResponse("/public/bookings/KTF3009/pok-initiate", { confirmUrl: "SECRET", reused: true, token: "SECRET" });
  assert.match(link, /ekzistues/); assert.ok(!link.includes("SECRET"));
  assert.match(activityApiDescription("POST", "/public/bookings/KTF3009/pok-initiate", 503), /dështoi/);
  assert.ok(!activityApiDescription("GET", "/public/flights?password=SECRET&from=SKP", 200).includes("SECRET"));
  assert.equal(previousActivityDay(new Date("2026-03-29T22:01:00Z")), "2026-03-29");
  const spring = activityDayRange("2026-03-29"), autumn = activityDayRange("2026-10-25");
  assert.equal(spring[1].getTime() - spring[0].getTime(), 23 * 3600000);
  assert.equal(autumn[1].getTime() - autumn[0].getTime(), 25 * 3600000);
  assert.throws(() => activityDayRange("2026-02-30"));
  async function* fixture() {
    yield Array.from({ length: 70 }, (_, i) => ({
      id: i + 1, agentId: 1, userId: 1, type: "search", method: null, path: "/flights",
      description: `Kërkoi SKP → BGY · €109 · Shqipëri • ${"detaje ".repeat(30)}`,
      ip: "127.0.0.1", userAgent: "Synthetic test browser", statusCode: null, createdAt: new Date(),
    }));
  }
  const pdf = await renderActivityPdf("Agjenci prove", "2026-10-28", fixture());
  const loaded = await PDFDocument.load(pdf);
  assert.ok(loaded.getPageCount() > 1);
  assert.ok(pdf.length > 1000);
  console.log("Activity privacy, descriptions, search results, DST day boundaries and multipage PDF passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
