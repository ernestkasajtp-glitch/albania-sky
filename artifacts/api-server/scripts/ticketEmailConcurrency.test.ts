import assert from "node:assert/strict";
import { acquireTicketEmailSend } from "../src/lib/ticketEmailDelivery.js";

type DeliveryOutcome = "sent" | "failed" | "skipped";
type BookingState = {
  status: "confirmed" | "ticketed";
  ticketEmailPending: boolean;
  ticketEmailSentAt: Date | null;
};

const bookingId = 7301;

async function ticket(
  state: BookingState,
  deliver: () => Promise<DeliveryOutcome>,
): Promise<"ok" | "busy" | "conflict"> {
  const release = acquireTicketEmailSend(bookingId);
  if (!release) return "busy";
  try {
    if (state.status === "ticketed" && !state.ticketEmailPending) return "ok";
    if (state.status === "confirmed") {
      state.status = "ticketed";
      state.ticketEmailPending = true;
      state.ticketEmailSentAt = null;
    } else if (!state.ticketEmailPending) {
      return "conflict";
    }

    const outcome = await deliver();
    if (outcome === "sent" && state.status === "ticketed" && state.ticketEmailPending) {
      state.ticketEmailPending = false;
      state.ticketEmailSentAt = new Date();
    }
    return "ok";
  } finally {
    release();
  }
}

function ticketWithoutEmail(state: BookingState): "ok" | "conflict" {
  if (state.status === "ticketed") {
    return state.ticketEmailPending ? "ok" : "conflict";
  }
  state.status = "ticketed";
  state.ticketEmailPending = true;
  state.ticketEmailSentAt = null;
  return "ok";
}

// Two concurrent initial issue requests may produce at most one agent email.
{
  const state: BookingState = { status: "confirmed", ticketEmailPending: false, ticketEmailSentAt: null };
  let deliveries = 0;
  let unblock!: () => void;
  const blocked = new Promise<void>((resolve) => { unblock = resolve; });
  const first = ticket(state, async () => {
    deliveries++;
    await blocked;
    return "sent";
  });
  await Promise.resolve();
  const second = await ticket(state, async () => {
    deliveries++;
    return "sent";
  });
  assert.equal(second, "busy");
  unblock();
  assert.equal(await first, "ok");
  assert.equal(deliveries, 1);
  assert.equal(state.ticketEmailPending, false);
  assert.ok(state.ticketEmailSentAt);
}

// Two concurrent resend requests may also produce at most one agent email.
{
  const state: BookingState = { status: "ticketed", ticketEmailPending: true, ticketEmailSentAt: null };
  let deliveries = 0;
  let unblock!: () => void;
  const blocked = new Promise<void>((resolve) => { unblock = resolve; });
  const first = ticket(state, async () => {
    deliveries++;
    await blocked;
    return "sent";
  });
  await Promise.resolve();
  assert.equal(await ticket(state, async () => {
    deliveries++;
    return "sent";
  }), "busy");
  unblock();
  await first;
  assert.equal(deliveries, 1);
  assert.equal(state.ticketEmailPending, false);
}

// A failed or skipped delivery remains pending and can be retried.
for (const outcome of ["failed", "skipped"] as const) {
  const state: BookingState = { status: "confirmed", ticketEmailPending: false, ticketEmailSentAt: null };
  await ticket(state, async () => outcome);
  assert.equal(state.status, "ticketed");
  assert.equal(state.ticketEmailPending, true);
  assert.equal(state.ticketEmailSentAt, null);
}

// The no-email endpoint cannot turn a successfully sent ticket back into pending.
{
  const sentAt = new Date();
  const state: BookingState = { status: "ticketed", ticketEmailPending: false, ticketEmailSentAt: sentAt };
  assert.equal(ticketWithoutEmail(state), "conflict");
  assert.equal(state.ticketEmailPending, false);
  assert.equal(state.ticketEmailSentAt, sentAt);
}

console.log("ticket email concurrency tests: OK");