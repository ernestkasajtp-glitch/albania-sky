import assert from "node:assert/strict";
import { activityPath, agentActivityEvent } from "./agentActivityEvent.js";
assert.equal(activityPath("/flights?from=DTM&to=PRN&date=2026-12-19&adults=2&token=secret&email=private@example.com"), "/flights?from=DTM&to=PRN&date=2026-12-19&adults=2");
assert.equal(activityPath("//external.com/"), "/");
assert.equal(activityPath("javascript:alert(1)"), "/");
const search = agentActivityEvent({ type: "search", path: "/flights", search: {
  from: "DTM", to: "PRN", date: "2026-12-19", adults: 2, children: 1, infants: 1,
} })!;
assert.equal(search.type, "search");
assert.match(search.description, /DTM → PRN · 2026-12-19 · 4 persona \(2 të rritur, 1 fëmijë, 1 foshnja\)/);
assert.equal(search.statusCode, null);
assert.equal(agentActivityEvent({ type: "search", search: { adults: -1 } }), null);
assert.equal(agentActivityEvent({ type: "login", agentId: 99 }), null);
assert.equal(agentActivityEvent({ type: "search", search: { from: ["DTM"], to: "PRN", date: "2026-12-19", adults: 1, children: 0, infants: 0 } }), null);
assert.equal(agentActivityEvent({ type: "search", search: { from: "DTM", to: "PRN", date: "2026-02-31", adults: 1, children: 0, infants: 0 } }), null);
const click = agentActivityEvent({ type: "click", path: "/flights", label: "Rezervo", target: "/flights/55?adults=2&password=secret", agentId: 999 })!;
assert.equal(click.description, "Klikoi: Rezervo → /flights/55?adults=2");
assert.equal("agentId" in click, false);
assert.equal(agentActivityEvent({ path: "/my-bookings", title: "Untrusted title" })?.description, "Hapi faqen: /my-bookings");
console.log("PASS: search details, click targets, query sanitization, unsupported types, identity not client-controlled.");