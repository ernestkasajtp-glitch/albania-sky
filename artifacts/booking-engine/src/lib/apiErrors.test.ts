import assert from "node:assert/strict";
import { after, test } from "node:test";
import i18n from "../i18n";
import { api } from "./api";
import { bookingCreateErrorMessage } from "./bookingError";
import { safeApiErrorMessage } from "./apiErrors";

const previousFetch = globalThis.fetch;
after(() => { globalThis.fetch = previousFetch; });

function fail(status: number, error: unknown): void {
  globalThis.fetch = async () => new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("English booking errors translate Albanian validation and keep status for login redirect", async () => {
  await i18n.changeLanguage("en");
  fail(400, "Shitja e biletave për këtë fluturim ka përfunduar.");
  await assert.rejects(api.createBooking({}), (err: Error & { status?: number }) => {
    assert.match(bookingCreateErrorMessage(err), /Ticket sales.*closed/);
    assert.equal(err.status, 400);
    return true;
  });
  fail(401, "Authentication required");
  await assert.rejects(api.createBooking({}), (err: Error & { status?: number }) => {
    assert.equal(err.status, 401);
    assert.match(err.message, /sign in again/);
    return true;
  });
});

test("Albanian and English known public and auth errors are localized", async () => {
  await i18n.changeLanguage("sq");
  fail(409, "Email already registered");
  await assert.rejects(api.register({}), /Ky email është regjistruar/);
  await i18n.changeLanguage("en");
  fail(400, "Not enough seats available");
  await assert.rejects(api.createBooking({}), /aren't enough seats/);
  fail(401, "Invalid credentials");
  await assert.rejects(api.login({}), /Email or password is incorrect/);
});

test("raw technical errors, malformed bodies and server failures never reach customers", async () => {
  await i18n.changeLanguage("en");
  fail(400, 'SQLITE_CONSTRAINT: INSERT INTO bookings...');
  await assert.rejects(api.createBooking({}), (err: Error) => {
    assert.doesNotMatch(err.message, /SQL|INSERT|try again\.$/);
    return true;
  });
  fail(500, 'relation "bookings" does not exist');
  await assert.rejects(api.createBooking({}), (err: Error & { status?: number }) => {
    assert.equal(err.status, 500);
    assert.equal(bookingCreateErrorMessage(err), safeApiErrorMessage(500, undefined, "en", "booking"));
    assert.doesNotMatch(err.message, /relation|create your booking/);
    return true;
  });
  globalThis.fetch = async () => new Response("<html>proxy error</html>", { status: 502 });
  await assert.rejects(api.myBookings(), /temporarily unavailable/);
  globalThis.fetch = async () => new Response("<html>bad success response</html>", { status: 200 });
  await assert.rejects(api.myBookings(), (err: Error) => {
    assert.match(err.message, /couldn't complete your request/);
    assert.doesNotMatch(err.message, /JSON|Unexpected token/);
    return true;
  });
});

test("payment errors describe uncertain payment status, never a failed booking or a retry payment", async () => {
  await i18n.changeLanguage("en");
  fail(503, "POK porosia ka rezultat të panjohur; verifikimi manual kërkohet para riprovimit.");
  await assert.rejects(api.initPokPayment("ABC"), (err: Error) => {
    assert.match(err.message, /Check your booking and payment status/);
    assert.doesNotMatch(err.message, /booking failed|try paying again|create.*booking/i);
    return true;
  });
  fail(502, "Could not verify payment with provider");
  await assert.rejects(api.verifyPokPayment("ABC", "order"), /couldn't confirm the payment status/);
  await i18n.changeLanguage("sq");
  fail(503, "order_not_found_requires_dashboard_reconciliation");
  await assert.rejects(api.verifyPokPayment("ABC", "order"), /Kontrolloni rezervimin dhe pagesën/);
});

test("network errors are safe and contextual; PDF fetch also sanitizes errors", async () => {
  await i18n.changeLanguage("en");
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch: secret URL"); };
  await assert.rejects(api.myBookings(), /check your connection/i);
  await assert.rejects(api.createBooking({}), /Check My Bookings before trying again/);
  await assert.rejects(api.initPokPayment("ABC"), /Check your booking and payment status/);
  fail(500, "select * from secret");
  await assert.rejects(api.downloadBookingPdf("ABC"), /temporarily unavailable/);
});