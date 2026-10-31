export type TicketedBookingChange = {
  kind: "passenger_name" | "pnr" | "ticket_price";
  label: string;
  oldValue: string;
  newValue: string;
};

export function ticketStatusEmailSubject(
  booking: { bookingRef?: string | null; customerName?: string | null },
  defaultSubject: string,
  changes: TicketedBookingChange[],
): string {
  const pnrChange = changes.find(change => change.kind === "pnr");
  if (pnrChange) {
    return `PNR Updated: ${booking.bookingRef} — ${pnrChange.oldValue} → ${pnrChange.newValue}`;
  }
  if (changes.length > 0) {
    return `Updated Ticket Details: ${booking.bookingRef} — ${booking.customerName}`;
  }
  return defaultSubject;
}

export function ticketStatusRecipientSubject(
  baseSubject: string,
  cpReference: string | null,
  changes: TicketedBookingChange[],
): string {
  if (changes.length > 0 || !cpReference) return baseSubject;
  return `${baseSubject} [${cpReference}]`;
}