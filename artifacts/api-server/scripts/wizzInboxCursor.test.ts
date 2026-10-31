import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canCommitWizzInboxCursor,
  extractPnrFromWizzItinerarySubject,
  selectWizzEmailCandidate,
  selectWizzEmailForUnassignedPassenger,
  type FetchTicketResult,
} from "../src/lib/wizzTicket.js";

const complete: FetchTicketResult = { found: true, url: "/api/uploads/tickets/test.pdf" };
const partial: FetchTicketResult = {
  found: true,
  reason: "Emaili më i fundit: 1 biletë ekzistuese, 1 pa email",
  matchedCount: 1,
  expectedCount: 2,
  missingPassengers: ["TEST USER"],
};
const expectedNoEmail: FetchTicketResult = {
  found: false,
  reason: "Emaili më i fundit: 0 bileta ekzistuese, 1 pa email",
};
const transientCompletePdfFailure: FetchTicketResult = {
  found: false,
  reason: "Gabim lidhjeje me inbox-in",
  retryable: true,
};

assert.equal(canCommitWizzInboxCursor([complete]), true);
assert.equal(canCommitWizzInboxCursor([partial, expectedNoEmail]), true);
assert.equal(
  canCommitWizzInboxCursor([complete, transientCompletePdfFailure]),
  false,
  "një gabim teknik te një rezervim me PDF ekzistues duhet ta lërë UID-në për retry",
);
assert.equal(extractPnrFromWizzItinerarySubject("Your travel itinerary: Ab12CD"), "AB12CD");
assert.equal(extractPnrFromWizzItinerarySubject("Ihre Reiseroute - ZX9K2P"), "ZX9K2P");
assert.equal(extractPnrFromWizzItinerarySubject("Important changes to your flight AB12CD"), null);
const olderFullMatch = selectWizzEmailCandidate(
  [{ id: "new", full: false, pax: ["A"] }, { id: "old", full: true, pax: ["A", "B"] }],
  candidate => candidate.full,
  candidate => candidate.pax,
);
assert.equal(
  olderFullMatch?.candidate.id,
  "old",
  "një email i vlefshëm më i vjetër duhet të përdoret kur ai i fundit nuk përputhet",
);
assert.deepEqual(olderFullMatch?.matched, ["A", "B"]);

const latestPartialOnly = selectWizzEmailCandidate(
  [{ id: "new", full: false, pax: ["A"] }, { id: "old", full: false, pax: ["B"] }],
  candidate => candidate.full,
  candidate => candidate.pax,
);
assert.equal(
  latestPartialOnly?.candidate.id,
  "new",
  "pa përputhje të plotë, partial-i duhet të mbetet vetëm nga email-i më i fundit",
);
assert.deepEqual(latestPartialOnly?.matched, ["A"]);

assert.equal(
  selectWizzEmailForUnassignedPassenger(
    { id: "selected", pax: ["A"] },
    [{ id: "selected", pax: ["A"] }, { id: "other", pax: ["B"] }],
    candidate => candidate.pax.includes("B"),
  ),
  null,
  "pasagjeri pa PNR nuk duhet marrë nga një email tjetër nga ai i PDF-së",
);

const cronSource = fs.readFileSync("src/lib/cron.ts", "utf8");
const integritySweep = cronSource.match(
  /const runWizzFileIntegritySweep = async \(\) => \{([\s\S]*?)\n  \};/,
)?.[1] ?? "";
assert.ok(integritySweep, "duhet të ekzistojë kontrolli lokal i integritetit");
assert.doesNotMatch(
  integritySweep,
  /fetchWizzTicketForBooking/,
  "kontrolli periodik pa UID të ri nuk duhet të kërkojë inbox-in",
);

const bookingsSource = fs.readFileSync("src/routes/bookings.ts", "utf8");
const automaticFetchCalls = [...bookingsSource.matchAll(/void fetchWizzTicketForBooking\(/g)];
assert.equal(
  automaticFetchCalls.length,
  0,
  "ndryshimi i statusit nuk duhet të nisë kërkim automatik pa UID të ri",
);
assert.match(
  bookingsSource,
  /router\.post\("\/bookings\/:id\/fetch-ticket-email"[\s\S]*?await fetchWizzTicketForBooking\(id\)/,
  "kërkimi manual duhet të mbetet i disponueshëm si override i qëllimshëm",
);

console.log("wizzInboxCursor tests: OK");