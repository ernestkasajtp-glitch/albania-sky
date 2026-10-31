import assert from "node:assert/strict";
import { createBookingRef, insertWithUniqueBookingRef } from "../src/lib/bookingRef.js";

assert.match(createBookingRef(), /^KTF\d{4}$/);
import {
  SAFE_BOOKING_CREATE_ERROR,
  bookingCreateErrorMessage,
} from "../../booking-engine/src/lib/bookingError.js";

const generatedRefs = ["KTF123456", "KTF654321"];
const attemptedRefs: string[] = [];

const booking = await insertWithUniqueBookingRef(
  async bookingRef => {
    attemptedRefs.push(bookingRef);
    if (bookingRef === "KTF123456") {
      throw {
        code: "23505",
        constraint: "bookings_booking_ref_unique",
        detail: "Key (booking_ref)=(KTF123456) already exists.",
      };
    }
    return { id: 42, bookingRef };
  },
  () => generatedRefs.shift()!,
);

assert.deepEqual(attemptedRefs, ["KTF123456", "KTF654321"]);
assert.deepEqual(booking, { id: 42, bookingRef: "KTF654321" });

const technicalServerError = new Error(
  'duplicate key value violates unique constraint "bookings_booking_ref_unique"',
) as Error & { status: number };
technicalServerError.status = 500;

const visibleMessage = bookingCreateErrorMessage(technicalServerError);
assert.equal(visibleMessage, SAFE_BOOKING_CREATE_ERROR);
assert.equal(visibleMessage.includes("duplicate key"), false);
assert.equal(visibleMessage.includes("bookings_booking_ref_unique"), false);

console.log("public booking collision tests: OK");