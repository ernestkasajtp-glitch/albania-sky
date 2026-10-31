import assert from "node:assert/strict";
import { agentBookingEmail } from "../src/lib/gmail.js";
import {
  ticketStatusEmailSubject,
  ticketStatusRecipientSubject,
  type TicketedBookingChange,
} from "../src/lib/ticketUpdateEmail.js";

const booking = {
  bookingRef: "KTF6544",
  customerName: "ERNEST KASAJI",
  pnr: "ABC123",
  passengers: [{
    firstName: "ERNEST",
    lastName: "KASAJI",
    type: "adult",
    pnr: "ABC123",
    ticketPrice: 190,
    extraCost: 0,
  }],
  flight: {
    fromCity: "TIA",
    toCity: "PSA",
    departureDate: "2026-09-20",
    departureTime: "17:25",
    arrivalTime: "19:10",
    flightNumber: "W4 5031",
  },
  totalAmount: 190,
};

const changes: TicketedBookingChange[] = [
  { kind: "passenger_name", label: "Passenger Name", oldValue: "ERNEST KASAJ", newValue: "ERNEST KASAJI" },
  { kind: "pnr", label: "PNR", oldValue: "DQRMPN", newValue: "ABC123" },
  { kind: "ticket_price", label: "Ticket Price", oldValue: "€170.00", newValue: "€190.00" },
];

const html = agentBookingEmail(booking, "confirmed", changes);
assert.match(html, /Ticket Details Updated/);
assert.match(html, /Passenger Name/);
assert.match(html, /DQRMPN/);
assert.match(html, /ABC123/);
assert.match(html, /background:#fee2e2;color:#b91c1c/);
assert.match(html, /background:#d1fae5;color:#047857/);
assert.match(html, /The updated ticket is attached to this email/);

const escaped = agentBookingEmail(booking, "confirmed", [
  { kind: "pnr", label: "PNR", oldValue: "<OLD>", newValue: "NEW & SAFE" },
]);
assert.match(escaped, /&lt;OLD&gt;/);
assert.match(escaped, /NEW &amp; SAFE/);
assert.doesNotMatch(escaped, /<OLD>/);

const maliciousBooking = {
  ...booking,
  customerName: "<img src=x>",
  pnr: "<NEW>",
  passengers: [{
    ...booking.passengers[0],
    firstName: "<ERNEST>",
    lastName: "KASAJI & CO",
    pnr: "<NEW>",
  }],
};
const safeBookingHtml = agentBookingEmail(maliciousBooking, "confirmed", [
  { kind: "pnr", label: "PNR", oldValue: "OLD", newValue: "<NEW>" },
]);
assert.doesNotMatch(safeBookingHtml, /<img src=x>|<ERNEST>|<NEW>/);
assert.match(safeBookingHtml, /&lt;NEW&gt;/);
assert.match(safeBookingHtml, /KASAJI &amp; CO/);

const withoutAttachment = agentBookingEmail(booking, "confirmed", changes, false);
assert.doesNotMatch(withoutAttachment, /updated ticket attached to this email/i);
assert.match(withoutAttachment, /Please use the updated details shown below/);

assert.equal(
  ticketStatusEmailSubject(booking, "Confirmed: KTF6544", changes),
  "PNR Updated: KTF6544 — DQRMPN → ABC123",
);
assert.equal(
  ticketStatusEmailSubject(booking, "Confirmed: KTF6544", [changes[0], changes[2]]),
  "Updated Ticket Details: KTF6544 — ERNEST KASAJI",
);
assert.equal(
  ticketStatusEmailSubject(booking, "Confirmed: KTF6544", []),
  "Confirmed: KTF6544",
);
assert.equal(
  ticketStatusRecipientSubject(
    "PNR Updated: KTF6544 — DQRMPN → ABC123",
    "CP-9988",
    changes,
  ),
  "PNR Updated: KTF6544 — DQRMPN → ABC123",
);
assert.equal(
  ticketStatusRecipientSubject("Confirmed: KTF6544", "CP-9988", []),
  "Confirmed: KTF6544 [CP-9988]",
);

console.log("ticket update email tests: OK");