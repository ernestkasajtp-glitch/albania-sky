import assert from "node:assert/strict";
import { activityLabel, activityValue, offlineText, technicalActivity } from "../src/lib/flightActivityDisplay.ts";

assert.equal(activityLabel("booking_ref"), "Referenca e rezervimit");
assert.equal(activityLabel("seat_checked_at"), "Koha e kontrollit të vendeve");
assert.equal(activityValue("source", "CitizenPlane"), "Offline");
assert.equal(offlineText("Citizen Plane / CITIZENPLANE / citizen"), "Offline / Offline / Offline");
assert.equal(activityValue("notes", { source: "CitizenPlane", nested: ["Citizen Plane"] }), '{"source":"Offline","nested":["Offline"]}');
assert.equal(activityValue("ticket_email_pending", "false"), "Jo");
assert.equal(activityValue("status", "draft"), "Draft");
assert.match(activityValue("schedule_alert", "not_found"), /nuk konfirmon anulimin/);
assert.equal(activityValue("customer_email", "[E mbrojtur]"), "Vlerë e mbrojtur");
assert.equal(technicalActivity("flights", [{field:"seat_checked_at"}]), "Kontroll teknik i vendeve");
assert.equal(technicalActivity("flights", [{field:"schedule_alert"},{field:"schedule_miss_count"}]), "Kontroll teknik i orarit");
assert.equal(technicalActivity("flights", [{field:"seat_checked_at"},{field:"sold_seats"}]), null);
assert.equal(technicalActivity("bookings", [{field:"seat_checked_at"}]), null);
console.log("Flight activity display tests passed");
