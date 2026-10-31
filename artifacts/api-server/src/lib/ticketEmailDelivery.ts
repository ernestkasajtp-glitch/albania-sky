import type { StatusEmailOutcome } from "./statusEmailOutcome.js";

const sendsInFlight = new Set<number>();

/**
 * Rezervon dërgimin për një booking brenda procesit të vetëm API.
 * Kthen null kur një dërgim për të njëjtin booking është tashmë aktiv.
 */
export function acquireTicketEmailSend(bookingId: number): (() => void) | null {
  if (sendsInFlight.has(bookingId)) return null;
  sendsInFlight.add(bookingId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    sendsInFlight.delete(bookingId);
  };
}

export function shouldKeepTicketEmailPending(outcome: StatusEmailOutcome): boolean {
  return outcome !== "sent";
}