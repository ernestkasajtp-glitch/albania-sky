/** Display filter only: use the existing server-provided balance, never recalculate it. */
export function isUnpaidBooking(booking: { status: string; dueAmount?: number | string | null }): boolean {
  const due = Number(booking.dueAmount);
  return booking.status !== "cancelled" && Number.isFinite(due) && due > 0;
}
