import assert from "node:assert/strict";
import fs from "node:fs";
import {
  acquireTicketEmailSend,
  shouldKeepTicketEmailPending,
} from "../src/lib/ticketEmailDelivery.js";

// I njëjti rezervim mund të ketë vetëm një dërgim aktiv.
const releaseFirst = acquireTicketEmailSend(101);
assert.ok(releaseFirst);
assert.equal(acquireTicketEmailSend(101), null);

// Rezervime të ndryshme nuk bllokojnë njëri-tjetrin.
const releaseSecond = acquireTicketEmailSend(202);
assert.ok(releaseSecond);
releaseSecond();

// Release është idempotent dhe lejon retry pas përfundimit.
releaseFirst();
releaseFirst();
const releaseRetry = acquireTicketEmailSend(101);
assert.ok(releaseRetry);
releaseRetry();

assert.equal(shouldKeepTicketEmailPending("sent"), false);
assert.equal(shouldKeepTicketEmailPending("failed"), true);
assert.equal(shouldKeepTicketEmailPending("skipped"), true);

// Mbrojtje strukturore: të dyja degët e /ticket duhet të marrin të njëjtin lock.
const source = fs.readFileSync("src/routes/bookings.ts", "utf8");
const ticketRoute = source.match(
  /router\.patch\("\/bookings\/:id\/ticket"[\s\S]*?\n\}\);\n\nrouter\.patch\("\/bookings\/:id\/ticket-without-email"/,
)?.[0] ?? "";
assert.ok(ticketRoute, "duhet të ekzistojë route-i i lëshimit të biletës");
assert.equal(
  [...ticketRoute.matchAll(/acquireTicketEmailSend\(params\.data\.id\)/g)].length,
  2,
  "retry dhe lëshimi fillestar duhet të përdorin të njëjtin lock",
);
assert.match(
  ticketRoute,
  /shouldKeepTicketEmailPending\(outcome\)/,
  "gjendja pending duhet të varet nga rezultati real i emailit",
);

const withoutEmailRoute = source.match(
  /router\.patch\("\/bookings\/:id\/ticket-without-email"[\s\S]*?\n\}\);/,
)?.[0] ?? "";
assert.ok(withoutEmailRoute, "duhet të ekzistojë route-i pa email");
assert.doesNotMatch(
  withoutEmailRoute,
  /sendAgentStatusEmail|sendEmailStrict/,
  "Lësho pa Dërguar nuk duhet të nisë email për agjentin",
);
assert.match(
  withoutEmailRoute,
  /ticketEmailPending: true/,
  "Lësho pa Dërguar duhet ta ruajë emailin si pending",
);

console.log("ticketEmailDelivery tests: OK");